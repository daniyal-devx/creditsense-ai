from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Optional

import bcrypt
import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.core.database import get_db

security = HTTPBearer(auto_error=False)


_introspection_cache: dict[str, tuple[float, Optional[dict]]] = {}
_introspection_lock = Lock()
_INTROSPECTION_TTL_SECONDS = 60.0


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _decode_supabase_token(token: str) -> Optional[dict]:
    """Resolve a Supabase access token to its claims via /auth/v1/user.

    Supabase currently signs access tokens with ES256, which python-jose's
    HS256-only path cannot verify locally. Introspecting against the auth
    server sidesteps the JWKS/ES256 plumbing and is sufficient for the demo.
    """
    if not settings.supabase_url or not settings.supabase_anon_key:
        return None

    now = datetime.now(timezone.utc).timestamp()
    with _introspection_lock:
        cached = _introspection_cache.get(token)
        if cached and (now - cached[0]) < _INTROSPECTION_TTL_SECONDS:
            return cached[1]

    try:
        response = httpx.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": settings.supabase_anon_key,
                "Authorization": f"Bearer {token}",
            },
            timeout=8.0,
        )
    except httpx.HTTPError:
        return None

    if response.status_code != 200:
        return None

    try:
        data = response.json()
    except ValueError:
        return None

    payload = {
        "sub": data.get("id"),
        "email": data.get("email"),
        "app_metadata": data.get("app_metadata") or {},
        "user_metadata": data.get("user_metadata") or {},
    }
    with _introspection_lock:
        _introspection_cache[token] = (now, payload)
    return payload


def _decode_legacy_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    from backend.models.user import User

    token = credentials.credentials

    payload = _decode_supabase_token(token)
    if payload:
        email = payload.get("email")
        if email:
            user = db.query(User).filter(User.email == email).first()
            if user is None:
                role = (payload.get("app_metadata") or {}).get("role", "loan_officer")
                user = User(email=email, hashed_password="", role=role)
                db.add(user)
                db.commit()
                db.refresh(user)
            return user

    payload = _decode_legacy_token(token)
    if payload:
        user = db.query(User).filter(User.id == payload.get("sub")).first()
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user

    raise HTTPException(status_code=401, detail="Invalid token")


def require_role(*roles: str):
    def checker(user=Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker
