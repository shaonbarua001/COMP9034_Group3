'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { writeSession, type UserRole } from '../lib/auth';
import { apiLogin } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('admin');
  const [staffId, setStaffId] = useState('admin01');
  const [password, setPassword] = useState('SeedPass123!');
  const [error, setError] = useState('');

  const roleHint = useMemo(
    () => (role === 'admin' ? 'Use admin01 / SeedPass123!' : 'Use staff01 / SeedPass123!'),
    [role]
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const session = await apiLogin(staffId, password);
      if (session.role !== role) {
        setError('Selected role does not match credentials.');
        return;
      }
      writeSession({ token: session.token, role: session.role, staffId });
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <section className="section" style={{ width: 'min(560px, 100%)', background: 'var(--surface-container-low)' }}>
        <h1 style={{ marginTop: 0, marginBottom: '0.4rem', fontSize: '2rem' }}>Farm Ops Login</h1>
        <p style={{ marginTop: 0, color: 'var(--on-surface-variant)' }}>Choose role, authenticate, and connect to backend API.</p>

        <form onSubmit={submit} style={{ display: 'grid', gap: '0.8rem' }}>
          <div className="grid-2">
            <button
              type="button"
              className={role === 'admin' ? 'primary-button' : 'secondary-button'}
              onClick={() => {
                setRole('admin');
                setStaffId('admin01');
              }}
            >
              Admin
            </button>
            <button
              type="button"
              className={role === 'staff' ? 'primary-button' : 'secondary-button'}
              onClick={() => {
                setRole('staff');
                setStaffId('staff01');
              }}
            >
              Staff
            </button>
          </div>

          <input value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="Staff ID" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />

          <button className="primary-button" type="submit">
            Login
          </button>

          <div className="panel" style={{ fontSize: '0.86rem' }}>
            {roleHint}
          </div>
          {error ? <p style={{ color: 'var(--error)', margin: 0 }}>{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
