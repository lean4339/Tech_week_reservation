CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL CHECK (
    name = btrim(name) AND char_length(name) BETWEEN 2 AND 120
  ),
  location varchar(254),
  capacity integer NOT NULL CHECK (capacity > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CONSTRAINT reservations_valid_period CHECK (
    isfinite(starts_at) AND isfinite(ends_at) AND starts_at < ends_at
  ),
  CONSTRAINT reservations_no_overlap EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (cancelled_at IS NULL)
);

CREATE INDEX reservations_user_start_idx ON public.reservations (user_id, starts_at);
CREATE INDEX reservations_room_start_idx ON public.reservations (room_id, starts_at);
