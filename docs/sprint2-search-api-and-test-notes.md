# Soundwave Sprint 2 Search API and Test Notes

**Owner:** Christian McGowan  
**Course:** CPSC 491-05  
**Sprint:** Sprint 2 - Catalog + API  
**Primary feature:** Catalog search and filtering  
**Secondary role:** Test Lead

## Purpose

This document records the final Sprint 2 catalog-search contract, implementation boundaries, verification strategy, automated coverage, CI integration, and end-of-sprint evidence.

The search feature consumes the shared Soundwave catalog schema and existing Artist/Album routes without duplicating teammate-owned browse, account, media, or library implementations.

## Search Endpoint

Sprint 2 adds:

    GET /api/search?q=<query>&type=<type>

Supported search types:

    all
    track
    artist
    album

If `type` is omitted, the server uses:

    all

## Query Contract

`q` is required.

The server:

1. trims leading and trailing whitespace;
2. rejects an empty query after trimming;
3. accepts a maximum of 100 characters;
4. performs case-insensitive matching;
5. performs substring matching;
6. uses parameterized PostgreSQL statements.

Examples:

    GET /api/search?q=fixture
    GET /api/search?q=track&type=track
    GET /api/search?q=one&type=artist
    GET /api/search?q=alpha&type=album

## Successful Response Contract

Successful search responses always use the same grouped structure:

    {
      "query": "fixture",
      "tracks": [],
      "artists": [],
      "albums": []
    }

A filtered request still returns all three arrays. Non-selected groups remain empty.

### Track result

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

### Artist result

    {
      "id": 1001,
      "name": "Fixture Artist One"
    }

### Album result

    {
      "id": 2001,
      "title": "Fixture Album Alpha",
      "artist": {
        "id": 1001,
        "name": "Fixture Artist One"
      }
    }

## Validation and Error Behavior

Expected behavior:

    missing q        -> HTTP 400 invalid_search_query
    blank q          -> HTTP 400 invalid_search_query
    q > 100 chars    -> HTTP 400 invalid_search_query
    invalid type     -> HTTP 400 invalid_search_type
    no matches       -> HTTP 200 with empty grouped arrays
    repository error -> HTTP 500 search_unavailable

The GET-only search handler does not consume POST requests or unrelated search subroutes.

## Database Support

Search-specific database support is implemented in:

    database/migrations/20260927_cmg_001_catalog_search_support.sql

The migration enables PostgreSQL `pg_trgm` and creates GIN trigram indexes for:

    artists.name
    albums.title
    tracks.title

The existing catalog migrations were not edited.

## Search Implementation

Backend implementation:

    server/src/data/search.repository.js
    server/src/search/search.service.js
    server/src/search/search.handler.js

Frontend implementation:

    client/src/pages/Search.jsx
    client/src/pages/Search.css

Runtime path:

    React Search page
        |
        v
    GET /api/search
        |
        v
    search.handler.js
        |
        v
    search.service.js
        |
        v
    search.repository.js
        |
        v
    PostgreSQL

## Authentication and Visibility Decision

Sprint 2 search is public catalog discovery.

The current catalog search result set does not contain user-private or user-scoped information, so the search endpoint does not require a Bearer token.

This decision preserves the existing authentication boundary rather than creating a second JWT parser or client-supplied identity mechanism.

If future search visibility depends on user identity, the implementation should consume the established trusted principal from `authenticateRequest()` rather than accepting identity through query parameters or request bodies.

## Media and Playback Boundary

The canonical cross-feature track identity remains:

    tracks.id

Search returns stable catalog track IDs and safe catalog metadata.

Search does not return:

- filesystem paths;
- media paths;
- storage keys;
- server-local filenames;
- raw media bytes;
- playback storage implementation details.

Search identifies catalog tracks. The media subsystem remains responsible for resolving a track identity to an audio resource.

## Frontend Behavior

The `/search` page supports:

- initial state;
- search field;
- All / Tracks / Artists / Albums filter;
- loading state;
- grouped results;
- no-result state;
- controlled request-error state;
- client-side blank-query validation;
- artist-detail navigation;
- album-detail navigation;
- track duration display.

Existing `ArtistCard` and `AlbumCard` components are reused instead of duplicating teammate-owned UI.

## Automated Search Coverage

Dedicated server tests:

    server/test/search.repository.test.js
    server/test/search.service.test.js
    server/test/search-routes.test.js

Dedicated client tests:

    client/src/pages/Search.test.jsx

Database integration coverage is included in:

    database/test/catalog-db.integration.test.js

Search tests cover:

- parameterized repository queries;
- grouped result mapping;
- query trimming;
- track-only filtering;
- artist-only filtering;
- album-only filtering;
- invalid queries;
- over-length queries;
- invalid search types;
- successful grouped HTTP responses;
- no-result behavior;
- controlled server failure behavior;
- unrelated-route isolation;
- GET-only method behavior;
- Search page initial state;
- grouped result rendering;
- frontend filter requests;
- no-result UI;
- blank-search validation;
- request failure UI;
- migration recording;
- `pg_trgm` availability;
- trigram indexes;
- case-insensitive substring behavior.

## Final Sprint 2 Regression Result

After later teammate Sprint 2 work was merged into `main`, Christian resynchronized `christian-dev` and reran the complete shared verification suite.

Final verified result:

    Database: 31 passed, 0 failed
    Server:   125 passed, 0 failed
    Client:    25 passed, 0 failed
    Client lint: PASS
    Client build: PASS

The search-specific tests remained green after account-profile, media-persistence, and recently-added integration work was merged.

## CI Integration

Search regression coverage is protected by the shared CI workflow:

    Server Tests
    Client Tests
    Database Tests

Search does not require a redundant search-only CI job because the dedicated Search tests are automatically discovered by the normal package-level verification commands.

## Test Lead Evidence

Christian's Sprint 2 secondary role is Test Lead.

Sprint 2 Test Lead contributions include:

- adding the missing Client Tests CI gate;
- adding the PostgreSQL-backed Database Tests CI gate;
- preserving the existing Server Tests gate;
- maintaining shared zero-failure regression expectations;
- rerunning the complete database/server/client verification after teammate merges;
- verifying that Search remained compatible with later teammate integrations;
- recording current shared test totals and follow-up test-environment risks.

Current shared automated baseline:

    Database: 31 / 31
    Server:   125 / 125
    Client:    25 / 25

Observed follow-up risks:

- the local project currently uses Node.js 20.20.1 while `@testing-library/jest-dom` 7.0.1 reports a Node >=22 engine requirement;
- `npm ci` currently reports one high-severity client dependency vulnerability.

Both observations existed outside the Search implementation and are recorded as follow-up dependency/tooling work rather than silently changing another teammate's subsystem.

## Manual Verification

Manual verification performed during Sprint 2 included:

- grouped `fixture` search;
- track filter;
- artist filter;
- album filter;
- uppercase/case-insensitive query;
- no-result query;
- missing query;
- blank query;
- over-100-character query;
- invalid type;
- SQL-injection-style input treated as search data;
- GET-only method boundary;
- absence of media/storage-path leakage;
- Search browser result grouping;
- Artist navigation;
- Album navigation.

## Sprint 2 Demonstrable Result

The completed Sprint 2 slice can be demonstrated with:

1. `20260927_cmg_001_catalog_search_support.sql`;
2. `GET /api/search?q=fixture`;
3. track/artist/album filters;
4. the `/search` React page;
5. invalid-query and no-result behavior;
6. dedicated repository/service/route/UI/database tests;
7. package-level CI gates;
8. current shared regression totals;
9. the peer-reviewed Search/CI pull request;
10. GitHub Actions Build Metadata evidence.

## Jira Alignment

Primary Search work:

    SCRUM-102 - Catalog search and filtering

Sprint 2 subtasks:

    SCRUM-113 - Freeze API and filter contract
    SCRUM-114 - Add query-support database migration
    SCRUM-117 - Implement catalog search API
    SCRUM-118 - Apply principal and playable-track boundary
    SCRUM-120 - Build grouped Search page UI
    SCRUM-121 - Add automated search test suite
    SCRUM-122 - Add search integration gate to CI
    SCRUM-124 - Document API and sprint verification
