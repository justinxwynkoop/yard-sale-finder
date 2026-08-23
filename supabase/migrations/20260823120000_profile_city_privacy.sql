-- Profile privacy: let a user hide their city/state from their public
-- profile (the "Local to ..." chip and the "City, ST · Joined ..." header
-- on PublicProfileScreen). profiles is world-readable by design, so a
-- UI-only toggle would still leak the values through the API — instead the
-- client MOVES city/state into owner-only private_profiles when hiding and
-- nulls the public columns (same pattern as the email/phone/birthdate/zip
-- PII split). These columns give the values a private home; show_city
-- records the preference so the Account screen can render the switch and
-- useUpdateProfile can route later city edits to the right table.
alter table public.private_profiles
  add column if not exists city      text,
  add column if not exists state     text,
  add column if not exists show_city boolean not null default true;
