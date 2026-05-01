'use client';

import { useEffect, useState } from 'react';
import { useSession } from '../lib/auth';
import { apiGet, apiPatch, apiPost, apiPut } from '../lib/api';

interface StaffRow {
  staff_id: string;
  name: string;
  contract_type: string;
  standard_hours: string;
  role: 'admin' | 'staff';
  standard_rate: string;
  overtime_rate: string;
  active: boolean;
}

const emptyForm = {
  staffId: '',
  name: '',
  contractType: 'full_time',
  standardHours: 38,
  role: 'staff',
  standardRate: 30,
  overtimeRate: 45,
  password: 'SeedPass123!'
};

export default function StaffPage() {
  const { session } = useSession();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [identityStatus, setIdentityStatus] = useState('registered');

  async function load() {
    const data = await apiGet<{ data: StaffRow[] }>('/staff', { role: 'admin' });
    setRows(data.data);
  }

  useEffect(() => {
    if (session?.role === 'admin') {
      load().catch(() => undefined);
    }
  }, [session]);

  if (session?.role !== 'admin') {
    return (
      <section className="section panel">
        <h2>Staff Management</h2>
        <p>Admin role required to access this module.</p>
      </section>
    );
  }

  async function onboard() {
    await apiPost('/staff', form, { role: 'admin' });
    setForm(emptyForm);
    await load();
  }

  async function saveRate(staffId: string, standardRate: string, overtimeRate: string) {
    await apiPatch(
      `/staff/${staffId}`,
      { standardRate: Number(standardRate), overtimeRate: Number(overtimeRate) },
      { role: 'admin' }
    );
    await load();
  }

  async function setIdentity(staffId: string, methodType: string) {
    await apiPut(
      `/staff/${staffId}/identity-methods/${methodType}`,
      { status: identityStatus },
      { role: 'admin' }
    );
  }

  return (
    <>
      <section className="section">
        <h2 style={{ margin: 0, fontSize: '1.8rem' }}>Staff Management</h2>
        <p style={{ color: 'var(--on-surface-variant)' }}>Onboard staff, edit rates, and manage biometric registration state.</p>
        <div className="grid-4">
          <input placeholder="Staff ID" value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} />
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })}>
            <option value="full_time">Full Time</option>
            <option value="part_time">Part Time</option>
            <option value="casual">Casual</option>
          </select>
          <button className="primary-button" onClick={onboard}>Onboard New Staff</button>
        </div>
      </section>

      <section className="section panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Contract</th>
                <th>Rates</th>
                <th>Identity Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                let standardRate = row.standard_rate;
                let overtimeRate = row.overtime_rate;
                return (
                  <tr key={row.staff_id}>
                    <td>{row.staff_id}</td>
                    <td>{row.name}</td>
                    <td>{row.role}</td>
                    <td>{row.contract_type}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <input defaultValue={row.standard_rate} onChange={(e) => { standardRate = e.target.value; }} style={{ width: '90px' }} />
                        <input defaultValue={row.overtime_rate} onChange={(e) => { overtimeRate = e.target.value; }} style={{ width: '90px' }} />
                        <button className="secondary-button" onClick={() => saveRate(row.staff_id, standardRate, overtimeRate)}>
                          Save
                        </button>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <select value={identityStatus} onChange={(e) => setIdentityStatus(e.target.value)}>
                          <option value="registered">Registered</option>
                          <option value="smartcard_active">Smartcard Active</option>
                          <option value="register_card">Register Card</option>
                          <option value="pending_biometric">Pending Biometric</option>
                        </select>
                        <button className="secondary-button" onClick={() => setIdentity(row.staff_id, 'fingerprint')}>
                          Update
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
