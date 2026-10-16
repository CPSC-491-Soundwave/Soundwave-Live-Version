
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import {
    mkdtemp,
    mkdir,
    rm,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createApp } from "../src/app.js";
import {
    createMediaTicketService
} from "../src/media/media-ticket.js";

const MEDIA_SECRET =
"sprint3-independent-media-signing-key-for-tests";

const LOGIN_SECRET =
"sprint3-different-login-signing-key-for-tests";

const AUDIO = Buffer.from(
    Array.from({ length: 128 }, (_, i) => i)
);

async function withApp(callback) {
    const directory = await mkdtemp(
        path.join(tmpdir(), "soundwave-media-test-")
    );

    const mediaRoot = path.join(directory, "media");
    const sessionJti = randomUUID();

    let clockMs = Date.now();
    let revoked = false;
    let databaseDown = false;
    let trackLookups = 0;

    const sessionExpiration =
    Math.floor(clockMs / 1000) + 1800;

    try {
        await mkdir(mediaRoot);
        await writeFile(
            path.join(mediaRoot, "synthetic.mp3"),
                        AUDIO
        );

        const tokenService = {
            verify_token(value) {
                if (value !== "test-login-token") {
                    throw new Error("invalid_test_token");
                }

                return {
                    sub: "sample-user",
                    role: "user",
                    jti: sessionJti,
                    exp: sessionExpiration
                };
            }
        };

        const tokenRevocationRepository = {
            async isTokenRevoked(jti) {
                assert.equal(jti, sessionJti);

                if (databaseDown) {
                    throw new Error("simulated_database_outage");
                }

                return revoked;
            }
        };

        const mediaTicketService = createMediaTicketService({
            mediaSecret: MEDIA_SECRET,
            loginSecret: LOGIN_SECRET,
            secureCookies: false,
            now: () => clockMs
        });

        const server = createApp({
            tokenService,
            tokenRevocationRepository,
            mediaTicketService,
            mediaRoot,

            findTrackById: async (id) => {
                trackLookups++;

                if (id !== 3005 && id !== 3006) {
                    return null;
                }

                return {
                    track_id: id,
                    media_path: "synthetic.mp3"
                };
            }
        });

        server.listen(0, "127.0.0.1");
        await once(server, "listening");

        const baseUrl =
        `http://127.0.0.1:${server.address().port}`;

        try {
            await callback({
                baseUrl,
                setRevoked(value) {
                    revoked = value;
                },
                setDatabaseDown(value) {
                    databaseDown = value;
                },
                advanceClock(seconds) {
                    clockMs += seconds * 1000;
                },
                getTrackLookups() {
                    return trackLookups;
                }
            });
        } finally {
            await new Promise((resolve, reject) => {
                server.close(error =>
                error ? reject(error) : resolve()
                );
            });
        }
    } finally {
        await rm(directory, {
            recursive: true,
            force: true
        });
    }
}

async function issueCookie(baseUrl, trackId = 3005) {
    const response = await fetch(
        `${baseUrl}/api/tracks/${trackId}/media-access`,
        {
            method: "POST",
            headers: {
                Authorization: "Bearer test-login-token"
            }
        }
    );

    assert.equal(response.status, 204);

    const setCookie = response.headers.get("set-cookie");
    assert.ok(setCookie);

    return {
        setCookie,
        cookie: setCookie.split(";")[0]
    };
}

test("valid media cookie preserves HTTP Range streaming", async () => {
    await withApp(async ({ baseUrl }) => {
        const { cookie, setCookie } = await issueCookie(baseUrl);

        assert.match(setCookie, /HttpOnly/);
        assert.match(setCookie, /SameSite=Lax/);
        assert.match(
            setCookie,
            /Path=\/api\/tracks\/3005\/stream/
        );

        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: {
                    Cookie: cookie,
                    Range: "bytes=0-9"
                }
            }
        );

        assert.equal(response.status, 206);
        assert.equal(
            response.headers.get("content-range"),
                     "bytes 0-9/128"
        );

        assert.deepEqual(
            Buffer.from(await response.arrayBuffer()),
                         AUDIO.subarray(0, 10)
        );
    });
});

test("existing Bearer Range streaming still works", async () => {
    await withApp(async ({ baseUrl }) => {
        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: {
                    Authorization: "Bearer test-login-token",
                    Range: "bytes=4-7"
                }
            }
        );

        assert.equal(response.status, 206);

        assert.deepEqual(
            Buffer.from(await response.arrayBuffer()),
                         AUDIO.subarray(4, 8)
        );
    });
});

test("missing login JWT cannot issue media access", async () => {
    await withApp(async ({ baseUrl, getTrackLookups }) => {
        const response = await fetch(
            `${baseUrl}/api/tracks/3005/media-access`,
            { method: "POST" }
        );

        assert.equal(response.status, 401);
        assert.equal(response.headers.get("set-cookie"), null);
        assert.equal(getTrackLookups(), 0);
    });
});

test("media cookie cannot be used for another track", async () => {
    await withApp(async ({ baseUrl }) => {
        const { cookie } = await issueCookie(baseUrl, 3005);

        const response = await fetch(
            `${baseUrl}/api/tracks/3006/stream`,
            {
                headers: {
                    Cookie: cookie,
                    Range: "bytes=0-9"
                }
            }
        );

        assert.equal(response.status, 401);
    });
});

test("revoking login session invalidates media cookie", async () => {
    await withApp(async ({ baseUrl, setRevoked }) => {
        const { cookie } = await issueCookie(baseUrl);

        setRevoked(true);

        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: { Cookie: cookie }
            }
        );

        assert.equal(response.status, 401);
    });
});

test("revocation outage returns 503", async () => {
    await withApp(async ({ baseUrl, setDatabaseDown }) => {
        const { cookie } = await issueCookie(baseUrl);

        setDatabaseDown(true);

        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: { Cookie: cookie }
            }
        );

        assert.equal(response.status, 503);
    });
});

test("expired ticket can be renewed", async () => {
    await withApp(async ({ baseUrl, advanceClock }) => {
        const original = await issueCookie(baseUrl);

        advanceClock(301);

        const expired = await fetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: { Cookie: original.cookie }
            }
        );

        assert.equal(expired.status, 401);

        const renewed = await issueCookie(baseUrl);

        assert.notEqual(renewed.cookie, original.cookie);

        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: {
                    Cookie: renewed.cookie,
                    Range: "bytes=20-29"
                }
            }
        );

        assert.equal(response.status, 206);

        assert.deepEqual(
            Buffer.from(await response.arrayBuffer()),
                         AUDIO.subarray(20, 30)
        );
    });
});

test("bad Bearer token cannot fall back to media cookie", async () => {
    await withApp(async ({ baseUrl }) => {
        const { cookie } = await issueCookie(baseUrl);

        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: {
                    Authorization: "Bearer invalid",
                    Cookie: cookie
                }
            }
        );

        assert.equal(response.status, 401);
    });
});

test("media ticket cannot authenticate ordinary API routes", async () => {
    await withApp(async ({ baseUrl }) => {
        const { cookie } = await issueCookie(baseUrl);

        const response = await fetch(
            `${baseUrl}/auth/me`,
            {
                headers: { Cookie: cookie }
            }
        );

        assert.equal(response.status, 401);
    });
});


test("valid media cookie supports nonzero-byte Range seeking", async () => {
    await withApp(async ({ baseUrl }) => {
        const { cookie } = await issueCookie(baseUrl);

        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: {
                    Cookie: cookie,
                    Range: "bytes=32-47"
                }
            }
        );

        // A valid authenticated Range request
        // must return Partial Content.
        assert.equal(response.status, 206);

        // Verify the exact byte boundaries.
        assert.equal(
            response.headers.get("content-range"),
                     "bytes 32-47/128"
        );

        // Bytes 32 through 47 inclusive = 16 bytes.
        assert.equal(
            response.headers.get("content-length"),
                     "16"
        );

        // Verify HTTP byte-range support.
        assert.equal(
            response.headers.get("accept-ranges"),
                     "bytes"
        );

        // Verify the response identifies MP3 audio.
        assert.match(
            response.headers.get("content-type"),
                     /audio\/mpeg/
        );

        // Verify that the returned bytes match
        // the requested portion of the fixture.
        const receivedBytes = Buffer.from(
            await response.arrayBuffer()
        );

        const expectedBytes = AUDIO.subarray(32, 48);

        assert.equal(receivedBytes.length, 16);

        assert.deepEqual(
            receivedBytes,
            expectedBytes
        );
    });
});

test("unauthenticated nonzero-byte Range seeking is rejected", async () => {
    await withApp(async ({ baseUrl, getTrackLookups }) => {
        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`,
            {
                headers: {
                    Range: "bytes=32-47"
                }
            }
        );

        // Unauthenticated clients must not
        // retrieve protected audio.
        assert.equal(response.status, 401);

        // No valid audio range should be returned.
        assert.equal(
            response.headers.get("content-range"),
                     null
        );

        // The response must be an error response,
        // not audio data.
        assert.match(
            response.headers.get("content-type"),
                     /application\/json/
        );

        // Authorization must fail before the
        // server accesses Track information.
        assert.equal(getTrackLookups(), 0);
    });
});
