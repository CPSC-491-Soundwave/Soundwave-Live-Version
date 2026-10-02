import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { createApp } from "../src/app.js";

import {
    createCatalogService
} from "../src/catalog/catalog.service.js";

import {
    createCatalogHandler
} from "../src/catalog/catalog.handler.js";

async function startServer(repository) {
    const catalogService =
    createCatalogService(repository);

    const handleCatalogRequest =
    createCatalogHandler(
        catalogService
    );

    const server =
    createApp({
        handleCatalogRequest
    });

    server.listen(0);

    await once(
        server,
        "listening"
    );

    const address =
    server.address();

    return {
        server,
        baseUrl:
        `http://127.0.0.1:${address.port}`
    };
}

function createRepository(
    overrides = {}
) {
    return {
        async listTracks() {
            return [];
        },

        async findTrackById(trackId) {
            if (trackId !== 3005) {
                return null;
            }

            return {
                track_id: 3005,
                track_title: "Kontekst",
                duration_ms: 209136,
                media_path:
                "mediaFiles/test.mp3",
                album_id: 2003,
                album_title: "No Copyright",
                artist_id: 1003,
                artist_name: "Buddha"
            };
        },

        ...overrides
    };
}

test(
    "GET /api/catalog/tracks/:id returns Track metadata",
     async () => {
         const {
             server,
             baseUrl
         } = await startServer(
             createRepository()
         );

         try {
             const response =
             await fetch(
                 `${baseUrl}/api/catalog/tracks/3005`
             );

             assert.equal(
                 response.status,
                 200
             );

             assert.equal(
                 response.headers.get(
                     "content-type"
                 ),
                 "application/json; charset=utf-8"
             );

             const body =
             await response.json();

             assert.deepEqual(
                 body,
                 {
                     id: 3005,
                     title: "Kontekst",
                     durationMs: 209136,

                     album: {
                         id: 2003,
                         title: "No Copyright"
                     },

                     artist: {
                         id: 1003,
                         name: "Buddha"
                     }
                 }
             );
         } finally {
             server.close();
         }
     }
);

test(
    "GET /api/catalog/tracks/:id does not expose media_path",
     async () => {
         const {
             server,
             baseUrl
         } = await startServer(
             createRepository()
         );

         try {
             const response =
             await fetch(
                 `${baseUrl}/api/catalog/tracks/3005`
             );

             assert.equal(
                 response.status,
                 200
             );

             const body =
             await response.json();

             assert.equal(
                 Object.hasOwn(
                     body,
                     "media_path"
                 ),
                 false
             );

             assert.equal(
                 Object.hasOwn(
                     body,
                     "mediaPath"
                 ),
                 false
             );
         } finally {
             server.close();
         }
     }
);

test(
    "GET /api/catalog/tracks/:id returns 404 for a missing Track",
     async () => {
         const {
             server,
             baseUrl
         } = await startServer(
             createRepository()
         );

         try {
             const response =
             await fetch(
                 `${baseUrl}/api/catalog/tracks/999999`
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
                     error: "track_not_found"
                 }
             );
         } finally {
             server.close();
         }
     }
);

test(
    "GET /api/catalog/tracks/:id returns 400 for an invalid Track ID",
     async () => {
         const {
             server,
             baseUrl
         } = await startServer(
             createRepository()
         );

         try {
             const response =
             await fetch(
                 `${baseUrl}/api/catalog/tracks/not-a-number`
             );

             assert.equal(
                 response.status,
                 400
             );

             const body =
             await response.json();

             assert.deepEqual(
                 body,
                 {
                     error: "invalid_track_id"
                 }
             );
         } finally {
             server.close();
         }
     }
);

test(
    "GET /api/catalog/tracks/:id returns 500 when Track retrieval fails",
     async () => {
         const repository =
         createRepository({
             async findTrackById() {
                 throw new Error(
                     "simulated Track lookup failure"
                 );
             }
         });

         const {
             server,
             baseUrl
         } = await startServer(
             repository
         );

         try {
             const response =
             await fetch(
                 `${baseUrl}/api/catalog/tracks/3005`
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
                     error: "catalog_unavailable"
                 }
             );
         } finally {
             server.close();
         }
     }
);
