from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database (use postgresql+psycopg:// for psycopg v3)
    database_url: str = "postgresql+psycopg://creditsense:creditsense@localhost:5432/creditsense"
    migration_database_url: str = ""
    db_strict: bool = False

    # JWT (legacy local auth; will be replaced by Supabase Auth in Wave 3)
    jwt_secret: str = "change-me-to-a-random-secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    # Groq AI Risk Copilot
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # CORS + environment
    cors_origins: str = "http://localhost:3000"
    environment: str = "development"

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
