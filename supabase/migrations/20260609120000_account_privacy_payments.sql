-- Account screen v7: verification flags, accepted payment methods, and
-- the yard-sale address-privacy control.
--
-- email_verified defaults TRUE because Supabase Auth already requires a
-- confirmed email to sign in; phone_verified defaults FALSE until the
-- SMS OTP flow confirms a number.

alter table public.profiles
  add column if not exists email_verified    boolean not null default true,
  add column if not exists phone_verified    boolean not null default false,
  -- Methods the host accepts, surfaced on their sales so buyers come
  -- prepared. Free-form text[] (Cash, Venmo, Zelle, PayPal, Apple Pay,
  -- CashApp) rather than an enum so we can add options without a migration.
  add column if not exists accepted_payments text[] not null default '{}',
  -- How a host's exact address is exposed when they run a sale:
  --   'reply' = approximate (blurred circle) until the host messages a
  --             buyer back, then exact unlocks for that buyer.
  --   'live'  = exact pin while the sale is open, hidden after it ends.
  add column if not exists location_privacy  text not null default 'reply'
    check (location_privacy in ('reply', 'live')),
  -- Approximate blur radius in blocks for 'reply' mode (1/2/3/5).
  add column if not exists blur_radius_blocks int not null default 3;
