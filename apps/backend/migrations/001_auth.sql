CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email varchar(254) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role varchar(16) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(btrim(email))),
  CHECK (length(password_hash) > 100)
);

CREATE INDEX users_role_idx ON auth.users (role);
