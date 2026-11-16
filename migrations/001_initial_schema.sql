CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  email varchar(254) NOT NULL UNIQUE,
  password_hash varchar(256) NOT NULL,
  role varchar(12) NOT NULL CHECK (role IN ('ADMIN', 'ONG', 'ADOTANTE'))
);

CREATE TABLE IF NOT EXISTS animals (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  species varchar(40) NOT NULL,
  breed varchar(120) NOT NULL,
  sex varchar(20) NOT NULL,
  size varchar(20) NOT NULL,
  city varchar(120) NOT NULL,
  state char(2) NOT NULL,
  age integer NOT NULL CHECK (age >= 0),
  description text NOT NULL,
  status varchar(12) NOT NULL CHECK (status IN ('DISPONIVEL', 'ADOTADO')),
  ong_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  photos text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS animals_status_species_idx ON animals(status, species);
CREATE INDEX IF NOT EXISTS animals_ong_idx ON animals(ong_id);

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY,
  animal_id uuid NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
  adopter_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason varchar(3000) NOT NULL DEFAULT '',
  status varchar(12) NOT NULL CHECK (status IN ('PENDENTE', 'APROVADA', 'RECUSADA')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS applications_adopter_idx ON applications(adopter_id);
CREATE INDEX IF NOT EXISTS applications_animal_status_idx ON applications(animal_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS applications_one_pending_per_adopter_animal_idx
  ON applications(animal_id, adopter_id) WHERE status = 'PENDENTE';
CREATE UNIQUE INDEX IF NOT EXISTS applications_one_approval_per_animal_idx
  ON applications(animal_id) WHERE status = 'APROVADA';

CREATE TABLE IF NOT EXISTS idempotency_keys (
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key varchar(128) NOT NULL,
  request_hash char(64) NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx ON idempotency_keys(created_at);
