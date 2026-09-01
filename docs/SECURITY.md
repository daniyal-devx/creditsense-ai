# Security Notes

## Current controls

- Runtime configuration comes from environment variables; `.env` and `.env.local` are ignored by Git.
- The backend image and frontend runtime image run as non-root users.
- CORS is configured from `CORS_ORIGINS` rather than allowing arbitrary origins.
- The frontend receives only public Supabase variables and the public backend base URL.
- The health endpoint reports artifact metadata but not secrets.

## Required production configuration

Use a private managed database, a strong unique `JWT_SECRET`, restricted `CORS_ORIGINS`, and secret storage provided by the deployment platform. Keep `GROQ_API_KEY`, database passwords, service-role keys, and Supabase JWT secrets out of browser-visible variables and source control.

## Known gaps

Supabase schema migrations, RLS, and production Supabase Auth integration are pending. The legacy local JWT path is for demo use and should be removed or replaced before a production deployment. This prototype has not received a penetration test or a compliance certification.

The middleware route gate accepts a `legacy_session` marker cookie so the legacy login can navigate locally. That cookie is a presence flag rather than a credential, it is only honored when `NODE_ENV` is not `production`, and it is cleared on sign-out. Actual authorization still depends on the bearer token that the backend verifies on every API request.
