-- AY-S3-01: TEST DATABASE ONLY. NOT read by database/seed.js.
-- Uses Argon2id hashes from non-retained random input. These accounts
-- intentionally cannot be used for a documented login/demo password.
-- Two deterministic user identities; their favorites differ and overlap.
-- Requires pre-existing catalog fixture tracks 3001, 3002, 3003.

DO $$
BEGIN
    IF current_database() !~* '(^|_)test($|_)|(^|_)ci($|_)' THEN
        RAISE EXCEPTION 'Refusing to install test-only favorites users in %', current_database();
    END IF;
    IF (SELECT COUNT(*) FROM tracks WHERE id IN (3001, 3002, 3003)) <> 3 THEN
        RAISE EXCEPTION 'Expected catalog fixtures 3001, 3002, 3003 are missing';
    END IF;
END
$$;

-- OVERRIDING SYSTEM VALUE allows fixed fixture IDs even when users.id
-- is GENERATED ALWAYS AS IDENTITY. User IDs are isolated test-only values.
INSERT INTO users (id, username, password_hash, role)
OVERRIDING SYSTEM VALUE
VALUES
    (9900101, 'ayu_s3_fixture_a', '$argon2id$v=19$m=10240,t=2,p=2$br9dHqID6BS89goVD3gm2A$xvRj+QLGuLVJ2eLOB4aECRr0G3m99VXI74QSJeVR2WM', 'user'),
    (9900102, 'ayu_s3_fixture_b', '$argon2id$v=19$m=10240,t=2,p=2$e5ccYo4ApTIGAnmAs1cAaQ$jh0bqx7VRqcFZSVy1nX8RbFzMbVm7eOLiUsPni+ZsIc', 'user')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = 9900101 AND username = 'ayu_s3_fixture_a')
       OR NOT EXISTS (SELECT 1 FROM users WHERE id = 9900102 AND username = 'ayu_s3_fixture_b') THEN
        RAISE EXCEPTION 'Favorites test user ID conflict or missing user';
    END IF;
END
$$;

INSERT INTO favorites (user_id, track_id)
VALUES
    (9900101, 3001),
    (9900101, 3002),
    (9900102, 3002),
    (9900102, 3003)
ON CONFLICT (user_id, track_id) DO NOTHING;

