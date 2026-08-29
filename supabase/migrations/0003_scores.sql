-- =============================================================================
-- 0003_scores.sql — Phase 3: CreditSense Score
-- =============================================================================
-- Scores are stored, not computed on read, for one reason that outweighs the
-- convenience of recomputing: a lending decision must be reconstructable.
--
-- If an applicant is rejected today and asks why in six months, the answer has
-- to be the score as it stood at the moment of the decision, with the model
-- version and the exact contributions that produced it. Recomputing would give
-- whatever the current model says about their current behaviour, which is a
-- different question and not a defence.
--
-- So `credit_scores` is append-only history, and `current_credit_scores` is a
-- view over the latest row per customer.
-- =============================================================================

create table if not exists credit_scores (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid        not null references customers (id) on delete cascade,

  -- Set when the score was produced for a specific application, so the
  -- decision and the evidence behind it stay tied together.
  application_id          uuid        references applications (id) on delete set null,

  score                   integer     not null check (score between 0 and 1000),
  risk_band               text        not null check (
                            risk_band in ('very-low', 'low', 'moderate', 'high', 'very-high')
                          ),
  probability_of_default  numeric(8,6) not null check (probability_of_default between 0 and 1),

  -- Which model produced it. Without this, a score from a retrained model is
  -- indistinguishable from one produced by the model in force at the time.
  model_version           text        not null,
  model_trained_at        timestamptz,

  -- The full per-feature point breakdown, exactly as shown to the officer.
  contributions           jsonb       not null default '[]'::jsonb,
  -- The feature values the score was computed from, so it can be recomputed
  -- and verified without replaying 200,000 transactions.
  feature_snapshot        jsonb       not null default '{}'::jsonb,

  -- Why this score exists: an application, a scheduled re-score, or a manual
  -- request. Phase 6 writes 'monitoring' rows continuously.
  trigger                 text        not null default 'manual' check (
                            trigger in ('application', 'monitoring', 'manual', 'batch')
                          ),

  scored_at               timestamptz not null default now(),
  created_at              timestamptz not null default now()
);

create index if not exists idx_scores_customer_time
  on credit_scores (customer_id, scored_at desc);
create index if not exists idx_scores_application on credit_scores (application_id)
  where application_id is not null;
create index if not exists idx_scores_band on credit_scores (risk_band, scored_at desc);
create index if not exists idx_scores_scored_at on credit_scores (scored_at desc);

-- The latest score per customer.
--
-- DISTINCT ON is a Postgres-specific shortcut for "first row per group" and is
-- markedly faster here than the window-function equivalent, because the index
-- above already provides the required ordering.
create or replace view current_credit_scores as
select distinct on (customer_id)
  customer_id,
  id as score_id,
  score,
  risk_band,
  probability_of_default,
  model_version,
  contributions,
  trigger,
  scored_at
from credit_scores
order by customer_id, scored_at desc;

-- Portfolio-level distribution, used by the risk dashboard in Phase 7.
create or replace view score_distribution as
select
  risk_band,
  count(*)::bigint                     as customers,
  round(avg(score))::integer           as avg_score,
  min(score)                           as min_score,
  max(score)                           as max_score,
  round(avg(probability_of_default), 4) as avg_pd
from current_credit_scores
group by risk_band;

alter table credit_scores enable row level security;
