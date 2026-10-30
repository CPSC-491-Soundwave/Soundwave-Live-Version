-- Matthew Choi | Soundwave | Sprint 4 | Isolated migration smoke test
-- Run only AFTER applying the proposed migration, against a development/test DB.
-- Transaction is rolled back so test fixtures are not retained.
-- Requires the existing users, artists, albums, tracks, playback_events tables.
BEGIN;

DO $test$
DECLARE
    fixture_user_id BIGINT;
    second_user_id BIGINT;
    fixture_artist_id BIGINT;
    fixture_album_id BIGINT;
    fixture_track_id BIGINT;
    actual_count INTEGER;
    latest_type TEXT;
BEGIN
    INSERT INTO users (username, password_hash, role)
    VALUES ('mc_s4_db_smoke_' || txid_current()::TEXT, 'fixture_not_a_real_password_hash', 'user')
    RETURNING id INTO fixture_user_id;

    INSERT INTO users (username, password_hash, role)
    VALUES ('mc_s4_db_smoke_other_' || txid_current()::TEXT, 'fixture_not_a_real_password_hash', 'user')
    RETURNING id INTO second_user_id;

    INSERT INTO artists (name) VALUES ('MC S4 test fixture artist')
    RETURNING id INTO fixture_artist_id;

    INSERT INTO albums (artist_id, title)
    VALUES (fixture_artist_id, 'MC S4 test fixture album')
    RETURNING id INTO fixture_album_id;

    INSERT INTO tracks (album_id, title, duration_ms)
    VALUES (fixture_album_id, 'MC S4 rights-cleared fixture reference', 1000)
    RETURNING id INTO fixture_track_id;

    INSERT INTO playback_events
        (client_event_id, user_id, track_id, event_type, occurred_at)
    VALUES
        ('11111111-1111-4111-8111-111111111111', fixture_user_id,
         fixture_track_id, 'play', '2026-10-29 20:00:00+00'),
        ('22222222-2222-4222-8222-222222222222', fixture_user_id,
         fixture_track_id, 'pause', '2026-10-29 20:01:00+00');

    SELECT COUNT(*) INTO actual_count
    FROM playback_events WHERE user_id = fixture_user_id;
    IF actual_count <> 2 THEN
        RAISE EXCEPTION 'Expected two fixture events, got %', actual_count;
    END IF;

    SELECT event_type INTO latest_type
    FROM playback_events WHERE user_id = fixture_user_id
    ORDER BY occurred_at DESC, id DESC LIMIT 1;
    IF latest_type <> 'pause' THEN
        RAISE EXCEPTION 'Chronology index/query returned %, expected pause', latest_type;
    END IF;

    -- Retry of an event must not create a second row for the same user/event UUID.
    BEGIN
        INSERT INTO playback_events
            (client_event_id, user_id, track_id, event_type, occurred_at)
        VALUES ('11111111-1111-4111-8111-111111111111', fixture_user_id,
                fixture_track_id, 'play', '2026-10-29 20:00:00+00');
        RAISE EXCEPTION 'Expected duplicate client event to be rejected';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    -- User and track associations must be referentially valid.
    BEGIN
        INSERT INTO playback_events
            (client_event_id, user_id, track_id, event_type, occurred_at)
        VALUES ('33333333-3333-4333-8333-333333333333', -1,
                fixture_track_id, 'play', NOW());
        RAISE EXCEPTION 'Expected invalid user reference to be rejected';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO playback_events
            (client_event_id, user_id, track_id, event_type, occurred_at)
        VALUES ('44444444-4444-4444-8444-444444444444', fixture_user_id,
                -1, 'play', NOW());
        RAISE EXCEPTION 'Expected invalid track reference to be rejected';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    -- A second user has no events in this fixture; query-level scoping works.
    -- This does NOT test whether the API enforces that scope.
    SELECT COUNT(*) INTO actual_count
    FROM playback_events WHERE user_id = second_user_id;
    IF actual_count <> 0 THEN
        RAISE EXCEPTION 'Expected no rows for second user, got %', actual_count;
    END IF;

    RAISE NOTICE 'PASS: valid insert, chronology, duplicate UUID, FK checks, and scoped query';
END;
$test$;

ROLLBACK;
