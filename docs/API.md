# API Reference

All application endpoints are prefixed with `/api/v1`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/auth/login` | POST | Legacy local-demo login |
| `/auth/me` | GET | Current user |
| `/auth/logout` | POST | Sign out |
| `/customers` | GET, POST | List or create customers |
| `/customers/{id}` | GET | Customer detail |
| `/applications` | GET, POST | List or create applications |
| `/applications/{id}` | GET | Application detail |
| `/risk-assessment` | POST | Run the combined assessment |
| `/risk-assessment/{id}` | GET | Assessment detail |
| `/customers/{id}/fraud-risk` | GET | Fraud and graph signals |
| `/customers/{id}/explanation` | GET | Model explanation |
| `/customers/{id}/financial-health` | GET | Financial health timeline |
| `/copilot/query` | POST | Guarded risk-copilot query |
| `/dashboard/metrics` | GET | Dashboard summary |
| `/model/metrics` | GET | Persisted model metrics |

`GET /health` is unauthenticated and returns service, database, artifact-version, and artifact-hash metadata. Use the generated FastAPI documentation at `/docs` for request and response schemas on a running backend.
