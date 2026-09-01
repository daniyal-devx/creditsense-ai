"""Groq client for the AI Risk Copilot.

Provides a thin wrapper around the Groq SDK with a labelled offline fallback
when no API key is configured or the call fails.
"""
import os
from typing import Dict, List, Optional

GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")


def _client():
    try:
        import groq
        return groq.Groq(api_key=os.environ.get("GROQ_API_KEY", ""))
    except Exception as exc:
        raise RuntimeError(f"Groq client unavailable: {exc}") from exc


def generate_copilot_answer(
    *,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.3,
    max_tokens: int = 600,
) -> Dict:
    """Call Groq and return a normalized response dict.

    Returns `mode: "llm"` on success and `mode: "offline_template"` when the
    key is missing or the call fails.
    """
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        return {
            "answer": _offline_template(user_prompt),
            "mode": "offline_template",
            "model": GROQ_MODEL,
            "error": "GROQ_API_KEY not configured",
        }

    try:
        client = _client()
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return {
            "answer": response.choices[0].message.content.strip(),
            "mode": "llm",
            "model": response.model or GROQ_MODEL,
        }
    except Exception as exc:
        return {
            "answer": _offline_template(user_prompt),
            "mode": "offline_template",
            "model": GROQ_MODEL,
            "error": str(exc),
        }


def _offline_template(user_prompt: str) -> str:
    return (
        "The AI Risk Copilot is currently running in offline template mode. "
        "It can only surface information already present in the risk assessment. "
        "Please ask about the credit score, risk factors, affordability, or fraud alerts."
    )


class GroqClient:
    """Sync convenience wrapper matching the expected service interface."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.environ.get("GROQ_API_KEY", "")
        self.model = model or GROQ_MODEL

    def generate(self, system_prompt: str, user_prompt: str) -> Dict:
        if self.api_key:
            os.environ["GROQ_API_KEY"] = self.api_key
        return generate_copilot_answer(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
