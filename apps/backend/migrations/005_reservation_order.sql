-- Support the administrative agenda's chronological pagination without a date filter.
CREATE INDEX reservations_start_id_idx ON public.reservations (starts_at, id);
