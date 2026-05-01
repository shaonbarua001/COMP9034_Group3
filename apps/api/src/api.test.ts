import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from './app.js';
import { createPgMemDb } from './db/pgmem.js';
import { runMigrations } from './db/migrations.js';
import { hashPassword } from './lib/auth.js';
import { loadSupabaseConfig } from './lib/runtime-config.js';

const basePath = '/api/v1';
const authSecret = 'test-secret';

async function setup() {
  const db = createPgMemDb();
  await runMigrations(db);
  const app = createApp({
    db,
    basePath,
    authSecret,
    supabase: loadSupabaseConfig({} as NodeJS.ProcessEnv)
  });

  await db.query(
    `INSERT INTO staff (staff_id, name, contract_type, standard_hours, role, standard_rate, overtime_rate, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    ['admin01', 'Admin User', 'full_time', 38, 'admin', 45, 68, hashPassword('AdminPass123!')]
  );

  return { app, db };
}

async function loginAs(app: ReturnType<typeof createApp>, staffId: string, password: string): Promise<string> {
  const response = await request(app)
    .post(`${basePath}/auth/login`)
    .send({ staffId, password })
    .expect(200);
  return response.body.token as string;
}

test('health + swagger routes are reachable', async () => {
  const { app, db } = await setup();
  try {
    const health = await request(app).get(`${basePath}/health`).expect(200);
    assert.equal(health.body.status, 'ok');

    const openapi = await request(app).get(`${basePath}/openapi.json`).expect(200);
    assert.equal(openapi.body.openapi, '3.0.3');

    const docs = await request(app).get(`${basePath}/docs`).expect(301);
    assert.match(docs.headers.location ?? '', /\/api\/v1\/docs\/$/);
  } finally {
    await db.close?.();
  }
});

test('supabase integration status endpoint returns disabled in test environment', async () => {
  const { app, db } = await setup();
  try {
    const adminToken = await loginAs(app, 'admin01', 'AdminPass123!');
    const response = await request(app)
      .get(`${basePath}/integrations/supabase/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    assert.equal(response.body.enabled, false);
    assert.equal(response.body.mode, 'disabled');
    assert.equal(response.body.db.reachable, true);
  } finally {
    await db.close?.();
  }
});

test('full backend flow: staff/station/roster/events/reports/exceptions/payroll', async () => {
  const { app, db } = await setup();
  try {
    const adminToken = await loginAs(app, 'admin01', 'AdminPass123!');

    const staff = await request(app)
      .post(`${basePath}/staff`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        staffId: 'staff01',
        name: 'Field Worker',
        contractType: 'full_time',
        standardHours: 38,
        role: 'staff',
        standardRate: 30,
        overtimeRate: 45,
        password: 'WorkerPass123!'
      })
      .expect(201);
    assert.ok(staff.body.auditReferenceId);

    const station = await request(app)
      .post(`${basePath}/stations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Station A', location: 'North Field', methodType: 'fingerprint' })
      .expect(201);
    const stationId = station.body.data.id as number;

    await request(app)
      .put(`${basePath}/staff/staff01/identity-methods/fingerprint`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'registered', externalRef: 'fp-001' })
      .expect(200);

    await request(app)
      .post(`${basePath}/rosters`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entries: [
          {
            staffId: 'staff01',
            stationId,
            date: '2026-04-20',
            startTime: '08:00',
            plannedHours: 8
          }
        ]
      })
      .expect(201);

    await request(app)
      .post(`${basePath}/time-events`)
      .send({
        staffId: 'staff01',
        stationId,
        eventType: 'clock_in',
        methodType: 'fingerprint',
        timestamp: '2026-04-20T08:00:00.000Z'
      })
      .expect(201);

    await request(app)
      .post(`${basePath}/time-events`)
      .send({
        staffId: 'staff01',
        stationId,
        eventType: 'clock_out',
        methodType: 'fingerprint',
        timestamp: '2026-04-20T17:00:00.000Z'
      })
      .expect(201);

    const attendance = await request(app)
      .get(`${basePath}/reports/attendance?from=2026-04-20&to=2026-04-20`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(attendance.body.data[0].staffId, 'admin01');
    assert.equal(attendance.body.data[1].staffId, 'staff01');

    const attendanceCsv = await request(app)
      .get(`${basePath}/reports/attendance.csv?from=2026-04-20&to=2026-04-20`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.match(attendanceCsv.text, /staffId/);

    const detected = await request(app)
      .post(`${basePath}/exceptions/detect`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ from: '2026-04-20', to: '2026-04-20' })
      .expect(200);
    assert.ok(Array.isArray(detected.body.data));

    const payRun = await request(app)
      .post(`${basePath}/payroll/runs/generate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startDate: '2026-04-14', endDate: '2026-04-27' })
      .expect(201);

    const payRunId = payRun.body.data.payRunId as number;

    const payslips = await request(app)
      .get(`${basePath}/payroll/runs/${payRunId}/payslips`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.ok(payslips.body.data.length >= 1);

    await request(app)
      .post(`${basePath}/payroll/runs/${payRunId}/finalize`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const payrollCsv = await request(app)
      .get(`${basePath}/payroll/runs/${payRunId}/payslips.csv`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.match(payrollCsv.text, /total_pay/);
  } finally {
    await db.close?.();
  }
});

test('role guard blocks staff from admin endpoints', async () => {
  const { app, db } = await setup();
  try {
    const adminToken = await loginAs(app, 'admin01', 'AdminPass123!');

    await request(app)
      .post(`${basePath}/staff`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        staffId: 'staff02',
        name: 'Staff User',
        contractType: 'part_time',
        standardHours: 20,
        role: 'staff',
        standardRate: 20,
        overtimeRate: 35,
        password: 'StaffPass123!'
      })
      .expect(201);

    const staffToken = await loginAs(app, 'staff02', 'StaffPass123!');

    await request(app)
      .post(`${basePath}/stations`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Station B', location: 'South', methodType: 'card' })
      .expect(403);
  } finally {
    await db.close?.();
  }
});
