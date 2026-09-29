# Catalog ↔ Media Boundary

**Primary author:** Allison Yu  
**Sprint:** Sprint 1; Sprint 2 Artist/Album extension  
**Status:** Catalog-side contract

## Purpose

Define the stable handoff between Soundwave's catalog and future media/playback features without exposing storage or streaming implementation details.

## Canonical Track Identity

The canonical cross-feature track identifier is:

```text
tracks.id
```

Any feature that refers to a catalog track should use the same `track.id`.

Example:

```text
Catalog track ID: 3001
Downstream trackId: 3001
```

Current deterministic Sprint 1 fixture IDs:

```text
3001 - Fixture Track One
3002 - Fixture Track Two
3003 - Fixture Track Three
3004 - Fixture Track Four
```

## Current Catalog Contract

`GET /api/catalog/tracks` exposes the catalog track ID as `id`.

Example:

```json
{
  "id": 3001,
  "title": "Fixture Track One",
  "durationMs": 180000,
  "album": {
    "id": 2001,
    "title": "Fixture Album Alpha"
  },
  "artist": {
    "id": 1001,
    "name": "Fixture Artist One"
  }
}
```

The response `id` corresponds directly to `tracks.id`.

## Ownership Boundary

### Catalog owns

- Track identity
- Track title
- Catalog duration
- Artist relationship
- Album relationship
- Catalog read behavior

### Media / playback owns

- Resolving `trackId` to an audio resource
- Storage representation
- File availability checks
- Byte-range streaming
- Buffering
- Transcoding
- Media-specific errors
- Media authorization behavior when implemented

## Boundary Rule

The catalog provides:

```text
track.id
```

The media subsystem consumes:

```text
trackId
```

The catalog does **not** define how that ID maps to storage.

## Information the Catalog Must Not Expose

Sprint 1 catalog responses must not expose internal media details such as:

```text
filePath
mediaPath
storageKey
mediaId
local filesystem paths
```

A future media reference may be added only through an explicitly reviewed shared contract.

## API Independence

This contract defines track identity, not the final streaming route.

It does not require a specific endpoint such as:

```text
/api/tracks/:trackId/stream
```

Future media APIs may use the catalog track ID through a media-owned route.

## Metadata Ingestion

This contract does not define automatic conversion of file metadata into Artist, Album, or Track records.

Any future ingest workflow must separately define:

- metadata normalization
- duplicate handling
- duration conversion
- schema-write behavior

No metadata-to-catalog mapping is assumed in Sprint 1.

## Sprint 2 Artist / Album Extension

Sprint 2 extends the catalog-side boundary to Artist and Album browse/detail responses.

### Artist Detail

Endpoint:

```text
GET /api/catalog/artists/:id
```
Artist detail may expose:

```text
artist.id
artist.name
artist.albums[].id
artist.albums[].title
```

The Album relationship is catalog metadata and does not imply a media-storage relationship.

For the deterministic fixtures:

```text
Artist 1001 -> Album 2001
Artist 1002 -> Album 2002
```

## Album Detail

Endpoint:

```text
GET /api/catalog/albums/:id
```

Album detail may expose:

```text
album.id
album.title

album.artist.id
album.artist.name

album.tracks[].id
album.tracks[].title
album.tracks[].durationMs
```

For the deterministic fixtures:

```text
Album 2001
  -> Artist 1001
  -> Tracks 3001, 3002

Album 2002
  -> Artist 1002
  -> Tracks 3003, 3004
```

The Track objects embedded in Album Detail remain catalog metadata.
They do not provide storage or streaming information.

## Artist / Album HTTP Contract

```text
existing resource        -> 200
valid but missing ID     -> 404
malformed ID             -> 400
internal catalog failure -> 500 catalog_unavailable
```

Existing Artist and Album route tests verify these HTTP outcomes.

## Media Isolation

Artist and Album responses must continue to exclude media/storage implementation details including:

```text
filePath
mediaPath
storageKey
mediaId
streamUrl
local filesystem paths
```

The media subsystem remains responsible for resolving a catalog trackId to any playable resource.
Automated contract coverage is maintained in:

```text
server/test/catalog-media-contract.test.js
```

## Stability Rule

Once another feature consumes `tracks.id` as the track identity, changing the meaning of that identifier is a shared contract change and must be coordinated explicitly.

## Acceptance Criteria

- [x] `tracks.id` is documented as the canonical track identity.
- [x] Catalog `id` maps directly to `tracks.id`.
- [x] Downstream features consume track ID rather than storage details.
- [x] Catalog responses do not expose filesystem paths or storage internals.
- [x] Media storage and streaming remain media-owned concerns.
- [x] Existing `/api/catalog/tracks` behavior remains unchanged.
- [x] Artist detail preserves the Artist-to-Album catalog relationship.
- [x] Album detail preserves Artist and Track catalog relationships.
- [x] Artist and Album detail responses do not expose media-storage implementation details.
- [x] Existing Artist/Album `200`, `400`, `404`, and `500` endpoint behavior remains verified.
- [x] Automated contract tests remain green.