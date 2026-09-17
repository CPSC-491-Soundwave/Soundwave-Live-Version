# Deterministic Catalog Fixtures

**Primary author:** Allison Yu  
**Sprint:** Sprint 1  
**Source of truth:** `database/seeds/20260915_ayu_catalog_seed.sql`

## Purpose

Soundwave uses a small deterministic catalog dataset for local development, integration testing, API testing, frontend work, and cross-feature coordination.

The fixture IDs below are intentionally stable so teammates can refer to the same Artist, Album, and Track records without creating conflicting test data.

## Seed Commands

From the `database` directory:

```powershell
npm run db:seed
```

For the dedicated test database:

```powershell
npm run db:seed:test
```

Apply migrations before seeding.

## Fixture Relationships

```text
Fixture Artist One (1001)
└── Fixture Album Alpha (2001)
    ├── Fixture Track One (3001)   — 180000 ms
    └── Fixture Track Two (3002)   — 205000 ms

Fixture Artist Two (1002)
└── Fixture Album Beta (2002)
    ├── Fixture Track Three (3003) — 195000 ms
    └── Fixture Track Four (3004)  — 222000 ms
```

## Artists

| ID | Name |
|---:|---|
| 1001 | Fixture Artist One |
| 1002 | Fixture Artist Two |

## Albums

| ID | Title | Artist ID |
|---:|---|---:|
| 2001 | Fixture Album Alpha | 1001 |
| 2002 | Fixture Album Beta | 1002 |

## Tracks

| ID | Title | Album ID | Artist ID | Duration |
|---:|---|---:|---:|---:|
| 3001 | Fixture Track One | 2001 | 1001 | 180000 ms |
| 3002 | Fixture Track Two | 2001 | 1001 | 205000 ms |
| 3003 | Fixture Track Three | 2002 | 1002 | 195000 ms |
| 3004 | Fixture Track Four | 2002 | 1002 | 222000 ms |

## Intended Use

These fixtures may be used for:

- local development;
- database integration tests;
- API contract tests;
- frontend integration;
- search/filter testing;
- artist and album browse testing;
- media/playback integration using `track.id`;
- cross-feature demonstrations.

Examples:

```text
track 3001 → known existing track
album 2001 → known album with multiple tracks
artist 1001 → known artist with an album and tracks
```

## Stability Rules

The fixture IDs are shared development/test contracts.

Do not silently renumber or repurpose:

```text
1001-1002
2001-2002
3001-3004
```

If another feature already depends on a fixture, changing that fixture is a cross-feature contract change.

## Production-Code Rule

Fixture IDs may be hardcoded in tests, but not in production feature logic.

Acceptable:

```text
integration test loads track 3001
```

Not acceptable:

```text
application always assumes track 3001 exists
```

Production code should operate on IDs supplied by normal application data and APIs.

## Adding New Fixtures

Add a new deterministic fixture only when a real integration or testing need exists.

A new fixture should:

1. use an explicit stable ID;
2. preserve valid Artist → Album → Track relationships;
3. avoid collisions with existing fixture IDs;
4. remain safe to seed repeatedly;
5. be documented here;
6. be covered by relevant tests.

Do not modify an existing fixture just to satisfy a new test scenario when adding a new fixture is safer.

## Repeatability

The seed is intended to be rerunnable without creating duplicate logical fixtures.

The seed implementation is responsible for keeping PostgreSQL identity sequences synchronized after inserting explicit fixture IDs.

## Authentication Boundary

This catalog fixture set does not define shared authentication users, plaintext passwords, or reusable credentials.

Authentication test data remains separate from the catalog seed.

## Source of Truth

If this document and the SQL seed disagree, the reviewed SQL seed is the implementation source of truth:

```text
database/seeds/20260915_ayu_catalog_seed.sql
```

Update this document to match the seed after any approved fixture change.
