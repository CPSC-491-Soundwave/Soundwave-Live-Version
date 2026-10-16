-- AY-T32: seed a PRE-Sprint-3 database for populated-schema upgrade testing.
-- Run AFTER pre-S3 migrations and catalog seed, BEFORE applying S3 migrations.
-- Database is deliberately separate from Soundwave's usual dev/CI databases.
-- Example: psql -v ON_ERROR_STOP=1 -f database/test/fixtures/20261015_ayu_forward_upgrade_baseline.sql

DO $$
BEGIN
  IF current_database() <> 'soundwave_ayu_forward_test' THEN
    RAISE EXCEPTION 'Refusing to seed migration rehearsal in database %', current_database();
  END IF;

  IF to_regclass('public.users') IS NULL OR
     to_regclass('public.tracks') IS NULL OR
     to_regclass('public.albums') IS NULL OR
     to_regclass('public.artists') IS NULL THEN
    RAISE EXCEPTION 'Expected populated pre-S3 catalog and auth schema is missing';
  END IF;

  IF to_regclass('public.favorites') IS NOT NULL OR
     to_regclass('public.revoked_access_tokens') IS NOT NULL THEN
    RAISE EXCEPTION 'Expected a pre-S3 baseline without Sprint 3 tables';
  END IF;

  IF (SELECT COUNT(*) FROM public.tracks WHERE id IN (3001, 3002, 3003)) <> 3 THEN
    RAISE EXCEPTION 'Expected seeded baseline catalog tracks 3001, 3002 and 3003';
  END IF;
END
$$;

-- Test-only account with a fixed identity and a non-retained password.
-- Hash is a synthetic fixture value, not a credential for a real user.
INSERT INTO public.users (id, username, password_hash, role)
OVERRIDING SYSTEM VALUE
VALUES (
  9900201,
  'ayu_forward_upgrade_fixture',
  '$argon2id$v=19$m=10240,t=2,p=2$br9dHqID6BS89goVD3gm2A$xvRj+QLGuLVJ2eLOB4aECRr0G3m99VXI74QSJeVR2WM',
  'user'
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = 9900201
      AND username = 'ayu_forward_upgrade_fixture'
      AND role = 'user'
  ) THEN
    RAISE EXCEPTION 'Baseline account missing or ID 9900201 has a conflicting identity';
  END IF;

  RAISE NOTICE 'PASS: populated pre-S3 baseline ready in %', current_database();
END
$$;
