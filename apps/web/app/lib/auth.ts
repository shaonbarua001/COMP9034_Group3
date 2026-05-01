'use client';

import { useEffect, useState } from 'react';

const SESSION_KEY = 'farm_ops_session';

export type UserRole = 'admin' | 'staff';

export interface Session {
  token: string;
  role: UserRole;
  staffId: string;
}

export function readSession(): Session | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.token || !parsed.role || !parsed.staffId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: Session): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event('farm-auth-change'));
}

export function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event('farm-auth-change'));
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setSession(readSession());
      setReady(true);
    };
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('farm-auth-change', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('farm-auth-change', sync);
    };
  }, []);

  return { session, ready };
}
