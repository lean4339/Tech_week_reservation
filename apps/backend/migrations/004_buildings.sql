CREATE TABLE public.buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL CHECK (
    name = btrim(name) AND char_length(name) BETWEEN 2 AND 120 AND name !~ '[[:cntrl:]]'
  ),
  address varchar(254) NOT NULL CHECK (
    address = btrim(address) AND char_length(address) BETWEEN 2 AND 254 AND address !~ '[[:cntrl:]]'
  ),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Legacy rooms retain their data and bookings. The admin assigns their building;
-- API creation requires one, and booking requires an active building.
ALTER TABLE public.rooms ADD COLUMN building_id uuid
  REFERENCES public.buildings(id) ON DELETE RESTRICT;
CREATE INDEX rooms_building_idx ON public.rooms (building_id);
