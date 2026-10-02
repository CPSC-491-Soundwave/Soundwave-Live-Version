# Library Recently-Added Integration Contract

## Purpose

The Sprint 2 Library recently-added integration provides authenticated Soundwave users with a browseable list of recently-added catalog tracks and connects those tracks to the shared playback flow.

This document defines the integration contract between the catalog repository, catalog service, authenticated Library API, Library client page, and shared playback selection path.

## Sprint 2 Scope

### In Scope

- Recently-added catalog track retrieval.
- Newest-first track ordering.
- Default recently-added result limit.
- Authenticated Library API access.
- Stable catalog track identity across backend and frontend layers.
- Library loading, success, empty, unauthorized, and error states.
- Recently-added track rendering in the Library.
- Selection of Library tracks for playback.
- Reuse of the shared application playback state.
- Docker Compose validation of the Library authentication boundary.

### Out of Scope

The following are intentionally outside this integration contract:

- User-created playlists.
- Saved/favorited track persistence.
- Per-user Library ownership.
- Library sorting controls.
- Library filtering controls.
- Pagination or infinite scrolling.
- Library-specific playback state.
- A second audio player implementation.
- Previous/next queue behavior.
- Editing track metadata.

## Recently-Added API

The Library client uses:

`GET /api/library/recently-added`

The endpoint returns recently-added catalog tracks for authenticated requests.

The route is protected by the existing Soundwave authentication boundary.

Expected authentication behavior:

- Valid authenticated request -> HTTP 200.
- Missing authentication -> HTTP 401.
- Invalid authentication -> HTTP 401.
- Retrieval failure -> controlled HTTP 500 response.

The endpoint must not expose authentication secrets, database credentials, or raw persistence errors.

## Authentication Contract

The Library API requires a Bearer access token.

The client sends the token using the standard authorization header:

```text
Authorization: Bearer <access-token>