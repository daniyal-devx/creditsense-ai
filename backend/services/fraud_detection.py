"""FraudSense — backward-compatible re-export.

The implementation now lives in `backend.services.fraud`. This module keeps the
old import path working for existing callers.
"""
from backend.services.fraud.engine import detect_fraud

__all__ = ["detect_fraud"]
