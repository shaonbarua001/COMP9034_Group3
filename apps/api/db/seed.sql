BEGIN;

INSERT INTO staff (
  id,
  staff_id,
  name,
  contract_type,
  standard_hours,
  role,
  standard_rate,
  overtime_rate,
  password_hash,
  active
) VALUES
  (1, 'admin01', 'Admin User', 'full_time', 38, 'admin', 48, 72, '$2a$10$ljEf6YvaVu08mnLA9cc8tO7aNqbk8YSJixgAYqoRfCLgz6hsWolJC', TRUE),
  (2, 'staff01', 'Ava Orchard', 'full_time', 38, 'staff', 32, 48, '$2a$10$ljEf6YvaVu08mnLA9cc8tO7aNqbk8YSJixgAYqoRfCLgz6hsWolJC', TRUE),
  (3, 'staff02', 'Luca Harvest', 'part_time', 24, 'staff', 28, 42, '$2a$10$ljEf6YvaVu08mnLA9cc8tO7aNqbk8YSJixgAYqoRfCLgz6hsWolJC', TRUE),
  (4, 'staff03', 'Mia Greenhouse', 'casual', 16, 'staff', 30, 45, '$2a$10$ljEf6YvaVu08mnLA9cc8tO7aNqbk8YSJixgAYqoRfCLgz6hsWolJC', TRUE);

INSERT INTO stations (id, name, location, method_type, active) VALUES
  (1, 'Station A', 'North Field', 'fingerprint', TRUE),
  (2, 'Station B', 'South Gate', 'card', TRUE),
  (3, 'Station C', 'Packing Shed', 'face', TRUE);

INSERT INTO staff_identity_methods (staff_id, method_type, external_ref, status, enrolled_at) VALUES
  (2, 'fingerprint', 'fp-ava-001', 'registered', NOW() - INTERVAL '20 days'),
  (2, 'card', 'card-ava-001', 'active', NOW() - INTERVAL '20 days'),
  (3, 'card', 'card-luca-001', 'active', NOW() - INTERVAL '15 days'),
  (4, 'face', 'face-mia-001', 'pending', NOW() - INTERVAL '7 days');

INSERT INTO rosters (staff_id, station_id, roster_date, start_time, planned_hours, notes) VALUES
  (2, 1, '2026-04-20', '08:00', 8, 'Harvest run'),
  (3, 2, '2026-04-20', '09:00', 6, 'Packhouse support'),
  (2, 1, '2026-04-21', '08:00', 8, 'Harvest run'),
  (3, 3, '2026-04-21', '10:00', 5, 'Sorting line'),
  (4, 3, '2026-04-21', '12:00', 4, 'Casual afternoon shift');

INSERT INTO time_events (staff_id, station_id, event_type, method_type, break_type, event_timestamp, reason, created_by) VALUES
  (2, 1, 'clock_in', 'fingerprint', NULL, '2026-04-20T08:01:00Z', NULL, 'staff01'),
  (2, 1, 'break_start', 'fingerprint', 'lunch', '2026-04-20T12:00:00Z', NULL, 'staff01'),
  (2, 1, 'break_end', 'fingerprint', 'lunch', '2026-04-20T12:30:00Z', NULL, 'staff01'),
  (2, 2, 'clock_out', 'card', NULL, '2026-04-20T17:05:00Z', NULL, 'staff01'),
  (3, 2, 'clock_in', 'card', NULL, '2026-04-20T09:03:00Z', NULL, 'staff02'),
  (3, 2, 'clock_out', 'card', NULL, '2026-04-20T15:40:00Z', NULL, 'staff02'),
  (4, 3, 'clock_in', 'face', NULL, '2026-04-21T12:05:00Z', NULL, 'staff03');

INSERT INTO time_adjustments (time_event_id, before_payload, after_payload, reason, adjusted_by) VALUES
  (
    6,
    '{"event_timestamp":"2026-04-20T15:35:00Z"}'::jsonb,
    '{"event_timestamp":"2026-04-20T15:40:00Z"}'::jsonb,
    'Corrected terminal clock drift',
    'admin01'
  );

INSERT INTO exceptions (type, staff_id, exception_date, severity, notes, status) VALUES
  ('missing_clock_out', 4, '2026-04-21', 'high', 'Clock-out missing for casual shift.', 'open'),
  ('no_break_over_4_hours', 3, '2026-04-20', 'medium', 'No recorded break over long shift.', 'resolved');

INSERT INTO pay_periods (id, start_date, end_date, status) VALUES
  (1, '2026-04-14', '2026-04-27', 'open');

INSERT INTO pay_runs (id, pay_period_id, status, generated_at, created_by) VALUES
  (1, 1, 'draft', NOW() - INTERVAL '1 day', 'admin01');

INSERT INTO pay_run_items (pay_run_id, staff_id, hours, overtime_hours, base_pay, overtime_pay, deductions, total_pay, details) VALUES
  (1, 2, 76, 2, 2432, 96, 0, 2528, '{"note":"sample payslip"}'::jsonb),
  (1, 3, 48, 0, 1344, 0, 0, 1344, '{"note":"sample payslip"}'::jsonb),
  (1, 4, 18, 0, 540, 0, 0, 540, '{"note":"sample payslip"}'::jsonb);

INSERT INTO audit_logs (actor, action, entity, entity_id, payload) VALUES
  ('admin01', 'seed.bootstrap', 'system', 'seed-2026-04-21', '{"source":"apps/api/db/seed.sql"}'::jsonb),
  ('admin01', 'exception.resolve', 'exceptions', '2', '{"notes":"Reviewed and accepted"}'::jsonb);

SELECT setval('staff_id_seq', (SELECT MAX(id) FROM staff));
SELECT setval('stations_id_seq', (SELECT MAX(id) FROM stations));
SELECT setval('staff_identity_methods_id_seq', (SELECT MAX(id) FROM staff_identity_methods));
SELECT setval('rosters_id_seq', (SELECT MAX(id) FROM rosters));
SELECT setval('time_events_id_seq', (SELECT MAX(id) FROM time_events));
SELECT setval('time_adjustments_id_seq', (SELECT MAX(id) FROM time_adjustments));
SELECT setval('pay_periods_id_seq', (SELECT MAX(id) FROM pay_periods));
SELECT setval('pay_runs_id_seq', (SELECT MAX(id) FROM pay_runs));
SELECT setval('pay_run_items_id_seq', (SELECT MAX(id) FROM pay_run_items));
SELECT setval('exceptions_id_seq', (SELECT MAX(id) FROM exceptions));
SELECT setval('audit_logs_id_seq', (SELECT MAX(id) FROM audit_logs));

COMMIT;
