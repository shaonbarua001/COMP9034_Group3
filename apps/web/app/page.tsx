'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from './lib/auth';
import { apiGet } from './lib/api';

interface AttendanceItem {
  staffId: string;
  name: string;
  plannedHours: number;
  actualHours: number;
  varianceHours: number;
}

interface ExceptionItem {
  id: number;
  type: string;
  exception_date: string;
}

interface RosterItem {
  id: number;
  roster_date: string;
  start_time: string;
  planned_hours: string;
  station_name?: string;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const { session } = useSession();
  const [attendance, setAttendance] = useState<AttendanceItem[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [staffRoster, setStaffRoster] = useState<RosterItem[]>([]);

  useEffect(() => {
    if (!session) return;
    const d = todayIso();

    if (session.role === 'admin') {
      apiGet<{ data: AttendanceItem[] }>(`/reports/attendance?from=${d}&to=${d}`, { role: 'admin' })
        .then((r) => setAttendance(r.data))
        .catch(() => setAttendance([]));
      apiGet<{ data: ExceptionItem[] }>('/exceptions?status=open', { role: 'admin' })
        .then((r) => setExceptions(r.data))
        .catch(() => setExceptions([]));
      return;
    }

    apiGet<{ data: RosterItem[] }>(`/rosters?from=${d}&to=${d}`)
      .then((r) => setStaffRoster(r.data))
      .catch(() => setStaffRoster([]));
  }, [session]);

  const totalPlanned = attendance.reduce((sum, item) => sum + Number(item.plannedHours ?? 0), 0);
  const totalActual = attendance.reduce((sum, item) => sum + Number(item.actualHours ?? 0), 0);

  return (
    <>
      <section className="section">
        <h2 style={{ margin: 0, fontSize: '1.9rem', letterSpacing: '-0.02em' }}>Daily Operations Dashboard</h2>
        <p style={{ color: 'var(--on-surface-variant)' }}>Live shift tracking, pending compliance, and fast actions.</p>
        <div className="grid-4">
          <div className="kpi">
            <div style={{ color: 'var(--on-surface-variant)', fontSize: '0.8rem' }}>Scheduled Hours</div>
            <div style={{ fontSize: '2rem', fontWeight: 900 }}>{totalPlanned.toFixed(1)}h</div>
          </div>
          <div className="kpi">
            <div style={{ color: 'var(--on-surface-variant)', fontSize: '0.8rem' }}>Worked Hours</div>
            <div style={{ fontSize: '2rem', fontWeight: 900 }}>{totalActual.toFixed(1)}h</div>
          </div>
          <div className="kpi">
            <div style={{ color: 'var(--on-surface-variant)', fontSize: '0.8rem' }}>Pending Exceptions</div>
            <div style={{ fontSize: '2rem', fontWeight: 900 }}>{exceptions.length}</div>
          </div>
          <div className="kpi">
            <div style={{ color: 'var(--on-surface-variant)', fontSize: '0.8rem' }}>Active Staff in Feed</div>
            <div style={{ fontSize: '2rem', fontWeight: 900 }}>
              {session?.role === 'admin' ? attendance.length : staffRoster.length}
            </div>
          </div>
        </div>
      </section>

      <section className="section grid-2">
        <div className="panel">
          <h3>{session?.role === 'admin' ? 'Live Shift Feed' : 'My Shift Feed'}</h3>
          {session?.role === 'admin'
            ? attendance.slice(0, 6).map((item) => (
                <div key={item.staffId} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0' }}>
                  <span>{item.name}</span>
                  <span className="badge">{Number(item.actualHours).toFixed(1)}h actual</span>
                </div>
              ))
            : staffRoster.slice(0, 6).map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0' }}>
                  <span>{item.roster_date.slice(0, 10)} {item.start_time}</span>
                  <span className="badge">{item.planned_hours}h planned</span>
                </div>
              ))}
        </div>
        <div className="panel">
          <h3>{session?.role === 'admin' ? 'Pending Exceptions' : 'Staff Summary'}</h3>
          {session?.role === 'admin'
            ? exceptions.slice(0, 6).map((item) => (
                <div key={item.id} style={{ padding: '0.35rem 0' }}>
                  <strong>{item.type}</strong> on {item.exception_date}
                </div>
              ))
            : <p style={{ color: 'var(--on-surface-variant)' }}>Use Clocking Station to log in/out and breaks. Roster updates appear live.</p>}
        </div>
      </section>

      <section className="section">
        <h3>Quick Actions</h3>
        <div className="grid-4">
          {session?.role === 'admin' ? (
            <>
              <Link className="primary-button" href="/staff">Add Staff</Link>
              <Link className="primary-button" href="/roster">Update Roster</Link>
              <Link className="primary-button" href="/payroll-reports">Generate Pay Run</Link>
              <Link className="primary-button" href="/payroll-reports">Compliance Report</Link>
            </>
          ) : (
            <>
              <Link className="primary-button" href="/clocking-station">Clock In/Out</Link>
              <Link className="primary-button" href="/roster">View My Roster</Link>
            </>
          )}
        </div>
      </section>
    </>
  );
}
