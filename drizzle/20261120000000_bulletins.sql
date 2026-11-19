-- Weekly bulletin (주보): page images only (the original PDF is never stored).
-- A bulletin is hidden 30 days after its date and deleted at the next cleanup.
create table prayer_app.bulletins (
  id uuid primary key default gen_random_uuid(),
  bulletin_date date not null,
  title text not null,
  page_count integer not null,
  status text not null default 'draft',
  version uuid not null default gen_random_uuid(),
  created_by uuid references prayer_app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint bulletins_status_check check (status in ('draft', 'published', 'hidden')),
  constraint bulletins_page_count_check check (page_count between 1 and 20),
  constraint bulletins_title_length check (char_length(btrim(title)) between 1 and 100)
);

-- Only one live (published or hidden) bulletin per date; drafts may repeat.
create unique index bulletins_live_date_uq
  on prayer_app.bulletins(bulletin_date)
  where status <> 'draft';
create index bulletins_date_idx
  on prayer_app.bulletins(bulletin_date desc);

create table prayer_app.bulletin_pages (
  bulletin_id uuid not null references prayer_app.bulletins(id) on delete cascade,
  page_no integer not null,
  image bytea not null,
  width integer not null,
  height integer not null,
  thumb bytea not null,
  primary key (bulletin_id, page_no),
  constraint bulletin_pages_page_no_check check (page_no between 1 and 20)
);

alter table prayer_app.bulletins enable row level security;
alter table prayer_app.bulletin_pages enable row level security;
revoke all on prayer_app.bulletins, prayer_app.bulletin_pages from public, anon, authenticated;
