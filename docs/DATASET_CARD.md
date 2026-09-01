# Dataset Card

## Summary

CreditSense uses synthetic customer, financial-profile, transaction, and repayment data for demonstration and testing. No production customer records, credit-bureau files, or banking feeds are included.

## Contents

- `data/` contains source data used by the reproducible training workflow when present.
- `scripts/seed_db.py` defines seven deterministic personas for the local product demo.
- `ml/models/` contains generated model artifacts tracked for repeatable inference checks.

## Demo personas

The seeded personas cover stable salaried income, freelancer volatility, shop and business owners, an online seller with linked fraud indicators, a driver, and an informal worker. They exist solely to exercise UI and service branches.

## Limitations and handling

The values are fabricated and may encode simplified relationships that do not represent Pakistan's lending population or any real community. Do not merge external personal data into this repository. When generating new synthetic data, preserve the absence of direct identifiers and update the model and dataset cards with the changed assumptions.
