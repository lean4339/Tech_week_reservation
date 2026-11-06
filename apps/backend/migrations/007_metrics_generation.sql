-- Separate database instances sharing Redis must never share cached reports.
ALTER TABLE public.metrics_revision
  ADD COLUMN generation uuid NOT NULL DEFAULT gen_random_uuid();
