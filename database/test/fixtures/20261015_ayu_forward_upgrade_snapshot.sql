
-- AY-T32: Capture historical database records before forward migration.
--
-- Historical baseline commit: 731d674
-- Target database: soundwave_ayu_forward_test
--
-- Run AFTER:
--   1. Applying the five historical migrations.
--   2. Seeding the historical catalog.
--   3. Loading the forward-upgrade baseline fixture.
--
-- Run BEFORE applying the Sprint 3 migrations.
--
-- This file must never execute on a production database.

BEGIN;

-- --------------------------------------------------
-- 1. Validate the historical baseline.
-- --------------------------------------------------

DO $$
BEGIN
    IF current_database() <> 'soundwave_ayu_forward_test' THEN
        RAISE EXCEPTION
            'AY-T32: Incorrect database: %',
            current_database();
    END IF;

    -- Require the original tables.
    IF to_regclass('public.users') IS NULL
       OR to_regclass('public.tracks') IS NULL
       OR to_regclass('public.albums') IS NULL
       OR to_regclass('public.artists') IS NULL
       OR to_regclass('public.user_preferences') IS NULL
    THEN
        RAISE EXCEPTION
            'AY-T32: Historical schema is incomplete';
    END IF;

    -- These tables must not exist until the upgrade.
    IF to_regclass('public.favorites') IS NOT NULL
       OR to_regclass('public.revoked_access_tokens') IS NOT NULL
    THEN
        RAISE EXCEPTION
            'AY-T32: Sprint 3 migrations have already been applied';
    END IF;

    -- Require precisely the five historical migrations.
    IF (
        SELECT COUNT(*)
        FROM public.schema_migrations
    ) <> 5
    OR (
        SELECT COUNT(*)
        FROM public.schema_migrations
        WHERE filename IN (
            '20260915_ayu_001_catalog_core.sql',
            '20260916_ayu_002_auth_users.sql',
            '20260924_edg_001_user_preferences.sql',
            '20260927_cmg_001_catalog_search_support.sql',
            'trackMediaPath.sql'
        )
    ) <> 5 THEN
        RAISE EXCEPTION
            'AY-T32: Historical migration ledger does not match commit 731d674';
    END IF;

    -- Require the deterministic historical user.
    IF NOT EXISTS (
        SELECT 1
        FROM public.users
        WHERE id = 9900201
          AND username = 'ayu_forward_upgrade_fixture'
          AND role = 'user'
    ) THEN
        RAISE EXCEPTION
            'AY-T32: Historical fixture user is missing';
    END IF;

    -- Require the catalog fixture used by the read tests.
    IF (
        SELECT COUNT(*)
        FROM public.tracks
        WHERE id IN (3001, 3002, 3003)
    ) <> 3 THEN
        RAISE EXCEPTION
            'AY-T32: Historical catalog fixture is incomplete';
    END IF;

    -- Never overwrite a previous audit snapshot.
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace
        WHERE nspname = 'ayu_forward_audit'
    ) THEN
        RAISE EXCEPTION
            'AY-T32: Audit schema already exists; refusing to overwrite';
    END IF;
END $$;

-- --------------------------------------------------
-- 2. Create the audit schema.
-- --------------------------------------------------

CREATE SCHEMA ayu_forward_audit;

-- --------------------------------------------------
-- 3. Preserve the historical migration ledger.
-- --------------------------------------------------

CREATE TABLE ayu_forward_audit.baseline_migrations AS
SELECT
    filename,
    applied_at
FROM public.schema_migrations;

-- --------------------------------------------------
-- 4. Create the original-table inventory.
-- --------------------------------------------------

CREATE TABLE ayu_forward_audit.baseline_tables (
    table_name TEXT PRIMARY KEY,
    row_count BIGINT NOT NULL
);

-- --------------------------------------------------
-- 5. Create the historical record snapshot.
-- --------------------------------------------------

CREATE TABLE ayu_forward_audit.baseline_rows (
    table_name TEXT NOT NULL,
    row_data JSONB NOT NULL
);

-- --------------------------------------------------
-- 6. Preserve authentication-data fingerprints.
-- --------------------------------------------------

CREATE TABLE
    ayu_forward_audit.baseline_user_auth_fingerprints
AS
SELECT
    id,
    md5(password_hash) AS password_hash_fingerprint
FROM public.users;

ALTER TABLE
    ayu_forward_audit.baseline_user_auth_fingerprints
ADD PRIMARY KEY (id);

-- The MD5 value above is only an equality fingerprint
-- for this isolated migration test. It is not used
-- for password hashing or application authentication.

-- --------------------------------------------------
-- 7. Snapshot every historical public data table.
-- --------------------------------------------------

DO $$
DECLARE
    original_table RECORD;
    original_count BIGINT;
BEGIN
    FOR original_table IN
        SELECT tablename
        FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
          AND tablename <> 'schema_migrations'
        ORDER BY tablename
    LOOP
        -- Record the original number of rows.
        EXECUTE format(
            'SELECT COUNT(*) FROM public.%I',
            original_table.tablename
        )
        INTO original_count;

        INSERT INTO ayu_forward_audit.baseline_tables (
            table_name,
            row_count
        )
        VALUES (
            original_table.tablename,
            original_count
        );

        -- Record all original column values except
        -- the stored password hash.
        --
        -- The separate fingerprint table verifies
        -- that password hashes remain unchanged.

        EXECUTE format(
            'INSERT INTO ayu_forward_audit.baseline_rows
                (table_name, row_data)
             SELECT %L, to_jsonb(t) - %L
             FROM public.%I AS t',
            original_table.tablename,
            'password_hash',
            original_table.tablename
        );

        RAISE NOTICE
            'AY-T32 SNAPSHOT: % (% rows)',
            original_table.tablename,
            original_count;
    END LOOP;
END $$;

-- --------------------------------------------------
-- 8. Validate the completed snapshot.
-- --------------------------------------------------

DO $$
DECLARE
    saved_table_count BIGINT;
    saved_migration_count BIGINT;
    saved_user_count BIGINT;
BEGIN
    SELECT COUNT(*)
    INTO saved_table_count
    FROM ayu_forward_audit.baseline_tables;

    SELECT COUNT(*)
    INTO saved_migration_count
    FROM ayu_forward_audit.baseline_migrations;

    SELECT COUNT(*)
    INTO saved_user_count
    FROM ayu_forward_audit.baseline_user_auth_fingerprints;

    IF saved_table_count <> 5 THEN
        RAISE EXCEPTION
            'AY-T32: Expected five historical data tables; found %',
            saved_table_count;
    END IF;

    IF saved_migration_count <> 5 THEN
        RAISE EXCEPTION
            'AY-T32: Expected five historical migrations';
    END IF;

    IF saved_user_count <> 1 THEN
        RAISE EXCEPTION
            'AY-T32: Expected one historical fixture account';
    END IF;

    RAISE NOTICE
        'PASS: historical schema snapshot captured';

    RAISE NOTICE
        'PASS: five historical migration records saved';

    RAISE NOTICE
        'PASS: five historical data tables inventoried';

    RAISE NOTICE
        'PASS: authentication fingerprint captured';
END $$;

COMMIT;
