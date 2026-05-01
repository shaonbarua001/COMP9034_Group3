import type { Queryable } from '../db/types.js';

export async function logAudit(
  db: Queryable,
  actor: string,
  action: string,
  entity: string,
  entityId: string,
  payload: unknown
): Promise<number> {
  const result = await db.query<{ id: number }>(
    `INSERT INTO audit_logs (actor, action, entity, entity_id, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id`,
    [actor, action, entity, entityId, JSON.stringify(payload)]
  );
  return result.rows[0].id;
}
