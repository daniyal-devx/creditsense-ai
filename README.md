# CreditSense AI

Explainable, API-first financial-risk intelligence platform that helps Pakistani lenders decide who to lend to, how much, and how safely.

> **Honesty note:** CreditSense AI is a demonstrable prototype built for the Alibaba Cloud AI Hackathon Pakistan 2026. The training data is synthetic, the risk model is not licensed for production lending decisions, and the platform does not constitute financial, legal, or credit-advisory advice.

## Quick Start (Local Development)

### Prerequisites
- Python 3.12
- Node.js 20+
- A Supabase project (see Wave 0 in `docs/DEPLOYMENT.md`)
- A Groq API key

### 1. Environment

```bash
cp .env.example .env
# Edit .env with your Supabase + Groq credentials
cp frontend/.env.local.example frontend/.env.local
# Edit frontend/.env.local with your Supabase public credentials
```

### 2. Backend

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head        # Run migrations
python scripts/seed_db.py   # Seed demo customers
uvicorn backend.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

- Backend API: http://localhost:8000
- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/docs

## Architecture

- **Backend:** FastAPI + SQLAlchemy + Supabase PostgreSQL
- **Auth:** Supabase Auth with JWT verification and role-based access control
- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- **ML:** scikit-learn + XGBoost, calibrated probabilities, SHAP explainability
- **Fraud:** Isolation Forest + NetworkX graph analysis + PostgreSQL recursive CTEs
- **LLM:** Groq `llama-3.3-70b-versatile` for the AI Risk Copilot

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/auth/me` | GET | Current user |
| `/api/v1/auth/logout` | POST | Sign out |
| `/api/v1/customers` | POST/GET | Customer CRUD |
| `/api/v1/applications` | POST | Loan applications |
| `/api/v1/risk-assessment` | POST | Full risk pipeline |
| `/api/v1/customers/{id}/fraud-risk` | GET | Fraud alerts + graph |
| `/api/v1/customers/{id}/explanation` | GET | SHAP explanations |
| `/api/v1/customers/{id}/financial-health` | GET | Monitoring timeline |
| `/api/v1/copilot/query` | POST | AI copilot |
| `/api/v1/dashboard/metrics` | GET | Dashboard metrics |
| `/api/v1/model/metrics` | GET | Model performance metrics |

## Project Structure

```
creditsense-ai/
├── frontend/          # Next.js app
├── backend/           # FastAPI app
├── ml/                # Training scripts, models, reports
├── data/              # Synthetic dataset
├── scripts/           # Setup/seed scripts
├── tests/             # Backend + ML tests
├── alembic/           # Database migrations
├── docker/            # Docker configs
├── docker-compose.yml
└── requirements.txt
```

## Important Limitations

- **Synthetic data:** All customer profiles, transactions, and outcomes are generated for demo purposes.
- **Not a credit bureau:** The platform does not connect to real financial institutions or regulatory systems.
- **Model risk:** The XGBoost classifier is trained on a small synthetic dataset and should not be used for real lending.
- **Deterministic demos:** The monitoring timeline is synthetic and deterministic to ensure repeatable hackathon demos.
- **No compliance claims:** CreditSense AI is not PCI-DSS, SOC 2, or banking-regulation certified.
