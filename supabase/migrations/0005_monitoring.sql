-- =============================================================================
-- 0005_monitoring.sql — Phase 6: Continuous Financial Monitoring
-- =============================================================================
-- Scoring is not a one-time event.
--
-- The whole failure this phase addresses is that a lender approves someone on
-- good signals and then hears nothing until a payment is missed — by which
-- point the money is gone. The signals that predict a default are visible
-- weeks earlier: income collapsing, bills starting to slip, a wallet going
-- quiet.
--
-- So approved customers are re-scored continuously, and any deterioration
-- raises an alert BEFORE the missed payment rather than after it.
-- =============================================================================

create table if not exists monitoring_alerts (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid        not null references customers (id) on delete cascade,
  loan_id           uuid        references loans (id) on delete cascade,

  alert_type        text        not null check (alert_type in (
                      'income_collapse',
                      'missed_bill_streak',
                      'wallet_dormancy',
                      'score_deterioration',
                      'affordability_breach',
                      'repayment_missed',
                      'balance_depletion'
                    )),

  severity          text        not null check (severity in ('critical', 'high', 'medium', 'low')),

  title             text        not null,
  -- What changed, with the numbers. Written for a human, not a log.
  detail            text        not null,
  -- What the analyst should do about it.
  recommended_action text       not null,

  -- The measurement that triggered it, so the alert can be re-checked later.
  evidence          jsonb       not null default '{}'::jsonb,

  -- Score at the time, and the change that raised the alert.
  score_at_alert    integer     check (score_at_alert between 0 and 1000),
  score_change      integer,

  status            text        not null default 'open' check (
                      status in ('open', 'acknowledged', 'resolved', 'dismissed')
                    ),
  acknowledged_at   timestamptz,
  acknowledged_by   uuid        references users (id) on delete set null,
  resolution_note   text,

  raised_at         timestamptz not null default now(),
  created_at        timestamptz not null default now(),

  -- An acknowledged alert must record who and when; an open one must not.
  constraint alerts_acknowledgement_is_consistent check (
    (status = 'open' and acknowledged_at is null)
    or (status <> 'open' and acknowledged_at is not null)
  )
);

create index if not exists idx_alerts_customer on monitoring_alerts (customer_id, raised_at desc);
create index if not exists idx_alerts_open on monitoring_alerts (severity, raised_at desc)
  where status = 'open';
create index if not exists idx_alerts_type on monitoring_alerts (alert_type, raised_at desc);
create index if not exists idx_alerts_loan on monitoring_alerts (loan_id)
  where loan_id is not null;

-- -----------------------------------------------------------------------------
-- Portfolio snapshots — how risk moves over time
-- -----------------------------------------------------------------------------
-- A daily aggregate rather than something recomputed on read. The point of a
-- trend line is comparing today with a month ago, and recomputing history from
-- current data would silently rewrite the past every time the model changed.
create table if not exists portfolio_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  snapshot_date         date        not null unique,

  total_customers       integer     not null,
  scored_customers      integer     not null,
  average_score         numeric(6,1) not null,
  median_score          integer     not null,

  -- Band counts, so a distribution chart is one row rather than a group-by.
  band_very_low         integer     not null default 0,
  band_low              integer     not null default 0,
  band_moderate         integer     not null default 0,
  band_high             integer     not null default 0,
  band_very_high        integer     not null default 0,

  active_loans          integer     not null default 0,
  total_outstanding     numeric(16,2) not null default 0,
  delinquent_loans      integer     not null default 0,
  defaulted_loans       integer     not null default 0,

  open_alerts           integer     not null default 0,
  critical_alerts       integer     not null default 0,

  created_at            timestamptz not null default now()
);

create index if not exists idx_snapshots_date on portfolio_snapshots (snapshot_date desc);

-- -----------------------------------------------------------------------------
-- Risk migration — who moved between bands
-- -----------------------------------------------------------------------------
-- The single most useful portfolio question after "what does it look like
-- now?" is "who is getting worse?". That needs the transition, not the state.
create table if not exists risk_migrations (
  id              bigserial primary key,
  customer_id     uuid        not null references customers (id) on delete cascade,

  from_band       text        not null,
  to_band         text        not null,
  from_score      integer     not null,
  to_score        integer     not null,
  -- Negative means deterioration.
  score_change    integer     not null,

  migrated_at     timestamptz not null default now(),

  constraint migrations_bands_differ check (from_band <> to_band)
);

create index if not exists idx_migrations_time on risk_migrations (migrated_at desc);
create index if not exists idx_migrations_customer on risk_migrations (customer_id, migrated_at desc);
create index if not exists idx_migrations_deterioration on risk_migrations (score_change)
  where score_change < 0;

-- -----------------------------------------------------------------------------
-- The early-warning feed
-- -----------------------------------------------------------------------------
-- Open alerts with the context needed to act, ordered by urgency. A view so
-- the ordering rule lives in one place instead of being restated by callers.
create or replace view early_warning_feed as
select
  a.id                as alert_id,
  a.customer_id,
  c.full_name,
  c.city,
  c.phone,
  a.alert_type,
  a.severity,
  a.title,
  a.detail,
  a.recommended_action,
  a.evidence,
  a.score_at_alert,
  a.score_change,
  a.status,
  a.raised_at,
  l.id                as loan_id,
  l.reference         as loan_reference,
  l.outstanding_balance,
  l.status            as loan_status,
  s.score             as current_score,
  s.risk_band         as current_band
from monitoring_alerts a
join customers c on c.id = a.customer_id
left join loans l on l.id = a.loan_id
left join current_credit_scores s on s.customer_id = a.customer_id
where a.status = 'open'
order by
  case a.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
  a.raised_at desc;

-- -----------------------------------------------------------------------------
-- Portfolio health, right now
-- -----------------------------------------------------------------------------
create or replace view portfolio_health as
select
  (select count(*) from customers)                                                as total_customers,
  (select count(*) from current_credit_scores)                                    as scored_customers,
  (select round(avg(score), 1) from current_credit_scores)                        as average_score,
  (select count(*) from loans where status in ('active', 'delinquent'))           as active_loans,
  (select coalesce(sum(outstanding_balance), 0)
     from loans where status in ('active', 'delinquent'))                         as total_outstanding,
  (select count(*) from loans where status = 'delinquent')                        as delinquent_loans,
  (select count(*) from loans where status in ('defaulted', 'written_off'))       as defaulted_loans,
  (select count(*) from monitoring_alerts where status = 'open')                  as open_alerts,
  (select count(*) from monitoring_alerts
     where status = 'open' and severity = 'critical')                             as critical_alerts,
  (select count(*) from risk_migrations
     where score_change < 0 and migrated_at > now() - interval '30 days')         as recent_downgrades;

-- Realtime needs a replica identity to emit the full row on an update, and the
-- table has to be in the publication for the browser to receive anything at
-- all. Guarded because the publication does not exist on a plain Postgres.
alter table monitoring_alerts replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table monitoring_alerts;
    exception
      when duplicate_object then null;
    end;
  end if;
end
$$;

alter table monitoring_alerts    enable row level security;
alter table portfolio_snapshots  enable row level security;
alter table risk_migrations      enable row level security;
