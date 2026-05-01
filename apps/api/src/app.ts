import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import swaggerUi from 'swagger-ui-express';
import type { Queryable } from './db/types.js';
import { logAudit } from './lib/audit.js';
import { detectExceptions } from './lib/exceptions.js';
import { login, readAuth, requireRole, hashPassword } from './lib/auth.js';
import type { SupabaseConfig } from './lib/runtime-config.js';
import { getSupabaseStatus } from './lib/supabase.js';
import { calculatePayroll, computeWorkedHours, type TimeEvent } from './lib/timecalc.js';

export interface AppConfig {
  db: Queryable;
  basePath: string;
  authSecret: string;
  supabase: SupabaseConfig;
}

function asNumber(value: unknown): number {
  return Number(value ?? 0);
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return '';
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map((header) => {
      const raw = row[header];
      const text = raw === null || raw === undefined ? '' : String(raw);
      return `"${text.replaceAll('"', '""')}"`;
    });
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

function dateBounds(from: string, to: string): { start: string; endExclusive: string } {
  const start = `${from}T00:00:00.000Z`;
  const endDate = new Date(`${to}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const endExclusive = endDate.toISOString();
  return { start, endExclusive };
}

async function getWorkedHoursByStaff(
  db: Queryable,
  startDate: string,
  endDate: string
): Promise<Map<number, number>> {
  const bounds = dateBounds(startDate, endDate);
  const result = await db.query<{
    staff_id: number;
    event_type: string;
    event_timestamp: string;
  }>(
    `SELECT staff_id, event_type, event_timestamp
     FROM time_events
      WHERE event_timestamp >= $1 AND event_timestamp < $2
     ORDER BY staff_id, event_timestamp ASC`,
    [bounds.start, bounds.endExclusive]
  );

  const eventsByStaff = new Map<number, TimeEvent[]>();
  for (const row of result.rows) {
    const current = eventsByStaff.get(row.staff_id) ?? [];
    current.push({ eventType: row.event_type, timestamp: row.event_timestamp });
    eventsByStaff.set(row.staff_id, current);
  }

  const hoursByStaff = new Map<number, number>();
  for (const [staffId, events] of eventsByStaff.entries()) {
    hoursByStaff.set(staffId, computeWorkedHours(events));
  }
  return hoursByStaff;
}

export function createOpenApiSpec(basePath: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Farming Time Management API',
      version: '0.2.0'
    },
    paths: {
      [`${basePath}/health`]: { get: { summary: 'Health check' } },
      [`${basePath}/staff`]: { get: { summary: 'List staff' }, post: { summary: 'Create staff' } },
      [`${basePath}/stations`]: { get: { summary: 'List stations' }, post: { summary: 'Create station' } },
      [`${basePath}/rosters`]: { get: { summary: 'List rosters' }, post: { summary: 'Upsert rosters' } },
      [`${basePath}/time-events`]: { post: { summary: 'Submit clock event' } },
      [`${basePath}/reports/attendance`]: { get: { summary: 'Attendance summary report' } },
      [`${basePath}/payroll/runs/generate`]: { post: { summary: 'Generate payroll run' } },
      [`${basePath}/exceptions/detect`]: { post: { summary: 'Detect compliance exceptions' } },
      [`${basePath}/integrations/supabase/status`]: { get: { summary: 'Supabase local integration status' } }
    }
  };
}

export function createApp(config: AppConfig) {
  const app = express();
  const { db, basePath, authSecret, supabase } = config;

  const openApiSpec = createOpenApiSpec(basePath);

  app.use(
    cors({
      origin: true
    })
  );
  app.use(express.json());

  app.get(`${basePath}/openapi.json`, (_req, res) => {
    res.json(openApiSpec);
  });
  app.use(`${basePath}/docs`, swaggerUi.serve, swaggerUi.setup(openApiSpec));

  app.get(`${basePath}/health`, (_req, res) => {
    res.json({ status: 'ok', service: '@farm/api', timestamp: new Date().toISOString() });
  });

  app.post(`${basePath}/auth/login`, async (req, res) => {
    const schema = z.object({ staffId: z.string().min(1), password: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const session = await login(db, parsed.data.staffId, parsed.data.password, authSecret);
    if (!session) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    res.json(session);
  });

  app.get('/', (_req, res) => {
    res.send('Farming Time Management API');
  });

  const requireAdmin = requireRole('admin', authSecret);

  app.get(`${basePath}/integrations/supabase/status`, requireAdmin, async (_req, res) => {
    const status = await getSupabaseStatus(db, supabase);
    res.json(status);
  });

  app.post(`${basePath}/staff`, requireAdmin, async (req, res) => {
    const schema = z.object({
      staffId: z.string().min(1),
      name: z.string().min(1),
      contractType: z.enum(['casual', 'part_time', 'full_time']),
      standardHours: z.number().positive(),
      role: z.enum(['admin', 'staff']),
      standardRate: z.number().positive(),
      overtimeRate: z.number().positive(),
      password: z.string().min(8).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const auth = readAuth(req, authSecret);
    const passwordHash = hashPassword(parsed.data.password ?? 'ChangeMe123!');

    const created = await db.query(
      `INSERT INTO staff (staff_id, name, contract_type, standard_hours, role, standard_rate, overtime_rate, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING staff_id, name, contract_type, standard_hours, role, standard_rate, overtime_rate, active`,
      [
        parsed.data.staffId,
        parsed.data.name,
        parsed.data.contractType,
        parsed.data.standardHours,
        parsed.data.role,
        parsed.data.standardRate,
        parsed.data.overtimeRate,
        passwordHash
      ]
    );

    const staff = created.rows[0];
    const auditReferenceId = await logAudit(db, auth.actor, 'staff.create', 'staff', String(staff.staff_id), staff);

    res.status(201).json({ data: staff, auditReferenceId });
  });

  app.get(`${basePath}/staff`, requireAdmin, async (_req, res) => {
    const result = await db.query(
      `SELECT staff_id, name, contract_type, standard_hours, role, standard_rate, overtime_rate, active
       FROM staff ORDER BY staff_id ASC`
    );
    res.json({ data: result.rows });
  });

  app.patch(`${basePath}/staff/:staffId`, requireAdmin, async (req, res) => {
    const schema = z.object({
      name: z.string().min(1).optional(),
      contractType: z.enum(['casual', 'part_time', 'full_time']).optional(),
      standardHours: z.number().positive().optional(),
      role: z.enum(['admin', 'staff']).optional(),
      standardRate: z.number().positive().optional(),
      overtimeRate: z.number().positive().optional(),
      active: z.boolean().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const result = await db.query(
      `UPDATE staff
       SET
         name = COALESCE($2, name),
         contract_type = COALESCE($3, contract_type),
         standard_hours = COALESCE($4, standard_hours),
         role = COALESCE($5, role),
         standard_rate = COALESCE($6, standard_rate),
         overtime_rate = COALESCE($7, overtime_rate),
         active = COALESCE($8, active),
         updated_at = NOW()
       WHERE staff_id = $1
       RETURNING staff_id, name, contract_type, standard_hours, role, standard_rate, overtime_rate, active`,
      [
        req.params.staffId,
        parsed.data.name ?? null,
        parsed.data.contractType ?? null,
        parsed.data.standardHours ?? null,
        parsed.data.role ?? null,
        parsed.data.standardRate ?? null,
        parsed.data.overtimeRate ?? null,
        parsed.data.active ?? null
      ]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'staff_not_found' });
      return;
    }

    const auth = readAuth(req, authSecret);
    const auditReferenceId = await logAudit(
      db,
      auth.actor,
      'staff.update',
      'staff',
      req.params.staffId,
      parsed.data
    );

    res.json({ data: result.rows[0], auditReferenceId });
  });

  app.delete(`${basePath}/staff/:staffId`, requireAdmin, async (req, res) => {
    const result = await db.query(
      'UPDATE staff SET active = FALSE, updated_at = NOW() WHERE staff_id = $1 RETURNING staff_id, active',
      [req.params.staffId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'staff_not_found' });
      return;
    }
    const auth = readAuth(req, authSecret);
    const auditReferenceId = await logAudit(db, auth.actor, 'staff.deactivate', 'staff', req.params.staffId, {
      active: false
    });
    res.json({ data: result.rows[0], auditReferenceId });
  });

  app.post(`${basePath}/stations`, requireAdmin, async (req, res) => {
    const schema = z.object({ name: z.string().min(1), location: z.string().min(1), methodType: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const result = await db.query(
      `INSERT INTO stations (name, location, method_type)
       VALUES ($1, $2, $3)
       RETURNING id, name, location, method_type, active`,
      [parsed.data.name, parsed.data.location, parsed.data.methodType]
    );

    const auth = readAuth(req, authSecret);
    const auditReferenceId = await logAudit(
      db,
      auth.actor,
      'station.create',
      'station',
      String(result.rows[0].id),
      result.rows[0]
    );

    res.status(201).json({ data: result.rows[0], auditReferenceId });
  });

  app.get(`${basePath}/stations`, async (_req, res) => {
    const result = await db.query('SELECT id, name, location, method_type, active FROM stations ORDER BY id ASC');
    res.json({ data: result.rows });
  });

  app.patch(`${basePath}/stations/:id`, requireAdmin, async (req, res) => {
    const schema = z.object({ name: z.string().min(1).optional(), location: z.string().min(1).optional(), methodType: z.string().min(1).optional(), active: z.boolean().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const result = await db.query(
      `UPDATE stations
       SET name = COALESCE($2, name),
           location = COALESCE($3, location),
           method_type = COALESCE($4, method_type),
           active = COALESCE($5, active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, location, method_type, active`,
      [req.params.id, parsed.data.name ?? null, parsed.data.location ?? null, parsed.data.methodType ?? null, parsed.data.active ?? null]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'station_not_found' });
      return;
    }

    const auth = readAuth(req, authSecret);
    const auditReferenceId = await logAudit(db, auth.actor, 'station.update', 'station', req.params.id, parsed.data);
    res.json({ data: result.rows[0], auditReferenceId });
  });

  app.delete(`${basePath}/stations/:id`, requireAdmin, async (req, res) => {
    const result = await db.query('UPDATE stations SET active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, active', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'station_not_found' });
      return;
    }
    const auth = readAuth(req, authSecret);
    const auditReferenceId = await logAudit(db, auth.actor, 'station.deactivate', 'station', req.params.id, {
      active: false
    });
    res.json({ data: result.rows[0], auditReferenceId });
  });

  app.put(`${basePath}/staff/:staffId/identity-methods/:methodType`, requireAdmin, async (req, res) => {
    const schema = z.object({ status: z.string().min(1), externalRef: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const staffLookup = await db.query<{ id: number }>('SELECT id FROM staff WHERE staff_id = $1', [req.params.staffId]);
    if (staffLookup.rows.length === 0) {
      res.status(404).json({ error: 'staff_not_found' });
      return;
    }

    const staffPk = staffLookup.rows[0].id;
    const result = await db.query(
      `INSERT INTO staff_identity_methods (staff_id, method_type, external_ref, status, enrolled_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (staff_id, method_type)
       DO UPDATE SET external_ref = EXCLUDED.external_ref, status = EXCLUDED.status, updated_at = NOW()
       RETURNING id, method_type, external_ref, status, enrolled_at, updated_at`,
      [staffPk, req.params.methodType, parsed.data.externalRef ?? null, parsed.data.status]
    );

    const auth = readAuth(req, authSecret);
    const auditReferenceId = await logAudit(
      db,
      auth.actor,
      'staff.identity.update',
      'staff_identity_methods',
      String(result.rows[0].id),
      result.rows[0]
    );

    res.json({ data: result.rows[0], auditReferenceId });
  });

  app.post(`${basePath}/rosters`, requireAdmin, async (req, res) => {
    const schema = z.object({
      entries: z.array(
        z.object({
          staffId: z.string().min(1),
          stationId: z.number().int().optional(),
          date: z.string().min(10),
          startTime: z.string().min(4),
          plannedHours: z.number().positive(),
          notes: z.string().optional()
        })
      ).min(1)
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const upserted: unknown[] = [];
    for (const entry of parsed.data.entries) {
      const staffLookup = await db.query<{ id: number }>('SELECT id FROM staff WHERE staff_id = $1', [entry.staffId]);
      if (staffLookup.rows.length === 0) {
        res.status(404).json({ error: `staff_not_found:${entry.staffId}` });
        return;
      }

      const result = await db.query(
        `INSERT INTO rosters (staff_id, station_id, roster_date, start_time, planned_hours, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (staff_id, roster_date, start_time)
         DO UPDATE SET station_id = EXCLUDED.station_id, planned_hours = EXCLUDED.planned_hours, notes = EXCLUDED.notes, updated_at = NOW()
         RETURNING id, staff_id, station_id, roster_date, start_time, planned_hours, notes`,
        [staffLookup.rows[0].id, entry.stationId ?? null, entry.date, entry.startTime, entry.plannedHours, entry.notes ?? null]
      );
      upserted.push(result.rows[0]);
    }

    const auth = readAuth(req, authSecret);
    const auditReferenceId = await logAudit(db, auth.actor, 'roster.upsert', 'rosters', 'bulk', upserted);

    res.status(201).json({ data: upserted, auditReferenceId });
  });

  app.get(`${basePath}/rosters`, async (req, res) => {
    const from = req.query.from;
    const to = req.query.to;
    if (typeof from !== 'string' || typeof to !== 'string') {
      res.status(400).json({ error: 'from_and_to_query_params_are_required' });
      return;
    }

    const auth = readAuth(req, authSecret);
    const whereForRole = auth.role === 'staff' ? 'AND s.staff_id = $3' : '';
    const params: unknown[] = [from, to];
    if (auth.role === 'staff') {
      params.push(auth.actor);
    }

    const result = await db.query(
      `SELECT r.id, s.staff_id, st.name AS station_name, r.roster_date, r.start_time, r.planned_hours, r.notes
       FROM rosters r
       JOIN staff s ON s.id = r.staff_id
       LEFT JOIN stations st ON st.id = r.station_id
       WHERE r.roster_date BETWEEN $1 AND $2
       ${whereForRole}
       ORDER BY r.roster_date ASC, s.staff_id ASC`,
      params
    );

    res.json({ data: result.rows });
  });

  app.post(`${basePath}/time-events`, async (req, res) => {
    const schema = z.object({
      staffId: z.string().min(1),
      stationId: z.number().int().optional(),
      eventType: z.enum(['clock_in', 'clock_out', 'break_start', 'break_end']),
      methodType: z.enum(['card', 'face', 'fingerprint', 'retinal']),
      timestamp: z.string().datetime(),
      breakType: z.enum(['tea', 'lunch', 'safety']).optional(),
      reason: z.string().optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const staffLookup = await db.query<{ id: number }>('SELECT id FROM staff WHERE staff_id = $1', [parsed.data.staffId]);
    if (staffLookup.rows.length === 0) {
      res.status(404).json({ error: 'staff_not_found' });
      return;
    }

    const auth = readAuth(req, authSecret);
    const result = await db.query(
      `INSERT INTO time_events (staff_id, station_id, event_type, method_type, break_type, event_timestamp, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, staff_id, station_id, event_type, method_type, break_type, event_timestamp, reason`,
      [
        staffLookup.rows[0].id,
        parsed.data.stationId ?? null,
        parsed.data.eventType,
        parsed.data.methodType,
        parsed.data.breakType ?? null,
        parsed.data.timestamp,
        parsed.data.reason ?? null,
        auth.actor
      ]
    );

    const auditReferenceId = await logAudit(db, auth.actor, 'time_event.create', 'time_events', String(result.rows[0].id), result.rows[0]);

    res.status(201).json({ data: result.rows[0], auditReferenceId });
  });

  app.post(`${basePath}/time-events/manual`, requireAdmin, async (req, res) => {
    const schema = z.object({
      staffId: z.string().min(1),
      stationId: z.number().int().optional(),
      eventType: z.enum(['clock_in', 'clock_out', 'break_start', 'break_end']),
      timestamp: z.string().datetime(),
      reason: z.string().min(3),
      methodType: z.enum(['card', 'face', 'fingerprint', 'retinal']).default('card')
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const staffLookup = await db.query<{ id: number }>('SELECT id FROM staff WHERE staff_id = $1', [parsed.data.staffId]);
    if (staffLookup.rows.length === 0) {
      res.status(404).json({ error: 'staff_not_found' });
      return;
    }

    const auth = readAuth(req, authSecret);
    const inserted = await db.query(
      `INSERT INTO time_events (staff_id, station_id, event_type, method_type, event_timestamp, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, staff_id, station_id, event_type, method_type, event_timestamp, reason`,
      [
        staffLookup.rows[0].id,
        parsed.data.stationId ?? null,
        parsed.data.eventType,
        parsed.data.methodType,
        parsed.data.timestamp,
        parsed.data.reason,
        auth.actor
      ]
    );

    const auditReferenceId = await logAudit(db, auth.actor, 'time_event.manual', 'time_events', String(inserted.rows[0].id), inserted.rows[0]);

    res.status(201).json({ data: inserted.rows[0], auditReferenceId });
  });

  app.get(`${basePath}/reports/attendance`, requireAdmin, async (req, res) => {
    const from = req.query.from;
    const to = req.query.to;
    if (typeof from !== 'string' || typeof to !== 'string') {
      res.status(400).json({ error: 'from_and_to_query_params_are_required' });
      return;
    }

    const workedByStaff = await getWorkedHoursByStaff(db, from, to);

    const rosterPlanned = await db.query<{ staff_id: number; planned_hours: string }>(
      `SELECT staff_id, COALESCE(SUM(planned_hours), 0) AS planned_hours
       FROM rosters
       WHERE roster_date BETWEEN $1 AND $2
       GROUP BY staff_id`,
      [from, to]
    );

    const plannedByStaff = new Map<number, number>();
    for (const row of rosterPlanned.rows) {
      plannedByStaff.set(row.staff_id, asNumber(row.planned_hours));
    }

    const staffRows = await db.query<{ id: number; staff_id: string; name: string }>(
      'SELECT id, staff_id, name FROM staff WHERE active = TRUE ORDER BY staff_id ASC'
    );

    const data = staffRows.rows.map((staff) => {
      const actualHours = workedByStaff.get(staff.id) ?? 0;
      const plannedHours = plannedByStaff.get(staff.id) ?? 0;
      return {
        staffId: staff.staff_id,
        name: staff.name,
        plannedHours,
        actualHours,
        varianceHours: Number((actualHours - plannedHours).toFixed(2))
      };
    });

    res.json({ from, to, data });
  });

  app.get(`${basePath}/reports/attendance.csv`, requireAdmin, async (req, res) => {
    const from = req.query.from;
    const to = req.query.to;
    if (typeof from !== 'string' || typeof to !== 'string') {
      res.status(400).json({ error: 'from_and_to_query_params_are_required' });
      return;
    }

    const workedByStaff = await getWorkedHoursByStaff(db, from, to);
    const staffRows = await db.query<{ id: number; staff_id: string; name: string }>(
      'SELECT id, staff_id, name FROM staff WHERE active = TRUE ORDER BY staff_id ASC'
    );

    const rows = staffRows.rows.map((staff) => ({
      staffId: staff.staff_id,
      name: staff.name,
      actualHours: workedByStaff.get(staff.id) ?? 0
    }));

    res.type('text/csv').send(toCsv(rows));
  });

  app.post(`${basePath}/exceptions/detect`, requireAdmin, async (req, res) => {
    const schema = z.object({ from: z.string().min(10), to: z.string().min(10) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const bounds = dateBounds(parsed.data.from, parsed.data.to);
    const events = await db.query<{
      staff_id: number;
      event_type: string;
      event_timestamp: string;
    }>(
      `SELECT staff_id, event_type, event_timestamp
       FROM time_events
       WHERE event_timestamp >= $1 AND event_timestamp < $2
       ORDER BY staff_id ASC, event_timestamp ASC`,
      [bounds.start, bounds.endExclusive]
    );

    const rosterRows = await db.query<{ staff_id: number; roster_date: string }>(
      `SELECT staff_id, roster_date
       FROM rosters
       WHERE roster_date BETWEEN $1 AND $2`,
      [parsed.data.from, parsed.data.to]
    );

    const rosterSet = new Set(
      rosterRows.rows.map((row) => {
        const date =
          typeof row.roster_date === 'string'
            ? row.roster_date.slice(0, 10)
            : new Date(row.roster_date).toISOString().slice(0, 10);
        return `${row.staff_id}:${date}`;
      })
    );

    const grouped = new Map<string, { staffId: number; date: string; events: TimeEvent[] }>();
    for (const row of events.rows) {
      const eventDate = new Date(row.event_timestamp).toISOString().slice(0, 10);
      const key = `${row.staff_id}:${eventDate}`;
      const current = grouped.get(key) ?? { staffId: row.staff_id, date: eventDate, events: [] };
      current.events.push({ eventType: row.event_type, timestamp: row.event_timestamp });
      grouped.set(key, current);
    }

    const detectedRecords: unknown[] = [];
    for (const value of grouped.values()) {
      const detected = detectExceptions({
        staffId: value.staffId,
        date: value.date,
        events: value.events,
        hasRoster: rosterSet.has(`${value.staffId}:${value.date}`)
      });

      for (const item of detected) {
        const existing = await db.query(
          `SELECT id FROM exceptions
           WHERE type = $1 AND staff_id = $2 AND exception_date = $3 AND status = 'open'`,
          [item.type, value.staffId, value.date]
        );
        if (existing.rows.length > 0) {
          continue;
        }

        const inserted = await db.query(
          `INSERT INTO exceptions (type, staff_id, exception_date, severity, notes)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, type, staff_id, exception_date, severity, status`,
          [item.type, value.staffId, value.date, item.severity, 'Auto-detected']
        );
        detectedRecords.push(inserted.rows[0]);
      }
    }

    const auth = readAuth(req, authSecret);
    const auditReferenceId = await logAudit(db, auth.actor, 'exceptions.detect', 'exceptions', 'bulk', {
      from: parsed.data.from,
      to: parsed.data.to,
      count: detectedRecords.length
    });

    res.json({ data: detectedRecords, auditReferenceId });
  });

  app.get(`${basePath}/exceptions`, requireAdmin, async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'open';
    const rows = await db.query(
      `SELECT e.id, e.type, s.staff_id, e.exception_date, e.severity, e.status, e.resolved_by, e.resolved_at, e.notes
       FROM exceptions e
       LEFT JOIN staff s ON s.id = e.staff_id
       WHERE e.status = $1
       ORDER BY e.exception_date DESC, e.id DESC`,
      [status]
    );
    res.json({ data: rows.rows });
  });

  app.patch(`${basePath}/exceptions/:id/resolve`, requireAdmin, async (req, res) => {
    const schema = z.object({ notes: z.string().min(1).optional() });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const auth = readAuth(req, authSecret);
    const result = await db.query(
      `UPDATE exceptions
       SET status = 'resolved', resolved_by = $2, resolved_at = NOW(), notes = COALESCE($3, notes)
       WHERE id = $1
       RETURNING id, type, status, resolved_by, resolved_at, notes`,
      [req.params.id, auth.actor, parsed.data.notes ?? null]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'exception_not_found' });
      return;
    }
    const auditReferenceId = await logAudit(db, auth.actor, 'exception.resolve', 'exceptions', req.params.id, parsed.data);
    res.json({ data: result.rows[0], auditReferenceId });
  });

  async function generateRun(startDate: string, endDate: string, actor: string) {
    const periodResult = await db.query<{ id: number }>(
      `INSERT INTO pay_periods (start_date, end_date, status)
       VALUES ($1, $2, 'open')
       ON CONFLICT (start_date, end_date)
       DO UPDATE SET status = 'open'
       RETURNING id`,
      [startDate, endDate]
    );

    const payPeriodId = periodResult.rows[0].id;
    const runResult = await db.query<{ id: number }>(
      `INSERT INTO pay_runs (pay_period_id, status, created_by)
       VALUES ($1, 'draft', $2)
       RETURNING id`,
      [payPeriodId, actor]
    );

    const payRunId = runResult.rows[0].id;

    const staffRows = await db.query<{
      id: number;
      staff_id: string;
      standard_hours: string;
      standard_rate: string;
      overtime_rate: string;
    }>('SELECT id, staff_id, standard_hours, standard_rate, overtime_rate FROM staff WHERE active = TRUE');

    const workedByStaff = await getWorkedHoursByStaff(db, startDate, endDate);
    const items = [] as unknown[];

    for (const staff of staffRows.rows) {
      const hours = workedByStaff.get(staff.id) ?? 0;
      const item = calculatePayroll(
        hours,
        asNumber(staff.standard_hours),
        asNumber(staff.standard_rate),
        asNumber(staff.overtime_rate),
        0
      );

      const inserted = await db.query(
        `INSERT INTO pay_run_items
         (pay_run_id, staff_id, hours, overtime_hours, base_pay, overtime_pay, deductions, total_pay, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         RETURNING id, pay_run_id, staff_id, hours, overtime_hours, base_pay, overtime_pay, deductions, total_pay`,
        [
          payRunId,
          staff.id,
          item.hours,
          item.overtimeHours,
          item.basePay,
          item.overtimePay,
          item.deductions,
          item.totalPay,
          JSON.stringify(item)
        ]
      );

      items.push(inserted.rows[0]);
    }

    return { payRunId, payPeriodId, items };
  }

  app.post(`${basePath}/payroll/runs/generate`, requireAdmin, async (req, res) => {
    const schema = z.object({ startDate: z.string().min(10), endDate: z.string().min(10) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const auth = readAuth(req, authSecret);
    const generated = await generateRun(parsed.data.startDate, parsed.data.endDate, auth.actor);
    const auditReferenceId = await logAudit(db, auth.actor, 'payrun.generate', 'pay_runs', String(generated.payRunId), {
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      itemCount: generated.items.length
    });

    res.status(201).json({
      data: {
        payRunId: generated.payRunId,
        payPeriodId: generated.payPeriodId,
        status: 'draft',
        items: generated.items
      },
      auditReferenceId
    });
  });

  app.post(`${basePath}/payroll/runs/:id/recalculate`, requireAdmin, async (req, res) => {
    const runLookup = await db.query<{ id: number; pay_period_id: number }>(
      'SELECT id, pay_period_id FROM pay_runs WHERE id = $1',
      [req.params.id]
    );
    if (runLookup.rows.length === 0) {
      res.status(404).json({ error: 'pay_run_not_found' });
      return;
    }

    const period = await db.query<{ start_date: string; end_date: string }>(
      'SELECT start_date, end_date FROM pay_periods WHERE id = $1',
      [runLookup.rows[0].pay_period_id]
    );

    await db.query('DELETE FROM pay_run_items WHERE pay_run_id = $1', [req.params.id]);

    const auth = readAuth(req, authSecret);
    const startDate = new Date(period.rows[0].start_date).toISOString().slice(0, 10);
    const endDate = new Date(period.rows[0].end_date).toISOString().slice(0, 10);
    const regenerated = await generateRun(startDate, endDate, auth.actor);
    const auditReferenceId = await logAudit(db, auth.actor, 'payrun.recalculate', 'pay_runs', req.params.id, {
      replacedWithRunId: regenerated.payRunId
    });

    res.json({ data: regenerated, auditReferenceId });
  });

  app.post(`${basePath}/payroll/runs/:id/finalize`, requireAdmin, async (req, res) => {
    const auth = readAuth(req, authSecret);
    const finalized = await db.query<{ id: number; pay_period_id: number; status: string; finalized_at: string }>(
      `UPDATE pay_runs
       SET status = 'finalized', finalized_at = NOW()
       WHERE id = $1
       RETURNING id, pay_period_id, status, finalized_at`,
      [req.params.id]
    );

    if (finalized.rows.length === 0) {
      res.status(404).json({ error: 'pay_run_not_found' });
      return;
    }

    await db.query('UPDATE pay_periods SET status = $2 WHERE id = $1', [finalized.rows[0].pay_period_id, 'closed']);

    const auditReferenceId = await logAudit(db, auth.actor, 'payrun.finalize', 'pay_runs', req.params.id, {});
    res.json({ data: finalized.rows[0], auditReferenceId });
  });

  app.get(`${basePath}/payroll/runs/:id/payslips`, requireAdmin, async (req, res) => {
    const rows = await db.query(
      `SELECT pri.id, s.staff_id, s.name, pri.hours, pri.overtime_hours, pri.base_pay, pri.overtime_pay, pri.deductions, pri.total_pay
       FROM pay_run_items pri
       JOIN staff s ON s.id = pri.staff_id
       WHERE pri.pay_run_id = $1
       ORDER BY s.staff_id ASC`,
      [req.params.id]
    );
    res.json({ payRunId: req.params.id, data: rows.rows });
  });

  app.get(`${basePath}/payroll/runs/:id/payslips.csv`, requireAdmin, async (req, res) => {
    const rows = await db.query(
      `SELECT s.staff_id, s.name, pri.hours, pri.overtime_hours, pri.base_pay, pri.overtime_pay, pri.deductions, pri.total_pay
       FROM pay_run_items pri
       JOIN staff s ON s.id = pri.staff_id
       WHERE pri.pay_run_id = $1
       ORDER BY s.staff_id ASC`,
      [req.params.id]
    );
    res.type('text/csv').send(toCsv(rows.rows as Record<string, unknown>[]));
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : 'internal_error';
    res.status(500).json({ error: message });
  });

  return app;
}
