# Demo Script

1. Run `python scripts/verify_demo.py` to confirm the deterministic model outcomes.
2. Start the local stack with `docker compose up --build`.
3. Reset the disposable Compose database and load the seven personas plus local quick-fill accounts with `docker compose --profile seed up seed`.
4. Open the frontend and sign in with one of these local-only accounts:

   | Role | Email | Password |
   | --- | --- | --- |
   | Admin | `admin@creditsense.ai` | `admin123` |
   | Loan Officer | `officer@creditsense.ai` | `officer123` |
   | Risk Manager | `risk@creditsense.ai` | `risk123` |
   | Fraud Analyst | `fraud@creditsense.ai` | `fraud123` |

5. Present the three headline scenarios:
   - **Ahmed (Salaried):** stable profile, LOW risk, APPROVE.
   - **Bilal (Freelancer):** volatile profile, MEDIUM risk, REVIEW.
   - **Ayesha (Online Seller):** high-risk profile with shared fraud-ring device, HIGH risk, DECLINE.
6. Inspect model metrics, explanations, affordability, fraud-network, and financial-health views for the selected customer.

The AI copilot has richer responses only when `GROQ_API_KEY` is configured. Do not claim that its recommendations are financial advice or production lending decisions. The displayed accounts are for the disposable local demo seed only; do not deploy them to a shared environment.
