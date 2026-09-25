import assert from "node:assert/strict";
import test from "node:test";

import {
    createCatalogRepository
} from "../src/data/catalog.repository.js";

test(
    "listRecentlyAddedTracks orders by newest track and applies limit",
    async () => {
        let capturedSql;
        let capturedParameters;

        const database = {
            async query(sql, parameters) {
                capturedSql = sql;
                capturedParameters = parameters;

                return {
                    rows: [
                        {
                            track_id: "3004",
                            track_title: "Fixture Track Four",
                            duration_ms: 222000,
                            track_created_at:
                                "2026-09-24T12:00:00.000Z",
                            album_id: "2002",
                            album_title: "Fixture Album Beta",
                            artist_id: "1002",
                            artist_name: "Fixture Artist Two"
                        }
                    ]
                };
            }
        };

        const repository =
            createCatalogRepository(database);

        const rows =
            await repository.listRecentlyAddedTracks(5);

        assert.equal(rows.length, 1);

        assert.deepEqual(
            capturedParameters,
            [5]
        );

        assert.match(
            capturedSql,
            /t\.created_at\s+DESC/i
        );

        assert.match(
            capturedSql,
            /t\.id\s+DESC/i
        );

        assert.match(
            capturedSql,
            /LIMIT\s+\$1/i
        );
    }
);

test(
    "listRecentlyAddedTracks defaults to ten tracks",
    async () => {
        let capturedParameters;

        const database = {
            async query(_sql, parameters) {
                capturedParameters = parameters;

                return {
                    rows: []
                };
            }
        };

        const repository =
            createCatalogRepository(database);

        await repository.listRecentlyAddedTracks();

        assert.deepEqual(
            capturedParameters,
            [10]
        );
    }
);

test(
    "listRecentlyAddedTracks rejects invalid limits",
    async () => {
        const database = {
            async query() {
                throw new Error(
                    "database should not be called"
                );
            }
        };

        const repository =
            createCatalogRepository(database);

        await assert.rejects(
            repository.listRecentlyAddedTracks(0),
            {
                name: "TypeError"
            }
        );

        await assert.rejects(
            repository.listRecentlyAddedTracks(-1),
            {
                name: "TypeError"
            }
        );

        await assert.rejects(
            repository.listRecentlyAddedTracks(1.5),
            {
                name: "TypeError"
            }
        );
    }
);