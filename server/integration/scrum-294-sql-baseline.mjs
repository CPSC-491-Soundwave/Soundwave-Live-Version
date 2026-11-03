import pg from "pg";
const { Pool } = pg;

import { createCatalogRepository } from "../src/data/catalog.repository.js";

// SCRUM-294: Require an isolated PostgreSQL test database.
const databaseName = process.env.PGDATABASE ?? "";

if (!/test/i.test(databaseName)) {
    throw new Error(
        "SCRUM-294 requires a PGDATABASE containing 'test'."
    );
}

const REPETITIONS = 20;
const WARMUPS = 3;

const pool = new Pool();
const client = await pool.connect();

/*
 * Calculate median and nearest-rank p95.
 *
 * SCRUM-294 requires 20 measured executions.
 * Warm-up executions are excluded.
 */
function stats(values) {
    const ordered = [...values].sort(
        (a, b) => a - b
    );

    return {
        median: (ordered[9] + ordered[10]) / 2,

        p95_nearest_rank:
            ordered[
                Math.ceil(0.95 * ordered.length) - 1
            ],

        observations: values
    };
}

try {
    /*
     * Select a real seeded track with a media reference.
     *
     * Do not invent a Track ID or benchmark a
     * nonexistent media reference.
     */
    const eligible = await client.query(`
        SELECT id
        FROM tracks
        WHERE media_path IS NOT NULL
          AND btrim(media_path) <> ''
        ORDER BY id
        LIMIT 1
    `);

    if (!eligible.rows.length) {
        throw new Error(
            "BLOCKED: no seeded track has a nonempty media_path."
        );
    }

    const trackId = eligible.rows[0].id;

    let capturedStatement;
    let capturedParameters;

    /*
     * Use the real catalog repository.
     *
     * Capture its SQL and parameters so PostgreSQL
     * EXPLAIN analyzes the exact lookup being tested.
     */
    const repo = createCatalogRepository({
        query(statement, parameters) {
            capturedStatement = statement;
            capturedParameters = parameters;

            return client.query(
                statement,
                parameters
            );
        }
    });

    /*
     * Perform 3 warm-up executions.
     *
     * These do not contribute to latency statistics.
     */
    for (let n = 0; n < WARMUPS; n += 1) {
        const track = await repo.findTrackById(
            trackId
        );

        if (!track) {
            throw new Error(
                "BLOCKED: chosen track lookup returned null."
            );
        }
    }

    /*
     * Perform exactly 20 measured repository lookups.
     *
     * process.hrtime.bigint() provides high-resolution
     * elapsed time.
     */
    const samples = [];

    for (let n = 0; n < REPETITIONS; n += 1) {
        const startedAt = process.hrtime.bigint();

        const track = await repo.findTrackById(
            trackId
        );

        const elapsedMs =
            Number(
                process.hrtime.bigint() - startedAt
            ) / 1e6;

        if (!track) {
            throw new Error(
                "FAIL: lookup unexpectedly returned null."
            );
        }

        samples.push(elapsedMs);
    }

    /*
     * Capture the PostgreSQL execution plan.
     *
     * ANALYZE executes the SELECT query.
     * BUFFERS records buffer usage.
     * FORMAT JSON produces structured plan evidence.
     */
    const explained = await client.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${capturedStatement}`,
        capturedParameters
    );

    /*
     * Publish reproducible measurement evidence.
     *
     * This is the first measured baseline unless
     * earlier comparable measurements are supplied.
     */
    console.log(
        JSON.stringify(
            {
                jira: "SCRUM-294",

                observedAt:
                    new Date().toISOString(),

                database: databaseName,

                query:
                    "createCatalogRepository.findTrackById",

                querySql:
                    capturedStatement.trim(),

                trackId,

                warmups: WARMUPS,

                repetitions: REPETITIONS,

                nodeRoundTripMs: stats(samples),

                postgresExplain:
                    explained.rows[0]["QUERY PLAN"][0],

                baseline:
                    "Initial measured baseline; no prior comparable run supplied",

                disposition:
                    "MEASURED; performance change cannot be assessed without a comparison baseline"
            },
            null,
            2
        )
    );
} catch (error) {
    console.error(
        `SCRUM-294 characterization blocked/failed: ${error.message}`
    );

    process.exitCode = 1;
} finally {
    /*
     * Always release the database connection
     * and shut down the connection pool.
     */
    client.release();
    await pool.end();
}