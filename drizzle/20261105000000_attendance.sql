-- Sam (small group) attendance. One session per sam and meeting date holds the head count
-- at the time of saving (the denominator for attendance rates); one record per checked person.
-- People who are not checked have no record ("unchecked" = headcount - records).
create table prayer_app.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null,
  sam_id uuid references prayer_app.sams(id) on delete set null,
  sam_name text not null,
  village text not null default '',
  headcount integer not null,
  saved_by uuid references prayer_app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_sessions_headcount_check check (headcount >= 0)
);

create unique index attendance_sessions_date_sam_uq
  on prayer_app.attendance_sessions(meeting_date, sam_id);
create index attendance_sessions_date_idx
  on prayer_app.attendance_sessions(meeting_date);

create table prayer_app.attendance_records (
  session_id uuid not null references prayer_app.attendance_sessions(id) on delete cascade,
  roster_id uuid not null references prayer_app.member_roster(id) on delete cascade,
  status text not null,
  primary key (session_id, roster_id),
  constraint attendance_records_status_check check (status in ('present', 'absent', 'worship_only'))
);

create index attendance_records_roster_idx
  on prayer_app.attendance_records(roster_id);

alter table prayer_app.attendance_sessions enable row level security;
alter table prayer_app.attendance_records enable row level security;
revoke all on prayer_app.attendance_sessions, prayer_app.attendance_records from public, anon, authenticated;
