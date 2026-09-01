# CreditSense AI

Explainable, API-first financial-risk intelligence platform that helps Pakistani lenders decide who to lend to, how much, and how safely.

## Quick Start (Local Development)

### Prerequisites
- Docker & Docker Compose
- Python 3.11+
- Node.js 20+

### Option 1: Docker Compose (Recommended)

```bash
cp .env.example .env
docker-compose up --build
```

- Backend API: http://localhost:8000
- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/docs

### Option 2: Local Development

1. **Start PostgreSQL:**
   ```bash
   docker-compose up -d db
   ```

2. **Backend:**
   ```bash
   pip install -r requirements.txt
   cp .env.example .env
   uvicorn backend.main:app --reload --port 8000
   ```

3. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Seed the database:**
   ```bash
   python scripts/seed_db.py
   ```

### Default Login
- Email: `admin@creditsense.ai`
- Password: `admin123`

## Architecture

- **Backend:** FastAPI + SQLAlchemy + PostgreSQL
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- **ML:** scikit-learn, XGBoost, SHAP
- **Fraud:** Isolation Forest + NetworkX graph analysis
- **LLM:** Anthropic Claude (optional, falls back to rule-based answers)

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/auth/login` | POST | Authentication |
| `/api/v1/customers` | POST/GET | Customer CRUD |
| `/api/v1/applications` | POST | Loan applications |
| `/api/v1/risk-assessment` | POST | Full risk pipeline |
| `/api/v1/customers/{id}/fraud-risk` | GET | Fraud alerts + graph |
| `/api/v1/customers/{id}/explanation` | GET | SHAP explanations |
| `/api/v1/customers/{id}/financial-health` | GET | Monitoring timeline |
| `/api/v1/copilot/query` | POST | AI copilot |
| `/api/v1/dashboard/metrics` | GET | Dashboard metrics |

## Project Structure

```
creditsense-ai/
├── frontend/          # Next.js app
├── backend/           # FastAPI app
├── ml/                # Training scripts, models
├── data/              # Synthetic dataset
├── database/          # SQLAlchemy models
├── scripts/           # Setup/seed scripts
├── docker/            # Docker configs
├── docker-compose.yml
└── requirements.txt
```
