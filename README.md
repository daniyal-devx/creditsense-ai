# CreditSense AI

Explainable, API-first financial-risk intelligence for a lending demo. It assesses synthetic customer profiles with calibrated credit risk, affordability, fraud signals, graph relationships, financial health, and a guarded AI copilot.

> **Prototype notice:** This project was built for the Alibaba Cloud AI Hackathon Pakistan 2026. Its data is synthetic and its models are not suitable for real lending, financial, legal, or credit decisions.

## What is verified locally

```bash
python -m pytest
python scripts/verify_demo.py
cd frontend && npm ci && npm run build
```

The backend suite and demo verifier do not need Supabase or Groq credentials. The frontend build needs public Supabase placeholders only; `frontend/.env.local.example` lists the required names.

## Local development

### Backend

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
python -m pip install -r requirements.txt
python scripts/seed_db.py --reset --demo-auth
uvicorn backend.main:app --reload --port 8000
```

`--demo-auth` seeds the four local quick-fill accounts after resetting the current local schema. Use it only with disposable demo data. Without that flag, `python scripts/seed_db.py` preserves the environment-password `ADMIN_PASSWORD` behavior.

### Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm ci
npm run dev
```

Set `NEXT_PUBLIC_API_URL` to the reachable backend address. Browser-side requests use this value directly.

### Docker Compose

```bash
docker compose up --build
docker compose --profile seed up seed
```

The main stack starts PostgreSQL, the FastAPI backend, and the Next.js frontend. The optional `seed` profile resets the Compose database and loads demo personas; use it only for disposable local data.

## Environment

Copy `.env.example` for production-shaped backend settings. At minimum, configure the database URL, a strong `JWT_SECRET`, allowed `CORS_ORIGINS`, and—when using the copilot—a `GROQ_API_KEY`. Production frontend deployments require `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Deployment status

- `railway.json` deploys the backend Docker image and checks `/health`.
- `frontend/vercel.json` uses reproducible `npm ci` and `npm run build` commands.
- Supabase schema migrations, RLS, and production Supabase Auth are not implemented yet. The prototype currently initializes its SQLAlchemy schema at application startup and retains a legacy local-auth fallback.

See `docs/` for architecture, API, model and dataset cards, security notes, deployment instructions, and the demo script.
