# Catalog ↔ Media Boundary

**Primary author:** Allison Yu  
**Sprint:** Sprint 1  
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

## Stability Rule

Once another feature consumes `tracks.id` as the track identity, changing the meaning of that identifier is a shared contract change and must be coordinated explicitly.

## Acceptance Criteria

- [ ] `tracks.id` is documented as the canonical track identity.
- [ ] Catalog `id` maps directly to `tracks.id`.
- [ ] Downstream features consume track ID rather than storage details.
- [ ] Catalog responses do not expose filesystem paths or storage internals.
- [ ] Media storage and streaming remain media-owned concerns.
- [ ] Existing `/api/catalog/tracks` behavior remains unchanged.
- [ ] Automated contract tests remain green.
