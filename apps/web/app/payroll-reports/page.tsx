'use client';

import { useMemo, useState } from 'react';
import { useSession } from '../lib/auth';
import { apiGet, apiPatch, apiPost } from '../lib/api';

interface AttendanceRow {
  staffId: string;
  name: string;
  plannedHours: number;
  actualHours: number;
  varianceHours: number;
}

interface ExceptionRow {
  id: number;
  type: string;
  staff_id?: string;
  exception_date: string;
  severity: string;
}

interface PayslipRow {
  id: number;
  staff_id: string;
  name: string;
  total_pay: string;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getFortnightRange() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  const end = new Date(now);
  end.setDate(now.getDate() + 7);
  return { startDate: dateOnly(start), endDate: dateOnly(end) };
}

export default function PayrollReportsPage() {
  const { session } = useSession();
  const initial = useMemo(() => getFortnightRange(), []);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [runId, setRunId] = useState<number | null>(null);
  const [payslips, setPayslips] = useState<PayslipRow[]>([]);

  if (session?.role !== 'admin') {
    return (
      <section className="section panel">
        <h2>Reporting and Payroll</h2>
        <p>Admin role required to access this module.</p>
      </section>
    );
  }

  async function loadAttendance() {
    const data = await apiGet<{ data: AttendanceRow[] }>(
      `/reports/attendance?from=${startDate}&to=${endDate}`,
      { role: 'admin' }
    );
    setAttendance(data.data);
  }

  async function detectExceptions() {
    await apiPost('/exceptions/detect', { from: startDate, to: endDate }, { role: 'admin' });
    const open = await apiGet<{ data: ExceptionRow[] }>('/exceptions?status=open', { role: 'admin' });
    setExceptions(open.data);
  }

  async function resolveException(id: number) {
    await apiPatch(`/exceptions/${id}/resolve`, { notes: 'Resolved from payroll screen' }, { role: 'admin' });
    await detectExceptions();
  }

  async function generatePayslips() {
    const generated = await apiPost<{ data: { payRunId: number } }>(
      '/payroll/runs/generate',
      { startDate, endDate },
      { role: 'admin' }
    );
    const nextRunId = generated.data.payRunId;
    setRunId(nextRunId);
    const slips = await apiGet<{ data: PayslipRow[] }>(`/payroll/runs/${nextRunId}/payslips`, { role: 'admin' });
    setPayslips(slips.data);
  }

  return (
    <>
      <section className="section">
        <h2 style={{ margin: 0, fontSize: '1.8rem' }}>Reporting and Payroll</h2>
        <p style={{ color: 'var(--on-surface-variant)' }}>Date-bound attendance, exception handling, and pay slip generation.</p>
        <div className="grid-4">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <button className="secondary-button" onClick={loadAttendance}>Load Time Information</button>
          <button className="primary-button" onClick={generatePayslips}>Generate Pay Slips</button>
        </div>
      </section>

      <section className="section grid-2">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Time Information</h3>
          {attendance.map((item) => (
            <div key={item.staffId} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0' }}>
              <span>{item.staffId} - {item.name}</span>
              <span>{Number(item.actualHours).toFixed(1)}h</span>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Pay Information {runId ? `(Run ${runId})` : ''}</h3>
          {payslips.map((row) => (
            <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0' }}>
              <span>{row.staff_id} - {row.name}</span>
              <span>${row.total_pay}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Exception Report</h3>
          <button className="secondary-button" onClick={detectExceptions}>Refresh Exceptions</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Date</th>
                <th>Severity</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.type}</td>
                  <td>{item.exception_date}</td>
                  <td>{item.severity}</td>
                  <td>
                    <button className="secondary-button" onClick={() => resolveException(item.id)}>Resolve</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
