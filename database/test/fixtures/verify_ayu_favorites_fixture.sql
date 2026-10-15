-- SCRUM-230: Verify the deterministic Favorites fixture against PostgreSQL.
-- Read-only checks for isolated test/CI databases. This file inserts no data.
-- Run after migrations, catalog seed, and the Favorites fixture.
-- With psql, use -v ON_ERROR_STOP=1 so a raised exception exits nonzero.

DO $$
DECLARE
    actual_count integer;
    joined_count integer;
BEGIN
    IF current_database() !~* '(^|_)test($|_)|(^|_)ci($|_)' THEN
        RAISE EXCEPTION
            'Refusing Favorites fixture verification outside a test/CI database: %',
            current_database();
    END IF;

    IF to_regclass('public.favorites') IS NULL THEN
        RAISE EXCEPTION 'Missing public.favorites: run database migrations first';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM users
        WHERE (id = 9900101 AND username = 'ayu_s3_fixture_a' AND role = 'user')
           OR (id = 9900102 AND username = 'ayu_s3_fixture_b' AND role = 'user')
    ) <> 2 THEN
        RAISE EXCEPTION 'Favorites fixture users are missing or have unexpected identities/roles';
    END IF;

    SELECT COUNT(*) INTO actual_count
    FROM favorites
    WHERE user_id IN (9900101, 9900102);

    IF actual_count <> 4 THEN
        RAISE EXCEPTION 'Expected exactly 4 fixture favorites; found %', actual_count;
    END IF;

    -- Set comparison checks each (user_id, track_id) association. A count
    -- alone would not catch an incorrect pair replacing an expected pair.
    IF EXISTS (
        SELECT expected.user_id, expected.track_id
        FROM (VALUES
            (9900101::bigint, 3001::bigint),
            (9900101::bigint, 3002::bigint),
            (9900102::bigint, 3002::bigint),
            (9900102::bigint, 3003::bigint)
        ) AS expected(user_id, track_id)
        EXCEPT
        SELECT f.user_id, f.track_id
        FROM favorites AS f
        WHERE f.user_id IN (9900101, 9900102)
    ) OR EXISTS (
        SELECT f.user_id, f.track_id
        FROM favorites AS f
        WHERE f.user_id IN (9900101, 9900102)
        EXCEPT
        SELECT expected.user_id, expected.track_id
        FROM (VALUES
            (9900101::bigint, 3001::bigint),
            (9900101::bigint, 3002::bigint),
            (9900102::bigint, 3002::bigint),
            (9900102::bigint, 3003::bigint)
        ) AS expected(user_id, track_id)
    ) THEN
        RAISE EXCEPTION 'Favorites fixture associations do not match the expected four pairs';
    END IF;

    -- Exercise the same relational path used by the Favorites read API.
    SELECT COUNT(*) INTO joined_count
    FROM favorites AS f
    JOIN tracks AS t ON t.id = f.track_id
    JOIN albums AS a ON a.id = t.album_id
    JOIN artists AS ar ON ar.id = a.artist_id
    WHERE f.user_id IN (9900101, 9900102)
      AND NULLIF(BTRIM(t.title), '') IS NOT NULL
      AND NULLIF(BTRIM(a.title), '') IS NOT NULL
      AND NULLIF(BTRIM(ar.name), '') IS NOT NULL;

    IF joined_count <> 4 THEN
        RAISE EXCEPTION
            'Expected 4 Favorites rows with valid track/album/artist metadata; found %',
            joined_count;
    END IF;

    RAISE NOTICE
        'PASS: Favorites fixture has 2 expected users, 4 exact associations, and 4 valid catalog joins in %',
        current_database();
END
$$;

