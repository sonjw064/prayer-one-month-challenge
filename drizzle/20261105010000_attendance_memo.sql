-- Optional note per checked person (e.g. why someone was absent). Existing records get an empty note.
alter table prayer_app.attendance_records
  add column memo text not null default '',
  add constraint attendance_records_memo_length check (char_length(memo) <= 200);
