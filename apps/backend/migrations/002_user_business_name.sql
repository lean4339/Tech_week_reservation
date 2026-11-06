ALTER TABLE auth.users
  ADD COLUMN business_name varchar(120),
  ADD CONSTRAINT users_business_name_valid CHECK (
    business_name IS NULL OR (
      business_name = btrim(business_name)
      AND char_length(business_name) BETWEEN 2 AND 120
      AND business_name !~ '[[:cntrl:]]'
    )
  );
