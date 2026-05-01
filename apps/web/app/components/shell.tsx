'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { clearSession, useSession } from '../lib/auth';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/staff', label: 'Staff', adminOnly: true },
  { href: '/roster', label: 'Roster' },
  { href: '/clocking-station', label: 'Clocking Station' },
  { href: '/payroll-reports', label: 'Payroll/Reports', adminOnly: true }
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, ready } = useSession();

  useEffect(() => {
    if (ready && !session && pathname !== '/login') {
      router.replace('/login');
    }
  }, [ready, session, pathname, router]);

  if (pathname === '/login') {
    return <>{children}</>;
  }

  if (!ready) {
    return <div style={{ padding: '2rem' }}>Loading session...</div>;
  }

  if (!session) {
    return <div style={{ padding: '2rem' }}>Redirecting to login...</div>;
  }

  const links = navItems.filter((item) => !(item.adminOnly && session.role !== 'admin'));

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div>
          <h1 className="brand">GreenField Operations</h1>
          <p style={{ margin: '0.2rem 0 1rem', color: 'var(--on-surface-variant)', fontSize: '0.8rem' }}>
            The Cultivated Horizon
          </p>
        </div>
        <nav style={{ display: 'grid', gap: '0.3rem' }}>
          {links.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`nav-link ${isActive ? 'active' : ''}`}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: '1rem', display: 'grid', gap: '0.45rem' }}>
          <button className="primary-button" style={{ width: '100%' }} onClick={() => router.push('/clocking-station')}>
            Clock In/Out
          </button>
          <button
            className="secondary-button"
            style={{ width: '100%' }}
            onClick={() => {
              clearSession();
              router.replace('/login');
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="main-shell">
        <header className="top-shell">
          <input className="search" placeholder="Search shifts, staff, reports" />
          <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center' }}>
            <button className="secondary-button">Help</button>
            <button className="secondary-button">Alerts</button>
            <div className="panel" style={{ padding: '0.4rem 0.65rem' }}>
              <strong style={{ fontSize: '0.82rem' }}>Operator ({session.role})</strong>
              <div style={{ fontSize: '0.76rem', color: 'var(--on-surface-variant)' }}>{session.staffId}</div>
            </div>
          </div>
        </header>
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
