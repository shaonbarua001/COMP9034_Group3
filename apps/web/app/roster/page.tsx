'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../lib/auth';
import { apiGet, apiPost } from '../lib/api';

interface RosterRow {
  id: number;
  staff_id: string;
  station_name: string;
  roster_date: string;
  start_time: string;
  planned_hours: string;
  notes?: string;
}

interface StaffRow {
  staff_id: string;
  name: string;
}

interface StationRow {
  id: number;
  name: string;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export default function RosterPage() {
  const { session } = useSession();
  const [mode, setMode] = useState<'day' | 'week' | 'fortnight'>('week');
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [stations, setStations] = useState<StationRow[]>([]);
  const [form, setForm] = useState({ staffId: '', stationId: 1, date: formatDate(new Date()), startTime: '08:00', plannedHours: 8 });

  const range = useMemo(() => {
    const start = new Date();
    const end = new Date(start);
    const addDays = mode === 'day' ? 0 : mode === 'week' ? 6 : 13;
    end.setDate(start.getDate() + addDays);
    return { from: formatDate(start), to: formatDate(end) };
  }, [mode]);

  async function load() {
    if (!session) return;

    if (session.role === 'admin') {
      const [rosterData, staffData, stationData] = await Promise.all([
        apiGet<{ data: RosterRow[] }>(`/rosters?from=${range.from}&to=${range.to}`),
        apiGet<{ data: StaffRow[] }>('/staff', { role: 'admin' }),
        apiGet<{ data: StationRow[] }>('/stations', { role: 'admin' })
      ]);
      setRoster(rosterData.data);
      setStaff(staffData.data);
      setStations(stationData.data);
      return;
    }

    const rosterData = await apiGet<{ data: RosterRow[] }>(`/rosters?from=${range.from}&to=${range.to}`);
    setRoster(rosterData.data);
    setStaff([]);
    setStations([]);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [range.from, range.to, session?.role]);

  async function quickAdd() {
    if (session?.role !== 'admin') return;
    await apiPost('/rosters', { entries: [form] }, { role: 'admin' });
    await load();
  }

  return (
    <>
      <section className="section">
        <h2 style={{ margin: 0, fontSize: '1.8rem' }}>Roster Management</h2>
        <p style={{ color: 'var(--on-surface-variant)' }}>Day, week, and fortnight scheduling with quick assignment.</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.9rem' }}>
          <button className="secondary-button" onClick={() => setMode('day')}>Day</button>
          <button className="secondary-button" onClick={() => setMode('week')}>Week</button>
          <button className="secondary-button" onClick={() => setMode('fortnight')}>Fortnight</button>
        </div>

        {session?.role === 'admin' ? (
          <>
            <div className="grid-4">
              <select value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
                <option value="">Select Staff</option>
                {staff.map((s) => (
                  <option key={s.staff_id} value={s.staff_id}>{s.staff_id} - {s.name}</option>
                ))}
              </select>
              <select value={form.stationId} onChange={(e) => setForm({ ...form, stationId: Number(e.target.value) })}>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>{station.name}</option>
                ))}
              </select>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                <input type="number" value={form.plannedHours} onChange={(e) => setForm({ ...form, plannedHours: Number(e.target.value) })} />
              </div>
            </div>
            <div style={{ marginTop: '0.7rem', display: 'flex', gap: '0.6rem' }}>
              <button className="primary-button" onClick={quickAdd}>Quick Add Shift</button>
              <button className="secondary-button">Apply Roster Optimization</button>
            </div>
          </>
        ) : (
          <div className="panel">Staff view: roster is read-only.</div>
        )}
      </section>

      <section className="section panel">
        <h3 style={{ marginTop: 0 }}>Calendar Grid ({range.from} to {range.to})</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Staff</th>
                <th>Date</th>
                <th>Start</th>
                <th>Hours</th>
                <th>Station</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((item) => (
                <tr key={item.id}>
                  <td>{item.staff_id}</td>
                  <td>{item.roster_date.slice(0, 10)}</td>
                  <td>{item.start_time}</td>
                  <td>{item.planned_hours}</td>
                  <td>{item.station_name ?? 'Unassigned'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
