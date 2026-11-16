ALTER TABLE idempotency_keys ADD COLUMN scope_key text;
UPDATE idempotency_keys SET scope_key = 'user:' || actor_id::text;
ALTER TABLE idempotency_keys ALTER COLUMN scope_key SET NOT NULL;
ALTER TABLE idempotency_keys ADD COLUMN response_status integer NOT NULL DEFAULT 201
  CHECK (response_status BETWEEN 100 AND 599);
ALTER TABLE idempotency_keys DROP CONSTRAINT idempotency_keys_pkey;
ALTER TABLE idempotency_keys DROP COLUMN actor_id;
ALTER TABLE idempotency_keys ADD PRIMARY KEY (scope_key, idempotency_key);
