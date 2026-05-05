# Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor and run:

```sql
create table if not exists public.people_data (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
```

3. In table editor, ensure one row can be written from frontend using anon key.
4. In Vercel project settings, add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Redeploy the project.

Notes:
- App stores all group data in one row with `id = 'main'`.
- If Supabase is not configured or unavailable, app falls back to localStorage.
