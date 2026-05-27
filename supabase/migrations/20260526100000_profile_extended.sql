-- Extended profile fields for identity, location, age verification,
-- and Terms of Service acceptance.
--
-- Compliance rationale:
--   • birthdate   → enforce 18+ minimum age across all US states
--   • terms_*     → record which version of the T&C the user accepted
--                   and when; required for Apple App Store UGC guidelines
--                   and general legal defensibility
--   • first/last  → real-identity signal, consistent with marketplace norms
--   • city/state/zip → general location for the seller profile card

alter table public.profiles
  add column if not exists first_name        text,
  add column if not exists last_name         text,
  add column if not exists city              text,
  add column if not exists state             text,   -- 2-letter US abbreviation
  add column if not exists zip_code          text,
  add column if not exists birthdate         date,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version     text;   -- e.g. 'v1'
