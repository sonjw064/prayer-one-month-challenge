-- Admins can flag an event as important; the UI shows important events in red.
-- Existing events stay "not important".
alter table prayer_app.calendar_events
  add column is_important boolean not null default false;
