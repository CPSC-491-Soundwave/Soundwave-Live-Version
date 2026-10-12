import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import {
    mkdtemp,
    mkdir,
    rm,
    symlink,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";

import { createApp } from "../src/app.js";
import { createTokenService } from "../src/auth/token.js";

/*
 * All credentials are test-only. These use the real JWT verifier
 * and a local revocation-repository stub, not PostgreSQL.
 */
const TEST_JWT_SECRET = "soundwave-media-tests-only-not-production";
const tokenService = createTokenService(TEST_JWT_SECRET);
const validToken = tokenService.create_token({
    id: "media-test-user",
    role: "user"
});

const tokenRevocationRepository = {
    async isTokenRevoked() {
        return false;
    }
};

function authorizedFetch(url, options = {}) {
    return fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${validToken}`
        }
    });
}

async function assertNoMediaAccess(response, expectedStatus) {
    assert.equal(response.status, expectedStatus);
    assert.notEqual(response.headers.get("content-type"), "audio/mpeg");
    assert.equal(response.headers.get("accept-ranges"), null);

    const body = await response.json();
    assert.equal(typeof body.error, "string");
}

/*
 * Starts an isolated HTTP server with valid
 * authentication dependencies for each test.
 */
async function startTestServer(findTrackById, options = {}) {
    const server = createApp({
        tokenService,
        tokenRevocationRepository,
        findTrackById,
        ...options
    });

    server.listen(0);
    await once(server, "listening");

    return {
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`
    };
}

async function closeTestServer(server) {
    await new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

/*
 * Create an isolated temporary media directory.
 * Remove it automatically after the test.
 */
async function withTemporaryMediaRoot(callback) {
    const testDir = await mkdtemp(
        path.join(tmpdir(), "soundwave-streaming-")
    );

    const mediaRoot = path.join(testDir, "media");

    try {
        await mkdir(mediaRoot);
        await callback({ testDir, mediaRoot });
    } finally {
        await rm(testDir, {
            recursive: true,
            force: true
        });
    }
}

/*
 * Test unavailable and unsafe media paths.
 *
 * Requests are authenticated so the test
 * can reach the file-path validation logic.
 */
async function assertUnavailableMedia(mediaPath, mediaRoot) {
    const { server, baseUrl } = await startTestServer(
        async () => ({
            track_id: 3005,
            media_path: mediaPath
        }),
        { mediaRoot }
    );

    try {
        const response = await authorizedFetch(
            `${baseUrl}/api/tracks/3005/stream`
        );

        assert.equal(response.status, 404);
        assert.equal(
            await response.text(),
                     "Audio file not found"
        );
    } finally {
        await closeTestServer(server);
    }
}

/*
 * EXISTING STREAMING AND FILE-PATH TESTS
 *
 * Updated to use authenticated requests.
 */

test("GET track stream without Range returns 200", async () => {
    const { server, baseUrl } = await startTestServer(
        async (trackId) => trackId === 3005
        ? {
            track_id: 3005,
            media_path: "mediaFiles/test.mp3"
        }
        : null
    );

    try {
        const response = await authorizedFetch(
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
            media_path: "mediaFiles/test.mp3"
        })
    );

    try {
        const response = await authorizedFetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: {
                    Range: "bytes=0-999"
                }
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
            Number(response.headers.get("content-length")),
                     1000
        );

        const body = await response.arrayBuffer();
        assert.equal(body.byteLength, 1000);
    } finally {
        await closeTestServer(server);
    }
});

test("invalid Range returns 416", async () => {
    const { server, baseUrl } = await startTestServer(
        async () => ({
            track_id: 3005,
            media_path: "mediaFiles/test.mp3"
        })
    );

    try {
        const response = await authorizedFetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: {
                    Range: "bytes=999999999-"
                }
            }
        );

        assert.equal(response.status, 416);

        assert.match(
            response.headers.get("content-range"),
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
        const response = await authorizedFetch(
            `${baseUrl}/api/tracks/999999/stream`
        );

        assert.equal(response.status, 404);

        assert.deepEqual(await response.json(), {
            error: "track_not_found"
        });
    } finally {
        await closeTestServer(server);
    }
});

test("track with missing media file returns 404", async () => {
    const { server, baseUrl } = await startTestServer(
        async () => ({
            track_id: 3005,
            media_path: "mediaFiles/does-not-exist.mp3"
        })
    );

    try {
        const response = await authorizedFetch(
            `${baseUrl}/api/tracks/3005/stream`
        );

        assert.equal(response.status, 404);

        assert.equal(
            await response.text(),
                     "Audio file not found"
        );
    } finally {
        await closeTestServer(server);
    }
});

/*
 * MEDIA-ROOT SECURITY TESTS
 */

test("custom media root streams a relative media path", async () => {
    await withTemporaryMediaRoot(async ({ mediaRoot }) => {
        const tracksDir = path.join(mediaRoot, "tracks");

        await mkdir(tracksDir);

        /*
         * Synthetic HTTP fixture.
         * This is not a playable MP3.
         */
        const fixture = Buffer.from(
            "Soundwave synthetic media fixture"
        );

        await writeFile(
            path.join(tracksDir, "sample.mp3"),
                        fixture
        );

        const { server, baseUrl } = await startTestServer(
            async () => ({
                track_id: 3005,
                media_path: "tracks/sample.mp3"
            }),
            { mediaRoot }
        );

        try {
            const response = await authorizedFetch(
                `${baseUrl}/api/tracks/3005/stream`
            );

            assert.equal(response.status, 200);

            assert.deepEqual(
                Buffer.from(await response.arrayBuffer()),
                             fixture
            );

            const rangeResponse = await authorizedFetch(
                `${baseUrl}/api/tracks/3005/stream`,
                {
                    headers: {
                        Range: "bytes=0-3"
                    }
                }
            );

            assert.equal(rangeResponse.status, 206);

            assert.deepEqual(
                Buffer.from(await rangeResponse.arrayBuffer()),
                             fixture.subarray(0, 4)
            );
        } finally {
            await closeTestServer(server);
        }
    });
});

test("directory traversal outside media root returns 404", async () => {
    await withTemporaryMediaRoot(async ({ testDir, mediaRoot }) => {
        await writeFile(
            path.join(testDir, "outside.mp3"),
                        "Private test content"
        );

        await assertUnavailableMedia(
            "../outside.mp3",
            mediaRoot
        );
    });
});

test("absolute media path returns 404", async () => {
    await withTemporaryMediaRoot(async ({ testDir, mediaRoot }) => {
        const outsidePath = path.join(testDir, "outside.mp3");

        await writeFile(
            outsidePath,
            "Private test content"
        );

        await assertUnavailableMedia(
            outsidePath,
            mediaRoot
        );
    });
});

test("symlink escaping media root returns 404", async () => {
    await withTemporaryMediaRoot(async ({ testDir, mediaRoot }) => {
        const outsidePath = path.join(testDir, "outside.mp3");

        await writeFile(
            outsidePath,
            "Private test content"
        );

        await symlink(
            outsidePath,
            path.join(mediaRoot, "linked.mp3")
        );

        await assertUnavailableMedia(
            "linked.mp3",
            mediaRoot
        );
    });
});

test("relative media root configuration is rejected", () => {
    assert.throws(
        () => createApp({
            findTrackById: async () => null,
                        mediaRoot: "relative/media"
        }),
        {
            name: "TypeError",
            message: "mediaRoot must be an absolute directory path."
        }
    );
});

/*
 * NEW AUTHENTICATION TESTS — MC-T31
 *
 * Ensure unauthorized requests cannot
 * retrieve media or initiate track lookups.
 */

test("stream without authorization returns 401 before track lookup", async () => {
    let lookups = 0;

    const { server, baseUrl } = await startTestServer(
        async () => {
            lookups++;

            return {
                track_id: 3005,
                media_path: "mediaFiles/test.mp3"
            };
        }
    );

    try {
        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: {
                    Range: "bytes=0-999"
                }
            }
        );

        await assertNoMediaAccess(response, 401);

        assert.equal(
            response.headers.get("www-authenticate"),
                     "Bearer"
        );

        assert.equal(lookups, 0);
    } finally {
        await closeTestServer(server);
    }
});

test("stream with invalid Bearer token returns 401", async () => {
    let lookups = 0;

    const { server, baseUrl } = await startTestServer(
        async () => {
            lookups++;

            return {
                track_id: 3005,
                media_path: "mediaFiles/test.mp3"
            };
        }
    );

    try {
        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: {
                    Authorization: "Bearer invalid.token.value"
                }
            }
        );

        await assertNoMediaAccess(response, 401);
        assert.equal(lookups, 0);
    } finally {
        await closeTestServer(server);
    }
});

test("stream with expired JWT returns 401", async () => {
    const expiredToken = jwt.sign(
        {
            sub: "media-test-user",
            role: "user"
        },
        TEST_JWT_SECRET,
        {
            algorithm: "HS256",
            expiresIn: -1,
            jwtid: randomUUID()
        }
    );

    let lookups = 0;

    const { server, baseUrl } = await startTestServer(
        async () => {
            lookups++;

            return {
                track_id: 3005,
                media_path: "mediaFiles/test.mp3"
            };
        }
    );

    try {
        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: {
                    Authorization: `Bearer ${expiredToken}`
                }
            }
        );

        await assertNoMediaAccess(response, 401);
        assert.equal(lookups, 0);
    } finally {
        await closeTestServer(server);
    }
});

test("stream with revoked JWT returns 401", async () => {
    let lookups = 0;

    const { server, baseUrl } = await startTestServer(
        async () => {
            lookups++;

            return {
                track_id: 3005,
                media_path: "mediaFiles/test.mp3"
            };
        },
        {
            tokenRevocationRepository: {
                async isTokenRevoked() {
                    return true;
                }
            }
        }
    );

    try {
        const response = await authorizedFetch(
            `${baseUrl}/api/tracks/3005/stream`
        );

        await assertNoMediaAccess(response, 401);
        assert.equal(lookups, 0);
    } finally {
        await closeTestServer(server);
    }
});

test("revocation lookup failure denies streaming with 503", async () => {
    let lookups = 0;

    const { server, baseUrl } = await startTestServer(
        async () => {
            lookups++;

            return {
                track_id: 3005,
                media_path: "mediaFiles/test.mp3"
            };
        },
        {
            tokenRevocationRepository: {
                async isTokenRevoked() {
                    throw new Error(
                        "simulated_revocation_store_outage"
                    );
                }
            }
        }
    );

    try {
        const response = await authorizedFetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: {
                    Range: "bytes=0-999"
                }
            }
        );

        await assertNoMediaAccess(response, 503);
        assert.equal(lookups, 0);
    } finally {
        await closeTestServer(server);
    }
});
