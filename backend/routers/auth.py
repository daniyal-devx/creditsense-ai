from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.auth import verify_password, create_access_token, hash_password
from backend.models.user import User
from backend.schemas import LoginRequest, LoginResponse

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": str(user.id), "role": user.role, "email": user.email})

    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 8,
        path="/",
    )

    return LoginResponse(
        access_token=token,
        user={"id": user.id, "email": user.email, "role": user.role},
    )


@router.post("/seed-admin")
def seed_admin(db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == "admin@creditsense.ai").first()
    if existing:
        return {"message": "Admin already exists"}
    admin = User(
        email="admin@creditsense.ai",
        hashed_password=hash_password("admin123"),
        role="admin",
    )
    db.add(admin)
    db.commit()
    return {"message": "Admin user created", "email": admin.email, "role": admin.role}
