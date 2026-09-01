-- Record which platform a push token belongs to.
--
-- Nothing in the schema distinguishes an iOS device from an Android one. That
-- has been harmless while Trove is iOS-only, but it stops being harmless the
-- day the Play build ships: no way to split crash rates, no way to check
-- whether an OTA actually reached Android, no way to answer "how many of our
-- users are on Android" -- and that last one is a question worth being able
-- to answer BEFORE launch, not after.
--
-- Expo push tokens do not encode the platform, so it has to be recorded at
-- registration time from the client's Platform.OS.

alter table public.user_push_tokens
  add column if not exists platform text;

alter table public.user_push_tokens
  drop constraint if exists user_push_tokens_platform_ck;
alter table public.user_push_tokens
  add constraint user_push_tokens_platform_ck
  check (platform is null or platform in ('ios', 'android', 'web'));

comment on column public.user_push_tokens.platform is
  'ios | android | web, from the client Platform.OS at registration. Null for rows written before this column existed.';

-- Replaced rather than overloaded: two functions differing only by an
-- optional argument would leave PostgREST to pick between them. Dropping and
-- recreating inside one migration is atomic, and a client on an older bundle
-- calling set_push_token({p_token}) still resolves to this one because
-- p_platform has a default.
drop function if exists public.set_push_token(text);

create or replace function public.set_push_token(
  p_token text,
  p_platform text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if p_token is null or length(p_token) = 0 then
    return;
  end if;
  if p_platform is not null and p_platform not in ('ios', 'android', 'web') then
    raise exception 'invalid platform: %', p_platform;
  end if;

  -- Unchanged: Expo tokens are per-DEVICE, so strip this token off any other
  -- account first, or a device that has signed into two accounts keeps
  -- notifying the wrong one.
  delete from public.user_push_tokens
  where token = p_token and user_id <> auth.uid();

  insert into public.user_push_tokens (user_id, token, platform, updated_at)
  values (auth.uid(), p_token, p_platform, now())
  on conflict (user_id) do update
    set token = excluded.token,
        -- coalesce, not overwrite: a client on an older bundle sends no
        -- platform, and that must not erase one already recorded.
        platform = coalesce(excluded.platform, user_push_tokens.platform),
        updated_at = now();
end;
$fn$;
