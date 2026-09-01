from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from backend.core.config import settings
import os

db_url = settings.database_url

if db_url.startswith("postgresql"):
    try:
        _test_engine = create_engine(db_url, pool_pre_ping=True)
        with _test_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        _test_engine.dispose()
    except Exception:
        db_url = "sqlite:///./creditsense.db"

connect_args = {"check_same_thread": False} if "sqlite" in db_url else {}
engine = create_engine(db_url, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
