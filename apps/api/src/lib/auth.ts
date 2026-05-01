import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import type { Queryable } from '../db/types.js';

export type UserRole = 'admin' | 'staff';

export interface AuthContext {
  actor: string;
  role: UserRole;
}

interface TokenPayload {
  staffId: string;
  role: UserRole;
  exp: number;
}

function b64(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function unb64(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function signToken(staffId: string, role: UserRole, secret: string): string {
  const payload: TokenPayload = {
    staffId,
    role,
    exp: Date.now() + 8 * 60 * 60 * 1000
  };
  const payloadRaw = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(payloadRaw).digest('base64url');
  return `${b64(payloadRaw)}.${signature}`;
}

function verifyToken(token: string, secret: string): TokenPayload | null {
  const [payloadEncoded, signature] = token.split('.');
  if (!payloadEncoded || !signature) {
    return null;
  }
  const payloadRaw = unb64(payloadEncoded);
  const expected = crypto.createHmac('sha256', secret).update(payloadRaw).digest('base64url');
  if (signature !== expected) {
    return null;
  }
  const payload = JSON.parse(payloadRaw) as TokenPayload;
  if (payload.exp < Date.now()) {
    return null;
  }
  return payload;
}

export function readAuth(req: Request, secret: string): AuthContext {
  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    const payload = verifyToken(token, secret);
    if (payload) {
      return { actor: payload.staffId, role: payload.role };
    }
  }

  const fallbackRole = req.header('x-user-role');
  const fallbackActor = req.header('x-user-id') ?? 'system';
  if (fallbackRole === 'admin' || fallbackRole === 'staff') {
    return { actor: fallbackActor, role: fallbackRole };
  }

  return { actor: 'anonymous', role: 'staff' };
}

export function requireRole(role: UserRole, secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = readAuth(req, secret);
    if (auth.role !== role) {
      res.status(403).json({ error: 'forbidden', requiredRole: role });
      return;
    }
    res.locals.auth = auth;
    next();
  };
}

export async function login(
  db: Queryable,
  staffId: string,
  password: string,
  secret: string
): Promise<{ token: string; role: UserRole } | null> {
  const result = await db.query<{ staff_id: string; role: UserRole; password_hash: string; active: boolean }>(
    'SELECT staff_id, role, password_hash, active FROM staff WHERE staff_id = $1',
    [staffId]
  );

  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0];
  if (!row.active) {
    return null;
  }
  if (!verifyPassword(password, row.password_hash)) {
    return null;
  }

  return {
    token: signToken(row.staff_id, row.role, secret),
    role: row.role
  };
}
