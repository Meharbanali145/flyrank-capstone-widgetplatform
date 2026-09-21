-- Up Migration
CREATE TABLE tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  api_key_hash  text NOT NULL UNIQUE,          -- sha256 of the API key; raw key is never stored
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE widgets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id    text NOT NULL UNIQUE,           -- short id used in the embed snippet
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('signup_form','contact_form','cta')),
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  button_text  text NOT NULL DEFAULT 'Submit',
  fields       jsonb NOT NULL DEFAULT '[]',
  options      jsonb NOT NULL DEFAULT '{}',
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX widgets_tenant_created_idx ON widgets (tenant_id, created_at DESC);

CREATE TABLE submissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id        uuid NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data             jsonb NOT NULL,
  ip_address       inet,
  country          text,
  region           text,
  city             text,
  geo_provider     text,
  idempotency_key  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submissions_idem_uq UNIQUE (widget_id, idempotency_key)
);
CREATE INDEX submissions_tenant_created_idx ON submissions (tenant_id, created_at DESC);
CREATE INDEX submissions_widget_created_idx ON submissions (widget_id, created_at DESC);
CREATE INDEX submissions_tenant_country_idx ON submissions (tenant_id, country);

CREATE TABLE jobs (
  id            bigserial PRIMARY KEY,
  type          text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','dead')),
  attempts      int  NOT NULL DEFAULT 0,
  max_attempts  int  NOT NULL DEFAULT 5,
  run_at        timestamptz NOT NULL DEFAULT now(),
  locked_at     timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_claim_idx ON jobs (status, run_at);

-- Down Migration
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS widgets;
DROP TABLE IF EXISTS tenants;
