-- Formatted meeting notes body for the desktop Meetings feature. Rendered as a small
-- markdown subset (## headings, - bullets, **bold**) via FormattedNotes in Meetings.jsx.
alter table meetings add column if not exists notes text;
