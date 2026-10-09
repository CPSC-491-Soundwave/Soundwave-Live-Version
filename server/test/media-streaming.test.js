
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import {
    mkdtemp,
    mkdir,
    rm,
    symlink,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createApp } from "../src/app.js";

/*
 * Starts an isolated HTTP server for each test.
 *
 * The optional options argument allows tests to inject
 * a custom mediaRoot into createApp().
 */
async function startTestServer(
    findTrackById,
    options = {}
) {
    const server = createApp({
        findTrackById,
        ...options
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

/*
 * Create an isolated temporary media directory.
 * It is removed automatically after each test.
 */
async function withTemporaryMediaRoot(callback) {
    const testDir = await mkdtemp(
        path.join(
            tmpdir(),
                  "soundwave-streaming-"
        )
    );

    const mediaRoot = path.join(
        testDir,
        "media"
    );

    try {
        await mkdir(mediaRoot);

        await callback({
            testDir,
            mediaRoot
        });
    } finally {
        await rm(testDir, {
            recursive: true,
            force: true
        });
    }
}

/*
 * Verify that an unsafe or unavailable media path
 * returns the existing 404 response contract.
 */
async function assertUnavailableMedia(
    mediaPath,
    mediaRoot
) {
    const { server, baseUrl } =
    await startTestServer(
        async () => ({
            track_id: 3005,
            media_path: mediaPath
        }),
        {
            mediaRoot
        }
    );

    try {
        const response = await fetch(
            `${baseUrl}/api/tracks/3005/stream`
        );

        assert.equal(
            response.status,
            404
        );

        assert.equal(
            await response.text(),
                     "Audio file not found"
        );
    } finally {
        await closeTestServer(server);
    }
}

/*
 * EXISTING STREAMING TESTS
 */

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

/*
 * NEW MEDIA-ROOT AND SECURITY TESTS
 */

test(
    "custom media root streams a relative media path",
     async () => {
         await withTemporaryMediaRoot(
             async ({ mediaRoot }) => {
                 const tracksDir = path.join(
                     mediaRoot,
                     "tracks"
                 );

                 await mkdir(tracksDir);

                 /*
                  * Synthetic bytes are sufficient for
                  * HTTP transport testing. This is not
                  * intended as a playable MP3.
                  */
                 const fixture = Buffer.from(
                     "Soundwave synthetic media fixture"
                 );

                 await writeFile(
                     path.join(
                         tracksDir,
                         "sample.mp3"
                     ),
                     fixture
                 );

                 const { server, baseUrl } =
                 await startTestServer(
                     async () => ({
                         track_id: 3005,
                         media_path:
                         "tracks/sample.mp3"
                     }),
                     {
                         mediaRoot
                     }
                 );

                 try {
                     const response = await fetch(
                         `${baseUrl}/api/tracks/3005/stream`
                     );

                     assert.equal(
                         response.status,
                         200
                     );

                     assert.deepEqual(
                         Buffer.from(
                             await response.arrayBuffer()
                         ),
                         fixture
                     );

                     const rangeResponse = await fetch(
                         `${baseUrl}/api/tracks/3005/stream`,
                         {
                             headers: {
                                 Range: "bytes=0-3"
                             }
                         }
                     );

                     assert.equal(
                         rangeResponse.status,
                         206
                     );

                     assert.deepEqual(
                         Buffer.from(
                             await rangeResponse.arrayBuffer()
                         ),
                         fixture.subarray(0, 4)
                     );
                 } finally {
                     await closeTestServer(server);
                 }
             }
         );
     }
);

test(
    "directory traversal outside media root returns 404",
     async () => {
         await withTemporaryMediaRoot(
             async ({ testDir, mediaRoot }) => {
                 await writeFile(
                     path.join(
                         testDir,
                         "outside.mp3"
                     ),
                     "Private test content"
                 );

                 await assertUnavailableMedia(
                     "../outside.mp3",
                     mediaRoot
                 );
             }
         );
     }
);

test(
    "absolute media path returns 404",
     async () => {
         await withTemporaryMediaRoot(
             async ({ testDir, mediaRoot }) => {
                 const outsidePath = path.join(
                     testDir,
                     "outside.mp3"
                 );

                 await writeFile(
                     outsidePath,
                     "Private test content"
                 );

                 await assertUnavailableMedia(
                     outsidePath,
                     mediaRoot
                 );
             }
         );
     }
);

test(
    "symlink escaping media root returns 404",
     async () => {
         await withTemporaryMediaRoot(
             async ({ testDir, mediaRoot }) => {
                 const outsidePath = path.join(
                     testDir,
                     "outside.mp3"
                 );

                 await writeFile(
                     outsidePath,
                     "Private test content"
                 );

                 const linkPath = path.join(
                     mediaRoot,
                     "linked.mp3"
                 );

                 await symlink(
                     outsidePath,
                     linkPath
                 );

                 await assertUnavailableMedia(
                     "linked.mp3",
                     mediaRoot
                 );
             }
         );
     }
);

test(
    "relative media root configuration is rejected",
     () => {
         assert.throws(
             () => createApp({
                 findTrackById:
                 async () => null,
                             mediaRoot:
                             "relative/media"
             }),
             {
                 name: "TypeError",
                 message:
                 "mediaRoot must be an absolute directory path."
             }
         );
     }
);
