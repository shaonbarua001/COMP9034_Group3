BEGIN;

DROP TABLE IF EXISTS
  pay_run_items,
  pay_runs,
  pay_periods,
  exceptions,
  time_adjustments,
  time_events,
  rosters,
  staff_identity_methods,
  stations,
  staff,
  audit_logs,
  schema_migrations
CASCADE;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  staff_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  standard_hours NUMERIC(8,2) NOT NULL,
  role TEXT NOT NULL,
  standard_rate NUMERIC(10,2) NOT NULL,
  overtime_rate NUMERIC(10,2) NOT NULL,
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  location TEXT NOT NULL,
  method_type TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_identity_methods (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL,
  external_ref TEXT,
  status TEXT NOT NULL,
  enrolled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, method_type)
);

CREATE TABLE IF NOT EXISTS rosters (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  station_id INTEGER REFERENCES stations(id) ON DELETE SET NULL,
  roster_date DATE NOT NULL,
  start_time TIME NOT NULL,
  planned_hours NUMERIC(8,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, roster_date, start_time)
);

CREATE TABLE IF NOT EXISTS time_events (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  station_id INTEGER REFERENCES stations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  method_type TEXT NOT NULL,
  break_type TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_adjustments (
  id SERIAL PRIMARY KEY,
  time_event_id INTEGER NOT NULL REFERENCES time_events(id) ON DELETE CASCADE,
  before_payload JSONB NOT NULL,
  after_payload JSONB NOT NULL,
  reason TEXT NOT NULL,
  adjusted_by TEXT NOT NULL,
  adjusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pay_periods (
  id SERIAL PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(start_date, end_date)
);

CREATE TABLE IF NOT EXISTS pay_runs (
  id SERIAL PRIMARY KEY,
  pay_period_id INTEGER NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pay_run_items (
  id SERIAL PRIMARY KEY,
  pay_run_id INTEGER NOT NULL REFERENCES pay_runs(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  hours NUMERIC(10,2) NOT NULL,
  overtime_hours NUMERIC(10,2) NOT NULL,
  base_pay NUMERIC(12,2) NOT NULL,
  overtime_pay NUMERIC(12,2) NOT NULL,
  deductions NUMERIC(12,2) NOT NULL,
  total_pay NUMERIC(12,2) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS exceptions (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  exception_date DATE NOT NULL,
  severity TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
