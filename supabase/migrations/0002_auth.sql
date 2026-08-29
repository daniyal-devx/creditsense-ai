-- =============================================================================
-- 0002_auth.sql — Phase 2: Auth, Email & Access Control
-- =============================================================================
-- Our own auth, not Supabase Auth and not NextAuth. The lending role model is
-- specific enough that a generic identity provider would have to be fought
-- rather than configured.
--
-- Security decisions encoded in this schema:
--
--   * Nothing secret is ever stored in plain text. Passwords are bcrypt
--     hashes; verification codes and reset codes are SHA-256 hashes; session
--     tokens are stored as hashes of the token, never the token itself. If
--     this database leaks, none of it can be replayed.
--
--   * Sessions are rows, not just JWTs. A JWT alone cannot be revoked before
--     it expires, and "revoke this user's access right now" is a requirement
--     for a tool that can approve loans.
--
--   * Codes carry an attempt counter, so a six-digit code cannot be brute
--     forced in the ~1M guesses it would otherwise take.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
create table if not exists users (
  id                  uuid primary key default gen_random_uuid(),

  email               text        not null,
  -- Case-insensitive uniqueness: Ali@bank.pk and ali@bank.pk are one person.
  email_normalised    text        not null unique,

  full_name           text        not null,
  avatar_url          text,

  -- NULL for Google-only accounts, which have no password to hash.
  password_hash       text,

  role                text        not null default 'loan_officer' check (
                        role in ('loan_officer', 'risk_analyst', 'fraud_analyst', 'admin')
                      ),

  status              text        not null default 'unverified' check (
                        status in ('unverified', 'active', 'suspended')
                      ),

  email_verified_at   timestamptz,

  -- Which providers this account can sign in with. Google sign-in on an
  -- existing verified email links the provider rather than creating a
  -- duplicate account.
  auth_providers      text[]      not null default array['password']::text[],
  google_sub          text        unique,

  last_login_at       timestamptz,
  -- Bumping this invalidates every session and every issued token at once,
  -- which is how a password reset logs out other devices.
  sessions_valid_from timestamptz not null default now(),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint users_email_looks_valid check (email_normalised ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

  -- An account has to be reachable by *some* means of signing in.
  constraint users_has_a_login_method check (
    password_hash is not null or google_sub is not null
  ),

  -- A verified account must record when, and an unverified one must not claim to.
  constraint users_verification_is_consistent check (
    (status = 'unverified' and email_verified_at is null)
    or (status in ('active', 'suspended') and email_verified_at is not null)
  )
);

create index if not exists idx_users_role   on users (role);
create index if not exists idx_users_status on users (status);

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- sessions
-- -----------------------------------------------------------------------------
-- The JWT in the cookie is the credential; this row is the authority on
-- whether that credential is still good. Every request checks both.
create table if not exists sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid        not null references users (id) on delete cascade,

  -- SHA-256 of the session token. The token itself only ever exists in the
  -- user's cookie, so a database leak cannot be replayed as a login.
  token_hash      text        not null unique,

  expires_at      timestamptz not null,
  revoked_at      timestamptz,

  -- Shown on the "your active sessions" list and used for the new-device
  -- login alert.
  user_agent      text,
  ip_address      inet,

  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

create index if not exists idx_sessions_user    on sessions (user_id, created_at desc);
create index if not exists idx_sessions_expires on sessions (expires_at)
  where revoked_at is null;

-- -----------------------------------------------------------------------------
-- verification_codes
-- -----------------------------------------------------------------------------
-- Six digits, hashed, short-lived, attempt-capped. All four of those matter:
-- six digits is only a million possibilities, which is nothing without a cap.
create table if not exists verification_codes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        not null references users (id) on delete cascade,

  purpose       text        not null check (purpose in ('email_verification', 'password_reset')),

  code_hash     text        not null,
  expires_at    timestamptz not null,

  attempts      integer     not null default 0,
  max_attempts  integer     not null default 5,

  consumed_at   timestamptz,

  created_at    timestamptz not null default now(),

  constraint verification_codes_attempts_are_sane check (attempts >= 0 and max_attempts > 0)
);

create index if not exists idx_codes_user_purpose
  on verification_codes (user_id, purpose, created_at desc);
create index if not exists idx_codes_expiry on verification_codes (expires_at);

-- -----------------------------------------------------------------------------
-- login_attempts — rate limiting
-- -----------------------------------------------------------------------------
-- Keyed by identifier (email or IP) plus action, so a brute-force run against
-- one account cannot be hidden by rotating IPs, and one IP cannot spray many
-- accounts. Rows are pruned by the cleanup job.
create table if not exists login_attempts (
  id          bigserial primary key,
  identifier  text        not null,
  action      text        not null check (
                action in ('login', 'signup', 'verify_code', 'resend_code', 'password_reset')
              ),
  successful  boolean     not null default false,
  ip_address  inet,
  created_at  timestamptz not null default now()
);

create index if not exists idx_attempts_lookup
  on login_attempts (identifier, action, created_at desc);

-- -----------------------------------------------------------------------------
-- oauth_states — CSRF and PKCE for the Google flow
-- -----------------------------------------------------------------------------
-- Single-use, short-lived. Without the state check, an attacker can complete
-- an OAuth flow in a victim's browser and link their own Google account to the
-- victim's session.
create table if not exists oauth_states (
  state             text        primary key,
  code_verifier     text        not null,
  redirect_to       text,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  consumed_at       timestamptz
);

create index if not exists idx_oauth_states_expiry on oauth_states (expires_at);

-- -----------------------------------------------------------------------------
-- email_log — outbound mail, queued and retried
-- -----------------------------------------------------------------------------
-- A failed email must never break the signup transaction it belongs to: the
-- account is created, the send is recorded here, and a failure becomes a
-- retry rather than a lost registration.
create table if not exists email_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        references users (id) on delete set null,

  to_email      text        not null,
  template      text        not null check (
                  template in ('verification_code', 'welcome', 'password_reset', 'new_login_alert', 'test')
                ),
  subject       text        not null,

  status        text        not null default 'queued' check (
                  status in ('queued', 'sent', 'failed')
                ),
  attempts      integer     not null default 0,
  last_error    text,

  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

create index if not exists idx_email_log_status on email_log (status, created_at)
  where status in ('queued', 'failed');
create index if not exists idx_email_log_user   on email_log (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- audit_log — who did what, and when
-- -----------------------------------------------------------------------------
-- Append-only by convention: nothing in the application ever updates or
-- deletes a row here. A lending decision has to be reconstructable years
-- later, including the reasoning the officer recorded at the time.
create table if not exists audit_log (
  id            bigserial primary key,

  actor_id      uuid        references users (id) on delete set null,
  -- Denormalised on purpose. If the user is later deleted, the audit trail
  -- must still say who made the decision.
  actor_email   text,
  actor_role    text,

  action        text        not null,
  entity_type   text        not null,
  entity_id     text,

  -- Before/after, plus whatever context the action needs.
  details       jsonb       not null default '{}'::jsonb,

  ip_address    inet,
  user_agent    text,

  created_at    timestamptz not null default now()
);

create index if not exists idx_audit_created on audit_log (created_at desc);
create index if not exists idx_audit_actor   on audit_log (actor_id, created_at desc);
create index if not exists idx_audit_entity  on audit_log (entity_type, entity_id, created_at desc);
create index if not exists idx_audit_action  on audit_log (action, created_at desc);

-- -----------------------------------------------------------------------------
-- Cleanup for expired one-time material
-- -----------------------------------------------------------------------------
create or replace function purge_expired_auth_material()
returns table (deleted_codes bigint, deleted_states bigint, deleted_sessions bigint, deleted_attempts bigint)
language plpgsql
as $$
declare
  c bigint; s bigint; se bigint; a bigint;
begin
  delete from verification_codes
   where expires_at < now() - interval '1 day' or consumed_at is not null;
  get diagnostics c = row_count;

  delete from oauth_states where expires_at < now() - interval '1 hour';
  get diagnostics s = row_count;

  delete from sessions
   where expires_at < now() - interval '30 days'
      or (revoked_at is not null and revoked_at < now() - interval '30 days');
  get diagnostics se = row_count;

  -- Rate-limit history older than a day cannot affect any live window.
  delete from login_attempts where created_at < now() - interval '1 day';
  get diagnostics a = row_count;

  return query select c, s, se, a;
end;
$$;

-- -----------------------------------------------------------------------------
-- Applications can now name the user who decided them
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
     where constraint_name = 'applications_decided_by_fkey'
  ) then
    alter table applications
      add constraint applications_decided_by_fkey
      foreign key (decided_by) references users (id) on delete set null;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------
-- Same reasoning as the signal layer: our server is the trusted layer and
-- connects as postgres. Enabling RLS with no policies means the browser-safe
-- key gets nothing — which matters most of all for the table holding password
-- hashes and live session tokens.
alter table users              enable row level security;
alter table sessions           enable row level security;
alter table verification_codes enable row level security;
alter table login_attempts     enable row level security;
alter table oauth_states       enable row level security;
alter table email_log          enable row level security;
alter table audit_log          enable row level security;
