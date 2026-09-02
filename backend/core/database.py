from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from backend.core.config import settings


def _parse_db_url(url: str):
    if not url or not isinstance(url, str):
        raise RuntimeError(
            "DATABASE_URL is not set. Provide a PostgreSQL or SQLite URL."
        )
    if url.startswith("postgresql"):
        return url, "postgresql"
    if url.startswith("sqlite"):
        return url, "sqlite"
    raise ValueError(
        f"Unsupported DATABASE_URL scheme: {url.split('://')[0] if '://' in url else url}. "
        "Use postgresql:// or sqlite://"
    )


db_url, db_dialect = _parse_db_url(settings.database_url)

if db_dialect == "postgresql":
    engine = create_engine(
        db_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        pool_recycle=1800,
        connect_args={"prepare_threshold": 0},
    )
else:
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_dialect() -> str:
    return db_dialect
