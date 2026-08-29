-- =============================================================================
-- 0004_fraud.sql — Phase 5: FraudSense
-- =============================================================================
-- Fraud assessments are stored with their evidence, not just their verdict.
--
-- A flag an analyst cannot check is a flag they will learn to ignore, and an
-- ignored fraud alert is worse than none — it manufactures false confidence.
-- So every flag carries the records that produced it, and the whole assessment
-- is append-only history like the credit scores: what was known at the time of
-- a decision has to remain reconstructable.
-- =============================================================================

create table if not exists fraud_assessments (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid        not null references customers (id) on delete cascade,
  application_id  uuid        references applications (id) on delete set null,

  -- 0–100. Saturating, not a linear sum: the gap between no flags and one
  -- matters far more than between three and four.
  risk_score      integer     not null check (risk_score between 0 and 100),

  level           text        not null check (level in ('clear', 'review', 'investigate', 'block')),

  -- The flags, each with its finding, rationale, points and raw evidence.
  flags           jsonb       not null default '[]'::jsonb,
  -- Denormalised for indexing and filtering without unpacking the JSON.
  flag_codes      text[]      not null default array[]::text[],

  summary         text        not null,

  assessed_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists idx_fraud_customer_time
  on fraud_assessments (customer_id, assessed_at desc);
create index if not exists idx_fraud_level on fraud_assessments (level, assessed_at desc);
create index if not exists idx_fraud_score on fraud_assessments (risk_score desc);
-- GIN so "every applicant flagged for circular transfers" is an index scan.
create index if not exists idx_fraud_codes on fraud_assessments using gin (flag_codes);

create or replace view current_fraud_assessments as
select distinct on (customer_id)
  customer_id,
  id as assessment_id,
  risk_score,
  level,
  flags,
  flag_codes,
  summary,
  assessed_at
from fraud_assessments
order by customer_id, assessed_at desc;

-- =============================================================================
-- fraud_links — the relationship graph, materialised
-- =============================================================================
-- The graph is rebuilt from raw signals by `npm run db:fraud`, but the edges
-- are stored so the investigation view can load one applicant's neighbourhood
-- without scanning every device fingerprint in the portfolio.
create table if not exists fraud_links (
  id                uuid primary key default gen_random_uuid(),

  -- Ordered so an undirected pair is stored once. The CHECK below enforces it.
  customer_a        uuid        not null references customers (id) on delete cascade,
  customer_b        uuid        not null references customers (id) on delete cascade,

  link_type         text        not null check (
                      link_type in ('device', 'address', 'phone_prefix', 'counterparty', 'money_transfer')
                    ),
  -- 0–1. How strongly this link implies a real relationship.
  weight            numeric(4,3) not null check (weight between 0 and 1),
  -- What was shared: the fingerprint, the address, the counterparty ref.
  shared_value      text,
  detail            jsonb       not null default '{}'::jsonb,

  created_at        timestamptz not null default now(),

  -- An undirected edge stored twice would double every cohesion calculation.
  constraint fraud_links_ordered check (customer_a < customer_b),
  constraint fraud_links_unique unique (customer_a, customer_b, link_type, shared_value)
);

create index if not exists idx_links_a on fraud_links (customer_a);
create index if not exists idx_links_b on fraud_links (customer_b);
create index if not exists idx_links_type on fraud_links (link_type, weight desc);

-- =============================================================================
-- fraud_clusters — detected groups
-- =============================================================================
create table if not exists fraud_clusters (
  id            uuid primary key default gen_random_uuid(),
  label         text        not null,
  customer_ids  uuid[]      not null,
  member_count  integer     not null check (member_count >= 2),
  cohesion      numeric(4,3) not null check (cohesion between 0 and 1),
  link_types    text[]      not null default array[]::text[],
  severity      text        not null check (severity in ('critical', 'high', 'medium', 'low')),
  assessment    text        not null,

  -- Set once an analyst has looked at it.
  reviewed_at   timestamptz,
  reviewed_by   uuid        references users (id) on delete set null,
  verdict       text        check (verdict in ('confirmed_fraud', 'false_positive', 'inconclusive')),
  notes         text,

  detected_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_clusters_severity on fraud_clusters (severity, member_count desc);
create index if not exists idx_clusters_unreviewed on fraud_clusters (detected_at desc)
  where reviewed_at is null;
-- GIN so "which cluster is this applicant in?" is an index lookup.
create index if not exists idx_clusters_members on fraud_clusters using gin (customer_ids);

-- =============================================================================
-- The fraud analyst's queue
-- =============================================================================
-- Everything needing attention, ordered by how much. Defined as a view so the
-- ordering logic lives in one place rather than being restated by every caller.
create or replace view fraud_queue as
select
  c.id                as customer_id,
  c.full_name,
  c.city,
  c.persona,
  c.device_fingerprint,
  f.risk_score        as fraud_score,
  f.level             as fraud_level,
  f.flag_codes,
  f.summary           as fraud_summary,
  f.assessed_at,
  s.score             as credit_score,
  s.risk_band,
  (select count(*) from applications a
    where a.customer_id = c.id and a.status in ('pending', 'in_review')) as open_applications,
  (select count(*) from fraud_clusters fc where c.id = any(fc.customer_ids)) as cluster_count
from customers c
join current_fraud_assessments f on f.customer_id = c.id
left join current_credit_scores s on s.customer_id = c.id
where f.level <> 'clear'
order by
  case f.level when 'block' then 0 when 'investigate' then 1 else 2 end,
  f.risk_score desc;

alter table fraud_assessments enable row level security;
alter table fraud_links       enable row level security;
alter table fraud_clusters    enable row level security;
