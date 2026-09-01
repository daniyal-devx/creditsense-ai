# Deployment

## Local containers

```bash
docker compose up --build
docker compose --profile seed up seed
```

The first command starts PostgreSQL, backend, and frontend. The second command is intentionally destructive to the Compose database: it recreates all current SQLAlchemy tables and loads the deterministic demo personas. Do not run the seed profile against a shared or production database.

## Backend deployment

`railway.json` uses the root Dockerfile. Configure `DATABASE_URL` with a psycopg v3 SQLAlchemy URL, `DB_STRICT=true`, `JWT_SECRET`, `CORS_ORIGINS`, and optionally `GROQ_API_KEY` and `GROQ_MODEL`. Railway verifies the service through `/health`.

## Frontend deployment

Deploy the `frontend/` directory with the supplied `vercel.json`. Set `NEXT_PUBLIC_API_URL` to the public HTTPS address of the backend because browser clients call it directly. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` when enabling the Supabase client scaffolding.

## Pending production work

The project currently uses SQLAlchemy `create_all` at application startup. Do not represent it as migration-managed until Alembic migrations, Supabase schema, RLS, and authentication integration have been implemented and tested.
