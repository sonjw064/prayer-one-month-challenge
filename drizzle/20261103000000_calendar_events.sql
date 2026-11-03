-- Community calendar: admin-managed, read-only for members. Dates and times are
-- stored as plain date/time values (the app is used in a single time zone, KST).
create table prayer_app.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  location text not null default '',
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  created_by uuid references prayer_app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_title_length check (char_length(btrim(title)) between 1 and 100),
  constraint calendar_events_description_length check (char_length(description) <= 2000),
  constraint calendar_events_location_length check (char_length(location) <= 100),
  constraint calendar_events_date_order check (end_date >= start_date),
  constraint calendar_events_time_pair check (start_time is not null or end_time is null)
);

create index calendar_events_dates_idx
  on prayer_app.calendar_events(start_date, end_date);

alter table prayer_app.calendar_events enable row level security;
revoke all on prayer_app.calendar_events from public, anon, authenticated;
