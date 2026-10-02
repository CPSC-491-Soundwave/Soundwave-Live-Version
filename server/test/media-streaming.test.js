import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { createApp } from "../src/app.js";

async function startTestServer(findTrackById) {
    const server = createApp({
        findTrackById,
    });

    server.listen(0);
    await once(server, "listening");

    const address = server.address();

    return {
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
    };
}

async function closeTestServer(server) {
    await new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

test("GET track stream without Range returns 200", async () => {
    const { server, baseUrl } = await startTestServer(
        async (trackId) => {
            if (trackId === 3005) {
                return {
                    track_id: 3005,
                    media_path: "mediaFiles/test.mp3",
                };
            }

            return null;
        }
    );

    try {
        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`
        );

        assert.equal(response.status, 200);

        assert.equal(
            response.headers.get("content-type"),
            "audio/mpeg"
        );

        assert.equal(
            response.headers.get("accept-ranges"),
            "bytes"
        );

        const body = await response.arrayBuffer();

        assert.ok(body.byteLength > 0);
    } finally {
        await closeTestServer(server);
    }
});

test("GET track stream with Range returns 206", async () => {
    const { server, baseUrl } = await startTestServer(
        async () => ({
            track_id: 3005,
            media_path: "mediaFiles/test.mp3",
        })
    );

    try {
        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: {
                    Range: "bytes=0-999",
                },
            }
        );

        assert.equal(response.status, 206);

        assert.equal(
            response.headers.get("accept-ranges"),
            "bytes"
        );

        assert.match(
            response.headers.get("content-range"),
            /^bytes 0-999\/\d+$/
        );

        assert.equal(
            Number(
                response.headers.get(
                    "content-length"
                )
            ),
            1000
        );

        const body =
            await response.arrayBuffer();

        assert.equal(
            body.byteLength,
            1000
        );
    } finally {
        await closeTestServer(server);
    }
});

test("invalid Range returns 416", async () => {
    const { server, baseUrl } = await startTestServer(
        async () => ({
            track_id: 3005,
            media_path: "mediaFiles/test.mp3",
        })
    );

    try {
        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: {
                    Range:
                        "bytes=999999999-",
                },
            }
        );

        assert.equal(
            response.status,
            416
        );

        assert.match(
            response.headers.get(
                "content-range"
            ),
            /^bytes \*\/\d+$/
        );

        await response.arrayBuffer();
    } finally {
        await closeTestServer(server);
    }
});

test("unknown track returns 404", async () => {
    const { server, baseUrl } = await startTestServer(
        async () => null
    );

    try {
        const response = await fetch(
            `${baseUrl}/api/tracks/999999/stream`
        );

        assert.equal(
            response.status,
            404
        );

        const body =
            await response.json();

        assert.deepEqual(
            body,
            {
                error: "track_not_found",
            }
        );
    } finally {
        await closeTestServer(server);
    }
});

test("track with missing media file returns 404", async () => {
    const { server, baseUrl } = await startTestServer(
        async () => ({
            track_id: 3005,
            media_path:
                "mediaFiles/does-not-exist.mp3",
        })
    );

    try {
        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`
        );

        assert.equal(
            response.status,
            404
        );

        const body =
            await response.text();

        assert.equal(
            body,
            "Audio file not found"
        );
    } finally {
        await closeTestServer(server);
    }
});