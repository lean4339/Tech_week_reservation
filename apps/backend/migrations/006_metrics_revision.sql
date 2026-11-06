-- Transactional generation: a cache entry from an older snapshot can never mask
-- a committed business write, even if Redis is unavailable during that write.
CREATE TABLE public.metrics_revision (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  revision bigint NOT NULL DEFAULT 0
);
INSERT INTO public.metrics_revision DEFAULT VALUES;
CREATE FUNCTION public.bump_metrics_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.metrics_revision SET revision = revision + 1 WHERE singleton;
  RETURN NULL;
END;
$$;
CREATE TRIGGER metrics_reservations_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
ON public.reservations FOR EACH STATEMENT EXECUTE FUNCTION public.bump_metrics_revision();
CREATE TRIGGER metrics_rooms_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
ON public.rooms FOR EACH STATEMENT EXECUTE FUNCTION public.bump_metrics_revision();
CREATE TRIGGER metrics_buildings_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
ON public.buildings FOR EACH STATEMENT EXECUTE FUNCTION public.bump_metrics_revision();
CREATE TRIGGER metrics_clients_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
ON auth.users FOR EACH STATEMENT EXECUTE FUNCTION public.bump_metrics_revision();
