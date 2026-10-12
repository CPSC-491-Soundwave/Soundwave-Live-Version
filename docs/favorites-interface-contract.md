# Soundwave — Favorites Read Interface Contract

**Author:** Allison Yu  
**Course:** CPSC 491-05 · Fall 2026  
**Jira:** SCRUM-231 — Contracts, PR Evidence, and Midterm Demo  
**Date:** October 12, 2026  
**Status:** Documentation of the merged Sprint 3 read-only implementation; not a proposal for new endpoints  
**Related Jira:** SCRUM-227 (schema/seed), SCRUM-228 (API/isolation), SCRUM-229 (React), SCRUM-230 (integration/CI).

## 1. Purpose, Scope, and Compatibility

This contract specifies the implemented end-to-end Favorites **read** boundary: PostgreSQL → Favorites repository → catalog service and HTTP handler → authenticated React Library → shared playback *selection* callback. Its purpose is to make interfaces, data shapes, ownership, failure behavior, and evidence explicit so teammates can integrate without changing each other's primary components.

**Included:** database relationship, principal-scoped read, HTTP request/response, error semantics, React props/states, track ID handoff.  
**Excluded:** favorite/unfavorite writes, standalone Favorites route or Library tab, album artwork delivery, interactive/filled-heart implementation, media authorization and playback reliability, deterministic CI seeding, exhaustive two-user isolation testing. These exclusions are tracked separately or deferred.

The CPSC 490 Soundwave roadmap establishes client-server architecture, secure access, user-specific Favorites data, reusable cards and persistent playback UI. It does **not** specify an exact Favorites URL, JSON schema, or contract-document format. This document records the actual Sprint 3 choices.

## 2. Contract A — PostgreSQL → Favorites Repository

**Producer:** PostgreSQL schema and catalog tables.  
**Consumer/author:** Allison's `server/src/data/favorites.repository.js`, called from the catalog repository.  
**Migration:** `database/migrations/20261011_ayu_003_user_favorites.sql`.

| Field | PostgreSQL type | Guarantee |
|---|---|---|
| `favorites.user_id` | `BIGINT NOT NULL` | Foreign key to `users.id`; delete cascades. |
| `favorites.track_id` | `BIGINT NOT NULL` | Foreign key to `tracks.id`; delete cascades. |
| `favorites.created_at` | `TIMESTAMPTZ NOT NULL` | Defaults to `CURRENT_TIMESTAMP`. |
| `(user_id, track_id)` | Composite primary key | A given user cannot favorite the same track twice. |
| `favorites_track_id_idx` | Index | Index on `track_id` exists. |

**Repository method:** `listForPrincipal(principalId)`; catalog repository exposes `listFavoritesForPrincipal(principalId)`. A valid principal ID is normalized and passed as a parameter to PostgreSQL. The query selects the user's Favorites only through `WHERE f.user_id = $1`, joins tracks/albums/artists, and orders by `f.created_at DESC, t.id ASC`. No user ID is accepted from the web client's query string or request body.

**Returned database columns (internal, not HTTP JSON):** `track_id`, `track_title`, `duration_ms`, `album_id`, `album_title`, `artist_id`, `artist_name`, `favorited_at`. The query does **not** select `media_path`.

**Observed verification:** `public.favorites` exists with the composite PK, index and FKs; development user `devuser` has ID 7; track 3005 (`Kontekst`) is in Favorites, associated with Buddha / No Copyright, and track 3001 was already a favorite. The manually inserted 3005 association is development data, **not evidence of a committed deterministic seed**.

## 3. Contract B — Authentication and HTTP Read API

**Producer:** Existing catalog service/handler using shared authentication and role/revocation boundary.  
**Consumer:** React `FavoritesSection.jsx` and other authorized HTTP clients.

```http
GET /api/library/favorites
Authorization: Bearer <access-token>
```

No body or client-chosen user ID is part of this contract. The shared authorization layer authenticates the JWT, checks revocation and allowed roles, and supplies the principal. Current production policy allows both `user` and `admin`. The handler calls `listFavoritesForPrincipal(principal.userId)`. The authenticated principal determines the rows returned.

### 3.1 Success response

**Status:** `200 OK`  
**Content type:** JSON  
**Top-level type:** Array; `[]` is a valid success response when no favorites exist.  
**Ordering:** Most recently favorited first, then ascending track ID on timestamp ties, according to the current SQL.

```ts
// Describes the implemented JSON contract (not TypeScript source code).
type FavoritesResponse = Array<{
  id: number;              // canonical tracks.id
  title: string;
  durationMs: number;      // milliseconds from track metadata
  favoritedAt: string;     // ISO date/time after JSON serialization
  album: { id: number; title: string };
  artist: { id: number; name: string };
}>;
```

Example content is illustrated by the live development result: track ID **3005**, title **Kontekst**, artist **Buddha**, album **No Copyright**, and `durationMs` **12345** (displayed as `0:12` by React). The actual `favoritedAt` timestamp must come from the database response, not a hardcoded example.

**Negative data contract:** The response must not include `media_path`, `storage_path`, `file_path`, credentials, tokens or other users' private data. The service maps SQL rows into the catalog track shape and does not return raw database records.

### 3.2 Response/error matrix

| Situation | Current behavior | React consumer behavior |
|---|---|---|
| Allowed authenticated principal, favorites exist | `200` + array of tracks | Render cards. |
| Allowed authenticated principal, no favorites | `200` + `[]` | Show `You have no favorite tracks yet.` |
| Missing, expired, invalid or revoked token | `401` | Show sign-in-again message. |
| Valid principal rejected by a role policy | `403` by shared authorization guard | Show permission message. **Not the normal response for existing user/admin roles**, which are both allowed. |
| Shared revocation dependency unavailable | `503` fail closed | Show temporary-unavailable state and Retry. |
| Favorites repository/service fails after authorization | `500` + `{"error":"library_unavailable"}` | Show unable-to-load state and Retry. |
| Network failure or invalid response shape | No valid response contract | Show error state and Retry. |

Authorization is **not** reimplemented inside `FavoritesSection`. Likewise, the frontend displays an expired-session message but does not redefine the shared login/logout lifecycle.

## 4. Contract C — API → React Library

**Producer:** `GET /api/library/favorites`.  
**Consumer/author:** `client/src/components/FavoritesSection.jsx` integrated by `client/src/pages/Library.jsx`.

```jsx
<FavoritesSection
  accessToken={accessToken}
  onSelectTrack={onSelectTrack}
/>
```

- The component makes a `GET` request with `Authorization: Bearer <accessToken>` when a token is available; no request is made while signed out.
- A successful JSON body must be an array. Each card displays title, artist, album, and, when valid, formatted duration.
- Supported states: signed out, loading, populated, empty, unauthorized (`401`), forbidden (`403`), unavailable (`503`), and other errors, with Retry where appropriate.
- Obsolete requests are aborted; results from an earlier token or retry must not replace the current response.
- Artwork is currently a presentational placeholder because no artwork URL is present in the Favorites read response.
- The existing heart icon is presentational; there is no favorite/unfavorite write endpoint or toggle in this contract.
- Library retains its separate Recently Added request. Failure of either section should not conceal the other.

## 5. Contract D — React Selection → Shared Playback

**Provider:** `FavoritesSection` invokes `onSelectTrack(track.id)` when a card is selected.  
**Consumer:** Existing `Library` → `App.setSelectedTrackId` → shared `PlaybackBar trackId` interface.

```text
FavoritesSection (canonical numeric tracks.id)
  -> Library onSelectTrack(track.id)
  -> App selectedTrackId
  -> PlaybackBar trackId
```

This contract guarantees **selection handoff**, not stream availability or successful audible playback. Track metadata may exist without a media file. It must not duplicate Matthew's shared player or Emmanuel's Search-to-Play implementation.

## 6. Ownership and Change Control

| Area | Existing ownership/boundary | SCRUM-231 contract rule |
|---|---|---|
| Favorites schema/read repository/API/React | Allison Yu | Document existing inputs, outputs and compatibility; no unreviewed contract changes. |
| JWT authorization, role checks and revocation | Shared auth work, including Christian McGowan's authorization boundary | Reuse verified principal; do not create a competing auth implementation. |
| Shared client navigation/session | Konner Rigby's shared client area | No standalone Favorites route or Library-tab change this sprint. |
| PlaybackBar and streaming | Matthew Choi's shared media/player area | Only transmit canonical selected track ID; do not change media pipeline. |
| Search-to-Play interface | Emmanuel De Guzman's feature area | Reuse the common selection seam; no second playback pathway. |

A future new Favorites payload field, artwork URL, Library tab, write endpoint, or change of track identifier requires a separate scoped ticket, consumer impact review and peer-reviewed PR. The specification is silent on exactly how optional artwork and favorite writes will be transported; no endpoint or artwork schema is invented here.

## 7. Evidence and Verification Matrix

| Contract clause | Evidence | Status as of Oct 12 |
|---|---|---|
| Schema exists and enforces associations | `psql`: `to_regclass`, `\d public.favorites`, users/favorites join | **Observed pass** |
| Live user Favorite is stored | `devuser` (ID 7), saved tracks 3001 and 3005 | **Observed pass** |
| Authenticated read succeeds | Browser DevTools `GET /api/library/favorites` → `200 OK` | **Observed pass** |
| Real catalog metadata reaches React | Kontekst / Buddha / No Copyright and Fixture Track One displayed | **Observed pass** |
| Consumer regression | Focused tests 17/17; full frontend 63/63; lint/build passed | **Observed pass** |
| Backend regression | 208/208 tests in earlier verification | **Previously reported pass** |
| No token rejected | Manual 401 result recorded in earlier checklist | **Reported pass; attach evidence** |
| Track ID selection reaches shared player | Earlier verification checklist / component tests | **Reported pass; attach evidence** |
| Real cross-user Favorites isolation | Two independently authenticated accounts with different favorites | **Not demonstrated by the single-user live test; track under SCRUM-228** |
| Deterministic CI seed/setup | Version-controlled fixture run in clean DB and CI | **Outstanding under SCRUM-227 / SCRUM-230** |

### Existing test entry points

From `server/`:

```bash
node --test test/favorites.repository.test.js
node --test test/catalog-favorites.repository.test.js
node --test test/catalog-favorites.service.test.js
node --test test/catalog-favorites-routes.test.js
```

From `client/`:

```bash
npx vitest run src/components/FavoritesSection.test.jsx src/pages/Library.favorites-integration.test.jsx src/App.navigation.test.jsx
npm test -- --run
npm run lint
npm run build
```

These are the implementation's existing focused contract/regression checks. A mocked two-principal route test is **not** a substitute for an independent two-user, live database exposure test.

## 8. Acceptance Criteria for SCRUM-231 — Contract Portion

- [x] Identify and document each producer/consumer boundary.
- [x] Specify the existing database relationship and canonical track ID.
- [x] Specify HTTP method, path, authentication, response shape and empty/error behavior.
- [x] Specify the client props, response validation and selection callback.
- [x] Explicitly document security and ownership exclusions.
- [x] Trace core contract claims to implementation files and observed demonstrations.
- [ ] Add the contract to the named individual Sprint 3 artifact or a reviewed repository documentation PR.
- [ ] Link the final contract and merged implementation PRs in SCRUM-231 Jira.
- [ ] Obtain any reviewer acknowledgment required by the Jira ticket or team before moving SCRUM-231 to Done.

**Scope statement:** Contract documentation is complete as a draft. The overall SCRUM-231 ticket additionally covers PR evidence and the midterm demo, so it should not be moved to Done solely because this contract has been drafted.

## 9. Reference Implementation Files

```text
database/migrations/20261011_ayu_003_user_favorites.sql
server/src/data/favorites.repository.js
server/src/data/catalog.repository.js
server/src/catalog/catalog.service.js
server/src/catalog/catalog.handler.js
server/src/app.js
client/src/components/FavoritesSection.jsx
client/src/pages/Library.jsx
client/src/App.jsx
server/test/favorites.repository.test.js
server/test/catalog-favorites.repository.test.js
server/test/catalog-favorites.service.test.js
server/test/catalog-favorites-routes.test.js
client/src/components/FavoritesSection.test.jsx
client/src/pages/Library.favorites-integration.test.jsx
client/src/App.navigation.test.jsx
```

**Merge traceability (complete from actual GitHub links):**

- SCRUM-227 migration: `[merged PR URL]`
- SCRUM-228 read API: `[merged PR URL]`
- SCRUM-229 React integration: `[merged PR URL]`
- SCRUM-231 Jira issue: `[Jira issue URL]`
- Named Google Doc / contract artifact: `[Google Doc URL]`

