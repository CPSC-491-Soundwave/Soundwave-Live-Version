import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.js";
import { createCatalogService } from "../src/catalog/catalog.service.js";
import { createCatalogHandler } from "../src/catalog/catalog.handler.js";

const expectedTracks = [
    {
        id: 3004,
        title: "Fixture Track Four",
        durationMs: 222000,
        createdAt: "2026-09-24T12:00:00.000Z",
        album: {
            id: 2002,
            title: "Fixture Album Beta"
        },
        artist: {
            id: 1002,
            name: "Fixture Artist Two"
        }
    }
];

function createRepository() {
    return {
        async listTracks() {
            return [];
        },

        async listRecentlyAddedTracks() {
            return [
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
            ];
        }
    };
}

function createTestApp(repository) {
    const catalogService =
        createCatalogService(repository);

    const handleCatalogRequest =
        createCatalogHandler(catalogService);

    return createApp({
        handleCatalogRequest
    });
}

test(
    "GET /api/library/recently-added returns recently-added tracks",
    async (t) => {
        const server =
            createTestApp(createRepository());

        t.after(
            () =>
                new Promise((resolve) => {
                    server.close(resolve);
                })
        );

        await new Promise((resolve) => {
            server.listen(
                0,
                "127.0.0.1",
                resolve
            );
        });

        const address = server.address();

        assert.ok(address);
        assert.equal(
            typeof address,
            "object"
        );

        const response = await fetch(
            `http://127.0.0.1:${address.port}/api/library/recently-added`
        );

        assert.equal(
            response.status,
            200
        );

        assert.match(
            response.headers.get("content-type") ?? "",
            /application\/json/
        );

        const body =
            await response.json();

        assert.deepEqual(
            body,
            expectedTracks
        );
    }
);

test(
    "GET /api/library/recently-added returns 500 when retrieval fails",
    async (t) => {
        const repository = {
            async listTracks() {
                return [];
            },

            async listRecentlyAddedTracks() {
                throw new Error(
                    "simulated recently-added failure"
                );
            }
        };

        const server =
            createTestApp(repository);

        t.after(
            () =>
                new Promise((resolve) => {
                    server.close(resolve);
                })
        );

        await new Promise((resolve) => {
            server.listen(
                0,
                "127.0.0.1",
                resolve
            );
        });

        const address = server.address();

        assert.ok(address);
        assert.equal(
            typeof address,
            "object"
        );

        const response = await fetch(
            `http://127.0.0.1:${address.port}/api/library/recently-added`
        );

        assert.equal(
            response.status,
            500
        );

        const body =
            await response.json();

        assert.deepEqual(
            body,
            {
                error: "library_unavailable"
            }
        );
    }
);