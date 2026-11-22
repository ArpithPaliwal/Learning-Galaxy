-- Learning Galaxy cloud sync. Run once in Supabase → SQL Editor → New query → Run.
-- One row per app document ("topics/abc"). Row-level security: each signed-in user sees only their own rows.

create table if not exists public.lg_docs (
  user_id   uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  path      text        not null,               -- "collection/docId"
  col       text        not null,               -- collection name, for queries and the cloud job
  data      jsonb,                               -- the document (null when deleted)
  updated   bigint      not null default 0,     -- client clock (ms) of the last edit: last writer wins
  deleted   boolean     not null default false, -- tombstone so deletes sync too
  server_ts timestamptz not null default clock_timestamp(), -- pull cursor, set by the server
  primary key (user_id, path)
);
create index if not exists lg_docs_pull on public.lg_docs (user_id, server_ts);
create index if not exists lg_docs_col on public.lg_docs (user_id, col);

-- Keep the newest edit and stamp server_ts on every accepted write.
create or replace function public.lg_docs_touch() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated < old.updated then
    return old; -- an older edit arrived late: keep what we have
  end if;
  new.server_ts := clock_timestamp();
  return new;
end $$;
drop trigger if exists lg_docs_touch on public.lg_docs;
create trigger lg_docs_touch before insert or update on public.lg_docs for each row execute function public.lg_docs_touch();

alter table public.lg_docs enable row level security;
drop policy if exists "own rows" on public.lg_docs;
create policy "own rows" on public.lg_docs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
