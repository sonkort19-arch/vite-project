# Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor and run:

```sql
create table if not exists public.people_data (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table public.people_data enable row level security;

drop policy if exists "allow_anon_select_people_data" on public.people_data;
create policy "allow_anon_select_people_data"
on public.people_data
for select
to anon
using (true);

drop policy if exists "allow_anon_insert_people_data" on public.people_data;
create policy "allow_anon_insert_people_data"
on public.people_data
for insert
to anon
with check (true);

drop policy if exists "allow_anon_update_people_data" on public.people_data;
create policy "allow_anon_update_people_data"
on public.people_data
for update
to anon
using (true)
with check (true);
```

3. In Vercel project settings, add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Redeploy the project.

Notes:
- App stores all group data in one row with `id = 'main'`.
- If Supabase is not configured or unavailable, app falls back to localStorage.
