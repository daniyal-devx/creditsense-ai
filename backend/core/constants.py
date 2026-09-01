"""Shared policy constants for risk scoring and decisions."""

# Score range
SCORE_MIN = 0
SCORE_MAX = 1000

# Band thresholds (continuous 0-1000 score)
APPROVE_THRESHOLD = 700
REVIEW_THRESHOLD = 500

# Risk bands
RISK_LOW = "LOW"
RISK_MEDIUM = "MEDIUM"
RISK_HIGH = "HIGH"

# Decisions
DECISION_APPROVE = "APPROVE"
DECISION_REVIEW = "REVIEW"
DECISION_DECLINE = "DECLINE"

# Affordability policy defaults
DEFAULT_MONTHLY_RATE = 0.02
DTI_CEILING_STABLE = 0.35
DTI_CEILING_STRESSED = 0.25
MAX_LOAN_TENURE_MONTHS = 24
