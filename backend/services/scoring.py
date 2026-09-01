"""Credit-score mapping and decision policy helpers."""
from backend.core.constants import (
    SCORE_MIN,
    SCORE_MAX,
    APPROVE_THRESHOLD,
    REVIEW_THRESHOLD,
    RISK_LOW,
    RISK_MEDIUM,
    RISK_HIGH,
    DECISION_APPROVE,
    DECISION_REVIEW,
    DECISION_DECLINE,
)


SCORE_POWER = 0.8  # compresses the top of the range so borderline cases land in REVIEW


def score_from_p_default(p_default: float) -> int:
    """Map a calibrated probability of default to a continuous 0-1000 score.

    A p_default of 0 -> score 1000 (best). A p_default of 1 -> score 0 (worst).
    The power transform expands the mid-range compared with a plain linear map,
    which pushes the calibrated freelancer persona into the REVIEW band while
    keeping low-risk personas in APPROVE and high-risk personas in DECLINE.
    """
    score = int(round(SCORE_MAX * (1.0 - float(p_default)) ** SCORE_POWER))
    return max(SCORE_MIN, min(SCORE_MAX, score))


def band_and_decision(score: int) -> tuple[str, str]:
    """Return (risk_level, decision) for a given score."""
    if score >= APPROVE_THRESHOLD:
        return RISK_LOW, DECISION_APPROVE
    if score >= REVIEW_THRESHOLD:
        return RISK_MEDIUM, DECISION_REVIEW
    return RISK_HIGH, DECISION_DECLINE
