# Farming Time Management PoC

## Local deployment

```bash
cp .env.example .env
pnpm install
pnpm run dev
```

The app runs locally as a monorepo:

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api/v1`
- Swagger UI: `http://localhost:4000/api/v1/docs`

### Environment setup

Copy `.env.example` to `.env` before starting the project:

```bash
cp .env.example .env
```

The committed `.env.example` is intentionally sanitized so it is safe to keep in Git. It includes the local ports and URL defaults used by this project, including:

- `API_PORT=4000`
- `API_BASE_PATH=/api/v1`
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`
- `DATABASE_URL` and `DB_URL` pointing to a local Postgres / Supabase instance on `127.0.0.1:54322`

If you are running local Supabase, generate the runtime values from the CLI instead of committing real keys:

```bash
supabase start
supabase status -o env
```

The Supabase CLI documents `supabase status -o env` as the way to export local connection parameters such as `JWT_SECRET`, `ANON_KEY`, and `SERVICE_ROLE_KEY`. citeturn0search0turn0search2

To write those values into your `.env`, append the exported output after copying the example file:

```bash
cp .env.example .env
supabase status -o env >> .env
```

If you prefer to review the generated values first, redirect them to a temporary file and then copy the keys you need into `.env`.

### Run locally

1. Install dependencies:

```bash
pnpm install
```

2. Start the frontend and backend together from the repository root:

```bash
pnpm run dev
```

3. Open the app and API docs:

```text
Frontend: http://localhost:3000
API: http://localhost:4000/api/v1
Swagger UI: http://localhost:4000/api/v1/docs
```

### Database notes

- If `.env` contains `DATABASE_URL` or `DB_URL`, the API will connect to that Postgres database.
- The URL defaults in `.env.example` target a local Supabase/Postgres setup on `127.0.0.1:54322`.
- If neither `DATABASE_URL` nor `DB_URL` is set, the API falls back to an in-memory database for local runtime.

## Monorepo apps

- `apps/web`: Next.js frontend shell
- `apps/api`: Express + TypeScript API
- `packages/shared`: shared contracts and enums

## Backend docs and scripts

- Swagger UI: `http://localhost:4000/api/v1/docs`
- OpenAPI JSON: `http://localhost:4000/api/v1/openapi.json`
- Supabase integration status (admin): `GET /api/v1/integrations/supabase/status`
- Run DB migrations (Postgres mode):

```bash
pnpm --filter @farm/api run migrate
```

- Seed fake data into local Supabase Postgres (`DB_URL` or `DATABASE_URL`):

```bash
pnpm --filter @farm/api run seed
```

- SQL files:
  - `apps/api/db/clean_create.sql` (drop + create schema)
  - `apps/api/db/seed.sql` (fake data inserts)
- Seed login password for inserted users: `SeedPass123!`

## Environment

Copy `.env.example` to `.env` when you need overrides. Defaults are usable for local startup.
