-- Interest-list schema. Run once in the Supabase SQL Editor, or apply with
-- `supabase db push`. Row level security is on with no policies, and every
-- function is revoked from public/anon/authenticated, so only the Pages
-- Function's service role key can read or write anything here.

create table public.signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  investment_range text not null check (
    investment_range in ('under_500','500_2500','2500_10000','10000_plus','not_sure')
  ),
  acknowledged_nonbinding boolean not null default false,
  ip_address inet,
  user_agent text,
  confirmed boolean not null default false,
  confirm_token_hash text,
  -- Added to the brief's schema: tokens expire after 48 hours.
  confirm_token_expires_at timestamptz,
  confirmed_at timestamptz,
  flagged boolean not null default false,
  flag_reason text
);

create unique index signups_email_lower_idx on public.signups (lower(email));
create index signups_confirm_token_hash_idx on public.signups (confirm_token_hash)
  where confirm_token_hash is not null;

alter table public.signups enable row level security;
-- Intentionally no policies: anon and authenticated roles get no access.

-- Per-IP submission log for rate limiting. Cloudflare Pages Functions do not
-- support the Workers rate-limiting binding, so the limit lives here.
create table public.signup_attempts (
  id bigint generated always as identity primary key,
  ip_address inet not null,
  created_at timestamptz not null default now()
);
create index signup_attempts_ip_time_idx on public.signup_attempts (ip_address, created_at desc);
alter table public.signup_attempts enable row level security;

-- Records an attempt and reports whether this IP is still under the limit.
-- Old rows are pruned opportunistically so the table stays small.
create or replace function public.check_signup_rate_limit(
  p_ip inet,
  p_max integer default 5,
  p_window interval default interval '10 minutes'
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  delete from public.signup_attempts where created_at < now() - interval '1 day';
  insert into public.signup_attempts (ip_address) values (p_ip);
  select count(*) into recent
    from public.signup_attempts
   where ip_address = p_ip and created_at > now() - p_window;
  return recent <= p_max;
end;
$$;

-- Inserts a new sign-up, or decides what to do for an existing email.
-- Returns one of:
--   'created' - new row; send the confirmation email
--   'resend'  - unconfirmed row whose previous email is over 10 minutes old;
--               the token was rotated, so send a fresh email
--   'noop'    - already confirmed, or an email went out very recently
-- The API responds identically in all three cases, so the form can't be used
-- to discover who has signed up.
create or replace function public.register_signup(
  p_name text,
  p_email text,
  p_investment_range text,
  p_ip inet,
  p_user_agent text,
  p_token_hash text,
  p_flagged boolean,
  p_flag_reason text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.signups%rowtype;
begin
  select * into existing from public.signups where lower(email) = lower(p_email) for update;

  if not found then
    begin
      insert into public.signups (
        name, email, investment_range, acknowledged_nonbinding, ip_address, user_agent,
        confirm_token_hash, confirm_token_expires_at, flagged, flag_reason
      ) values (
        p_name, p_email, p_investment_range, true, p_ip, left(p_user_agent, 512),
        p_token_hash, now() + interval '48 hours', p_flagged, p_flag_reason
      );
      return 'created';
    exception when unique_violation then
      -- A concurrent request inserted the same email first.
      return 'noop';
    end;
  end if;

  if existing.confirmed then
    return 'noop';
  end if;

  -- Throttle re-sends so the form can't be used to email-bomb an address.
  if existing.confirm_token_expires_at is not null
     and existing.confirm_token_expires_at - interval '48 hours' > now() - interval '10 minutes' then
    return 'noop';
  end if;

  update public.signups
     set confirm_token_hash = p_token_hash,
         confirm_token_expires_at = now() + interval '48 hours'
   where id = existing.id;
  return 'resend';
end;
$$;

-- Confirms a sign-up by token hash. Returns 'confirmed', 'already', 'expired'
-- or 'invalid'.
create or replace function public.confirm_signup(p_token_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  row public.signups%rowtype;
begin
  select * into row from public.signups where confirm_token_hash = p_token_hash for update;
  if not found then
    return 'invalid';
  end if;
  if row.confirmed then
    return 'already';
  end if;
  if row.confirm_token_expires_at is null or row.confirm_token_expires_at < now() then
    return 'expired';
  end if;
  -- The hash is kept so a second click on the same link reports "already
  -- confirmed" instead of "invalid". It can't be reused to do anything else.
  update public.signups
     set confirmed = true,
         confirmed_at = now()
   where id = row.id;
  return 'confirmed';
end;
$$;

-- Supabase grants EXECUTE on public functions to anon/authenticated by default.
-- Revoke it so the browser-facing keys can never call these.
revoke all on function public.check_signup_rate_limit(inet, integer, interval) from public, anon, authenticated;
revoke all on function public.register_signup(text, text, text, inet, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.confirm_signup(text) from public, anon, authenticated;
grant execute on function public.check_signup_rate_limit(inet, integer, interval) to service_role;
grant execute on function public.register_signup(text, text, text, inet, text, text, boolean, text) to service_role;
grant execute on function public.confirm_signup(text) to service_role;
