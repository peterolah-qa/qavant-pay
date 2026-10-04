-- Qavant Pay schema. Idempotent: safe to run on every deploy.
-- Money is BIGINT cents; the CHECK constraint is a last line of defence –
-- even a bug in application code cannot drive a balance below zero.

CREATE TABLE IF NOT EXISTS sandboxes (
  id                  uuid        PRIMARY KEY,
  created_at          timestamptz NOT NULL,
  holder              text        NOT NULL,
  iban                text        NOT NULL,
  balance_cents       bigint      NOT NULL CHECK (balance_cents >= 0),
  pin_failed_attempts integer     NOT NULL DEFAULT 0,
  pin_locked_until    timestamptz,
  authenticated       boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS sandboxes_created_at_idx ON sandboxes (created_at);

-- Append-only ledger: rows are inserted, never updated or deleted (except with the whole sandbox).
CREATE TABLE IF NOT EXISTS transactions (
  id                text        PRIMARY KEY,
  sandbox_id        uuid        NOT NULL REFERENCES sandboxes (id) ON DELETE CASCADE,
  seq               integer     NOT NULL,
  name              text        NOT NULL,
  type              text        NOT NULL CHECK (type IN ('income', 'spending', 'bills')),
  category          text        NOT NULL,
  amount_cents      bigint      NOT NULL CHECK (amount_cents <> 0),
  booked_at         timestamptz NOT NULL,
  status            text        NOT NULL,
  counterparty_iban text,
  note              text,
  UNIQUE (sandbox_id, seq)
);

CREATE INDEX IF NOT EXISTS transactions_sandbox_booked_idx ON transactions (sandbox_id, booked_at DESC);

-- The PRIMARY KEY makes a second transfer with the same Idempotency-Key physically impossible.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  sandbox_id  uuid        NOT NULL REFERENCES sandboxes (id) ON DELETE CASCADE,
  key         text        NOT NULL,
  fingerprint text        NOT NULL,
  status      integer     NOT NULL,
  body        jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sandbox_id, key)
);
