-- Store the AI transcription of a session's presentation-slide photos.
alter table tradeshow_sessions add column if not exists transcript text;
