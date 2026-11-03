-- Sign-up requests from people who are not on the roster yet. An administrator
-- approves (adds the person to member_roster) or rejects each request. The phone
-- number is stored encrypted only while the request is pending.
create table prayer_app.signup_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  canonical_name text not null,
  phone_lookup_hash text not null,
  phone_ciphertext text,
  memo text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references prayer_app.users(id) on delete set null,
  roster_id uuid references prayer_app.member_roster(id) on delete set null,
  constraint signup_requests_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint signup_requests_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint signup_requests_memo_length check (char_length(memo) <= 200)
);

-- One pending request per person (name + phone).
create unique index signup_requests_pending_uq
  on prayer_app.signup_requests(canonical_name, phone_lookup_hash)
  where status = 'pending';

create index signup_requests_status_idx
  on prayer_app.signup_requests(status, created_at desc);

alter table prayer_app.signup_requests enable row level security;
revoke all on prayer_app.signup_requests from public, anon, authenticated;
