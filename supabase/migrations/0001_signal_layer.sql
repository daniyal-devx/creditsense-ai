-- =============================================================================
-- 0001_signal_layer.sql — Phase 1: Digital Signal Data Layer
-- =============================================================================
-- The foundation of the whole product. A thin-file applicant has no bureau
-- record, so everything a lender can know about them has to be reconstructed
-- from the digital exhaust they already generate: wallet transactions, mobile
-- top-ups, and utility bill payments.
--
-- Design notes that apply throughout:
--
--   * Status-like columns are `text` with a CHECK constraint rather than a
--     Postgres ENUM. Adding a value to an enum needs ALTER TYPE and cannot run
--     inside a transaction with other DDL on some managed platforms; a CHECK is
--     a one-line change and behaves identically for our purposes.
--
--   * Money is `numeric(14,2)`, never float. A rounding drift of a fraction of
--     a rupee across an instalment schedule is a real defect in a lending
--     system.
--
--   * Every timestamp is `timestamptz`. Pakistan is UTC+5 with no DST, but
--     storing naive local time still breaks the moment anything is queried
--     from a server in another region — which Vercel and Supabase both are.
--
--   * Indexes are deliberately narrow and aimed at the two access patterns we
--     actually have: "everything for one customer over a window" (the feature
--     engine) and "recent activity across all customers" (the portfolio).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Migration bookkeeping
-- -----------------------------------------------------------------------------
create table if not exists schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now(),
  checksum    text
);

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- customers — the applicant, and the identity signals attached to them
-- =============================================================================
create table if not exists customers (
  id                        uuid primary key default gen_random_uuid(),

  full_name                 text        not null,
  -- 13 digits, no dashes. Unique because one person is one customer.
  cnic                      text        not null unique,
  phone                     text        not null,
  email                     text,
  date_of_birth             date        not null,
  gender                    text        not null check (gender in ('male', 'female', 'other')),

  city                      text        not null,
  province                  text        not null,
  address                   text,

  -- What they actually do for money. `persona` is the archetype the seed
  -- generated them from and the label the demo narrative uses.
  occupation                text        not null,
  persona                   text        not null check (
                              persona in ('freelancer', 'shopkeeper', 'driver', 'online_seller')
                            ),
  employment_type           text        not null check (
                              employment_type in ('self_employed', 'gig', 'informal_salaried', 'micro_business')
                            ),

  -- What the applicant *says* they earn. Deliberately separate from what the
  -- wallet data shows — the gap between the two is itself a signal.
  declared_monthly_income   numeric(14,2),

  household_size            integer     check (household_size between 1 and 30),
  dependents                integer     check (dependents >= 0),
  education_level           text,

  primary_wallet            text        not null check (
                              primary_wallet in ('jazzcash', 'easypaisa', 'raast')
                            ),
  -- Account tenure is one of the strongest thin-file signals we have.
  wallet_opened_at          date        not null,

  -- Identity signals FraudSense (Phase 5) builds its relationship graph from.
  device_fingerprint        text,
  sim_registered_at         date,

  -- The whole point: these people are invisible to a traditional bureau.
  has_bank_loan_history     boolean     not null default false,
  bureau_score              integer     check (bureau_score between 0 and 1000),

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint customers_cnic_is_13_digits check (cnic ~ '^[0-9]{13}$'),
  constraint customers_dependents_fit_household
    check (dependents is null or household_size is null or dependents < household_size)
);

create index if not exists idx_customers_persona    on customers (persona);
create index if not exists idx_customers_city       on customers (city);
create index if not exists idx_customers_device     on customers (device_fingerprint)
  where device_fingerprint is not null;
create index if not exists idx_customers_phone      on customers (phone);

drop trigger if exists trg_customers_updated_at on customers;
create trigger trg_customers_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- =============================================================================
-- applications — a request for credit awaiting a decision
-- =============================================================================
create table if not exists applications (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid        not null references customers (id) on delete cascade,

  -- Human-readable handle. This is what a loan officer reads out on the phone.
  reference             text        not null unique,

  requested_amount      numeric(14,2) not null check (requested_amount > 0),
  requested_tenor_months integer      not null check (requested_tenor_months between 1 and 60),
  purpose               text        not null,

  status                text        not null default 'pending' check (
                          status in ('pending', 'in_review', 'approved', 'rejected', 'withdrawn')
                        ),

  channel               text        not null default 'mobile_app' check (
                          channel in ('mobile_app', 'agent', 'ussd', 'web')
                        ),

  submitted_at          timestamptz not null default now(),
  decided_at            timestamptz,
  -- FK added in Phase 2 once the users table exists.
  decided_by            uuid,
  decision_notes        text,

  -- Captured at submission. Phase 5 compares these across applications to
  -- surface applications that share a device or an address.
  device_fingerprint    text,
  ip_address            inet,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- A decision must record when it was made, and a pending one must not claim to.
  constraint applications_decision_is_consistent check (
    (status in ('pending', 'in_review') and decided_at is null)
    or (status in ('approved', 'rejected', 'withdrawn') and decided_at is not null)
  )
);

create index if not exists idx_applications_customer  on applications (customer_id);
create index if not exists idx_applications_status    on applications (status, submitted_at desc);
create index if not exists idx_applications_submitted on applications (submitted_at desc);
create index if not exists idx_applications_device    on applications (device_fingerprint)
  where device_fingerprint is not null;

drop trigger if exists trg_applications_updated_at on applications;
create trigger trg_applications_updated_at
  before update on applications
  for each row execute function set_updated_at();

-- =============================================================================
-- wallet_transactions — JazzCash / EasyPaisa / Raast movement
-- =============================================================================
-- The densest signal we have. Income regularity, volatility, cash-in vs
-- cash-out balance and activity density are all derived from this table.
create table if not exists wallet_transactions (
  id                bigserial primary key,
  customer_id       uuid        not null references customers (id) on delete cascade,

  provider          text        not null check (provider in ('jazzcash', 'easypaisa', 'raast')),
  direction         text        not null check (direction in ('in', 'out')),

  -- Coarse enough to be inferable from a real transaction feed, specific
  -- enough for the feature engine to tell income from a transfer.
  category          text        not null check (category in (
                      'salary', 'client_payment', 'sales_receipt', 'remittance',
                      'p2p_in', 'refund', 'loan_disbursement',
                      'cash_out', 'purchase', 'bill_payment', 'mobile_topup',
                      'p2p_out', 'fee', 'loan_repayment'
                    )),

  amount            numeric(14,2) not null check (amount > 0),
  balance_after     numeric(14,2),

  -- Pseudonymous counterparty handle. Phase 5 walks these to find the
  -- circular-transfer patterns a fraud ring leaves behind.
  counterparty_ref  text,
  counterparty_name text,

  description       text,
  occurred_at       timestamptz not null,
  is_reversed       boolean     not null default false,

  created_at        timestamptz not null default now()
);

-- The feature engine's main query: one customer, one time window, newest first.
create index if not exists idx_wallet_customer_time
  on wallet_transactions (customer_id, occurred_at desc);
create index if not exists idx_wallet_customer_dir_time
  on wallet_transactions (customer_id, direction, occurred_at desc);
create index if not exists idx_wallet_counterparty
  on wallet_transactions (counterparty_ref)
  where counterparty_ref is not null;
create index if not exists idx_wallet_occurred
  on wallet_transactions (occurred_at desc);

-- =============================================================================
-- topups — mobile airtime and data purchases
-- =============================================================================
-- A weak signal on its own, but a good one for *continuity*: someone keeping a
-- number alive and topping it up on a rhythm is someone with steady small
-- cash. A sudden stop is an early warning.
create table if not exists topups (
  id            bigserial primary key,
  customer_id   uuid        not null references customers (id) on delete cascade,

  network       text        not null check (network in ('jazz', 'zong', 'telenor', 'ufone', 'scom')),
  amount        numeric(10,2) not null check (amount > 0),
  -- A recurring bundle is a stronger signal than ad-hoc airtime.
  product_type  text        not null check (product_type in ('airtime', 'data_bundle', 'call_package', 'hybrid_bundle')),
  is_recurring  boolean     not null default false,

  occurred_at   timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_topups_customer_time on topups (customer_id, occurred_at desc);

-- =============================================================================
-- bill_payments — utilities, the single best repayment-behaviour proxy
-- =============================================================================
-- Someone who has paid their electricity bill on time for eleven of the last
-- twelve months has demonstrated exactly the behaviour a lender cares about,
-- with their own money, on a recurring obligation. This is the closest thing a
-- thin-file applicant has to a repayment history.
create table if not exists bill_payments (
  id              bigserial primary key,
  customer_id     uuid        not null references customers (id) on delete cascade,

  biller_type     text        not null check (biller_type in (
                    'electricity', 'gas', 'water', 'internet', 'mobile_postpaid', 'tv'
                  )),
  biller_name     text        not null,

  -- The month the bill covers, always stored as the 1st.
  billing_month   date        not null,
  due_date        date        not null,
  amount_due      numeric(12,2) not null check (amount_due > 0),

  -- NULL paid_at means genuinely unpaid, which is different from paid late.
  paid_at         timestamptz,
  amount_paid     numeric(12,2) check (amount_paid >= 0),

  status          text        not null check (status in ('paid_on_time', 'paid_late', 'unpaid')),

  created_at      timestamptz not null default now(),

  -- One bill per biller per month per customer.
  constraint bill_payments_unique_month unique (customer_id, biller_type, biller_name, billing_month),

  -- An unpaid bill cannot have a payment date, and a paid one must have one.
  constraint bill_payments_status_matches_payment check (
    (status = 'unpaid' and paid_at is null)
    or (status in ('paid_on_time', 'paid_late') and paid_at is not null)
  )
);

create index if not exists idx_bills_customer_month on bill_payments (customer_id, billing_month desc);
create index if not exists idx_bills_customer_status on bill_payments (customer_id, status);

-- How late, in days. Negative means early. Generated so it can never drift
-- out of sync with the dates it is derived from.
create or replace function bill_days_late(due date, paid timestamptz)
returns integer
language sql
immutable
as $$
  select case when paid is null then null
              else (paid at time zone 'Asia/Karachi')::date - due
         end;
$$;

-- =============================================================================
-- loans — a disbursed facility
-- =============================================================================
create table if not exists loans (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid        not null references customers (id) on delete cascade,
  application_id      uuid        references applications (id) on delete set null,

  reference           text        not null unique,

  principal           numeric(14,2) not null check (principal > 0),
  tenor_months        integer     not null check (tenor_months between 1 and 60),
  annual_rate         numeric(6,4) not null check (annual_rate >= 0),
  instalment_amount   numeric(14,2) not null check (instalment_amount > 0),

  disbursed_at        timestamptz not null,
  first_due_date      date        not null,
  maturity_date       date        not null,

  status              text        not null default 'active' check (
                        status in ('active', 'closed', 'delinquent', 'defaulted', 'written_off')
                      ),
  outstanding_balance numeric(14,2) not null default 0 check (outstanding_balance >= 0),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_loans_customer on loans (customer_id);
create index if not exists idx_loans_status   on loans (status, disbursed_at desc);

drop trigger if exists trg_loans_updated_at on loans;
create trigger trg_loans_updated_at
  before update on loans
  for each row execute function set_updated_at();

-- =============================================================================
-- repayments — the instalment schedule and what actually happened
-- =============================================================================
create table if not exists repayments (
  id            bigserial primary key,
  loan_id       uuid        not null references loans (id) on delete cascade,
  customer_id   uuid        not null references customers (id) on delete cascade,

  instalment_no integer     not null check (instalment_no > 0),
  due_date      date        not null,
  amount_due    numeric(14,2) not null check (amount_due > 0),

  paid_at       timestamptz,
  amount_paid   numeric(14,2) check (amount_paid >= 0),
  days_late     integer,

  status        text        not null default 'due' check (
                  status in ('due', 'paid_on_time', 'paid_late', 'missed', 'partial')
                ),

  created_at    timestamptz not null default now(),

  constraint repayments_unique_instalment unique (loan_id, instalment_no)
);

create index if not exists idx_repayments_loan     on repayments (loan_id, instalment_no);
create index if not exists idx_repayments_customer on repayments (customer_id, due_date desc);
create index if not exists idx_repayments_status   on repayments (status, due_date desc);

-- =============================================================================
-- customer_features — the engineered feature snapshot
-- =============================================================================
-- Raw transactions answer "what happened"; this table answers "what does that
-- say about them". Recomputed by `npm run db:features`, and read by the
-- scoring model (Phase 3), affordability (Phase 4) and monitoring (Phase 6).
--
-- It is a cache, not a source of truth: every value here is reproducible from
-- the tables above, which is what makes a score defensible months later.
create table if not exists customer_features (
  customer_id                   uuid primary key references customers (id) on delete cascade,

  -- The window the features describe.
  computed_at                   timestamptz not null default now(),
  window_start                  date        not null,
  window_end                    date        not null,
  observation_days              integer     not null,

  -- ---- income ----
  total_inflow                  numeric(14,2) not null default 0,
  total_outflow                 numeric(14,2) not null default 0,
  net_flow                      numeric(14,2) not null default 0,
  avg_monthly_inflow            numeric(14,2) not null default 0,
  median_monthly_inflow         numeric(14,2) not null default 0,
  -- Coefficient of variation of monthly inflow. Low means predictable income.
  income_volatility             numeric(8,4)  not null default 0,
  -- 0–1. How many of the observed months had any income at all.
  income_regularity             numeric(8,4)  not null default 0,
  months_with_income            integer       not null default 0,
  -- Trend of the last 90 days against the 90 before it, as a ratio.
  income_trend_90d              numeric(8,4)  not null default 0,
  largest_single_inflow         numeric(14,2) not null default 0,
  distinct_income_sources       integer       not null default 0,

  -- ---- spending & liquidity ----
  cash_out_ratio                numeric(8,4)  not null default 0,
  avg_monthly_outflow           numeric(14,2) not null default 0,
  -- Inflow minus outflow as a share of inflow. The affordability headroom.
  savings_rate                  numeric(8,4)  not null default 0,
  avg_end_of_month_balance      numeric(14,2) not null default 0,
  days_with_zero_balance        integer       not null default 0,

  -- ---- bill payment behaviour (the repayment proxy) ----
  bills_total                   integer       not null default 0,
  bills_paid_on_time            integer       not null default 0,
  bills_paid_late               integer       not null default 0,
  bills_unpaid                  integer       not null default 0,
  bill_punctuality              numeric(8,4)  not null default 0,
  avg_days_late                 numeric(8,2)  not null default 0,
  worst_days_late               integer       not null default 0,
  current_missed_streak         integer       not null default 0,
  longest_missed_streak         integer       not null default 0,
  distinct_billers              integer       not null default 0,

  -- ---- top-up behaviour ----
  topup_count                   integer       not null default 0,
  avg_monthly_topup_amount      numeric(12,2) not null default 0,
  topup_regularity              numeric(8,4)  not null default 0,
  days_since_last_topup         integer,

  -- ---- tenure & engagement ----
  wallet_tenure_months          integer       not null default 0,
  transaction_count             integer       not null default 0,
  active_days                   integer       not null default 0,
  -- Share of days in the window with at least one transaction.
  activity_density              numeric(8,4)  not null default 0,
  days_since_last_transaction   integer,
  -- Longest run of consecutive days with no activity at all.
  longest_dormancy_days         integer       not null default 0,

  -- ---- existing obligations ----
  active_loan_count             integer       not null default 0,
  total_outstanding             numeric(14,2) not null default 0,
  historical_repayments         integer       not null default 0,
  historical_on_time_rate       numeric(8,4),

  -- Every raw feature, kept for auditing a score after the fact.
  raw                           jsonb        not null default '{}'::jsonb,

  constraint customer_features_window_is_ordered check (window_end >= window_start)
);

create index if not exists idx_features_computed on customer_features (computed_at desc);

-- =============================================================================
-- Convenience view: the applicant as a loan officer sees them
-- =============================================================================
create or replace view customer_signal_summary as
select
  c.id,
  c.full_name,
  c.cnic,
  c.phone,
  c.city,
  c.province,
  c.occupation,
  c.persona,
  c.primary_wallet,
  c.wallet_opened_at,
  c.declared_monthly_income,
  c.has_bank_loan_history,
  f.computed_at                as features_computed_at,
  f.avg_monthly_inflow,
  f.income_volatility,
  f.income_regularity,
  f.bill_punctuality,
  f.wallet_tenure_months,
  f.transaction_count,
  f.activity_density,
  f.savings_rate,
  f.days_since_last_transaction,
  (select count(*) from applications a where a.customer_id = c.id)                       as application_count,
  (select count(*) from applications a where a.customer_id = c.id and a.status = 'pending') as pending_applications,
  (select count(*) from loans l where l.customer_id = c.id and l.status = 'active')      as active_loans
from customers c
left join customer_features f on f.customer_id = c.id;

-- =============================================================================
-- Row-level security
-- =============================================================================
-- Our Next.js server is the trusted layer: it runs our own auth, resolves the
-- role, and connects as the `postgres` role, which bypasses RLS. These policies
-- exist to make sure that if anyone ever points the browser-safe publishable
-- key at these tables directly, they get nothing. Applicant financial records
-- must never be readable by the anon role.
alter table customers            enable row level security;
alter table applications         enable row level security;
alter table wallet_transactions  enable row level security;
alter table topups               enable row level security;
alter table bill_payments        enable row level security;
alter table loans                enable row level security;
alter table repayments           enable row level security;
alter table customer_features    enable row level security;

-- No policies are created on purpose. RLS with zero policies denies everything
-- to every non-superuser role, which is exactly the intent.
