# Architecture

## Runtime flow

```text
Next.js browser client → FastAPI REST API → SQLAlchemy → PostgreSQL
                                      ↘ risk, affordability, fraud, graph, health, copilot services
```

The frontend sends requests directly to `NEXT_PUBLIC_API_URL`. The backend exposes versioned REST endpoints under `/api/v1` and reports runtime model metadata at `/health`.

## Backend services

- **Credit model:** loads the tracked calibrated artifact from `ml/models/credit_model.joblib` and produces a score, repayment probability, risk band, and decision.
- **Affordability:** derives payment capacity and recommendation limits.
- **Fraud and graph:** scores rule-based signals and shared-entity relationships.
- **Financial health:** generates deterministic monitoring trends for the demo.
- **Copilot:** uses Groq when configured and retains guarded local behavior when it is not.

## Persistence and authentication

The current prototype initializes SQLAlchemy metadata at backend startup. The demo seed script can rebuild this schema with `--reset`. Supabase connection and client scaffolding are present, but migrations, RLS, and end-to-end Supabase Auth remain pending external project configuration. Local legacy JWT authentication remains available for the demo.

## Deployment boundary

The backend Docker image contains its model artifact and runs as a non-root user. The frontend image builds Next.js standalone output with explicit public environment build arguments. The Compose stack connects them to disposable PostgreSQL for local verification.
