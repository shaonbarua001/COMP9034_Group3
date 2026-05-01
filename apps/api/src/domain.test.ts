import test from 'node:test';
import assert from 'node:assert/strict';
import { createPgMemDb } from './db/pgmem.js';
import { runMigrations } from './db/migrations.js';
import { logAudit } from './lib/audit.js';
import { detectExceptions } from './lib/exceptions.js';
import { calculatePayroll } from './lib/timecalc.js';

test('migrations are idempotent and core tables exist', async () => {
  const db = createPgMemDb();
  try {
    await runMigrations(db);
    await runMigrations(db);

    const tables = await db.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`
    );

    const names = new Set(tables.rows.map((row) => row.table_name));
    const required = [
      'staff',
      'stations',
      'staff_identity_methods',
      'rosters',
      'time_events',
      'time_adjustments',
      'pay_periods',
      'pay_runs',
      'pay_run_items',
      'exceptions',
      'audit_logs'
    ];

    for (const tableName of required) {
      assert.equal(names.has(tableName), true, `missing table: ${tableName}`);
    }
  } finally {
    await db.close?.();
  }
});

test('payroll calculator handles overtime deterministically', () => {
  const result = calculatePayroll(90, 38, 30, 45, 10);

  assert.equal(result.hours, 90);
  assert.equal(result.overtimeHours, 14);
  assert.equal(result.basePay, 2280);
  assert.equal(result.overtimePay, 630);
  assert.equal(result.totalPay, 2900);
});

test('exception detector catches missing out, no break and unrostered attempt', () => {
  const exceptions = detectExceptions({
    staffId: 1,
    date: '2026-04-20',
    hasRoster: false,
    events: [
      { eventType: 'clock_in', timestamp: '2026-04-20T08:00:00.000Z' },
      { eventType: 'clock_out', timestamp: '2026-04-20T13:30:00.000Z' }
    ]
  });

  const types = exceptions.map((item) => item.type);
  assert.equal(types.includes('no_break_over_4_hours'), true);
  assert.equal(types.includes('unrostered_attempt'), true);
});

test('audit logger persists records and returns reference id', async () => {
  const db = createPgMemDb();
  try {
    await runMigrations(db);

    const id = await logAudit(db, 'admin01', 'test.action', 'entity', 'entity-1', { ok: true });
    assert.equal(typeof id, 'number');

    const rows = await db.query<{ id: number }>('SELECT id FROM audit_logs WHERE id = $1', [id]);
    assert.equal(rows.rows.length, 1);
  } finally {
    await db.close?.();
  }
});
