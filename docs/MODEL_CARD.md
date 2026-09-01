# Model Card

## Intended use

The credit model supports a controlled product demonstration of explainable financial-risk scoring with synthetic data. It is not a production lending model and must not be used to make decisions about real people.

## Output

The model returns default and repayment probabilities, a 0–1000 credit score, a LOW/MEDIUM/HIGH risk band, and an APPROVE/REVIEW/DECLINE recommendation. The service validates employment categories against the saved artifact before inference.

## Artifact and evaluation

The tracked artifact is `ml/models/credit_model.joblib`. It stores the estimator, feature order, employment categories, label map, model version, and a path to persisted metrics. `GET /health` exposes the artifact version and SHA-256 hash for runtime traceability.

## Limitations

- Training and demo profiles are synthetic.
- Risk thresholds encode demo product policy, not regulatory or economic guidance.
- Calibration and aggregate metrics do not establish fairness, robustness, or real-world performance.
- SHAP explanations describe this model's feature contribution; they are not causal explanations.

## Reproducibility checks

Run `python -m pytest` for model parity and service checks. Run `python scripts/verify_demo.py` for the deterministic Ahmed, Bilal, and Ayesha headline outcomes.
