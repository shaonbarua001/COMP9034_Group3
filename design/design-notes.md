# Database Design Notes (v2)

## DBMS Selection: SQL Server

| Criteria | Justification |
|----------|---------------|
| Environment | Windows Server 2025 (on-prem) — as specified in PID |
| Licence | SQL Server Express (free, sufficient for PoC) or Developer Edition |
| Tooling | SSMS (SQL Server Management Studio) for easy administration |
| Non-cloud | PID: *"prefer a non-cloud based solution"* — on-prem SQL Server is ideal |
| Alternative | PostgreSQL is viable but SQL Server offers tighter Windows integration |

---

## Design Principles

### Normalisation
- Schema follows **Third Normal Form (3NF)**
- `scheduled_hours` and `break_duration_min` are computed columns to avoid redundant storage

### Security (Issue 1.3)
- `biometric_token` is stored as `VARBINARY(512)` — **encrypted hash only**, never raw biometric data (fingerprint images, face vectors, etc.)
- All data modifications require an `AuditLog` entry with a mandatory `change_reason`

### Offline Synchronisation (Issue 2.2)
- `ClockRecord.is_synced` flag tracks records captured on offline devices
- `ClockRecord.synced_at` records when data was synced to the central server
- `BiometricDevice.last_sync_at` tracks the last successful device sync
- Conflict resolution is handled at the API layer; the database only provides the flags

### Wage Calculation (Issue 4.1)
- `WageCalculation` stores period-based calculation results as **snapshots**
- `applied_standard_rate` and `applied_overtime_rate` preserve the rate at calculation time
- Formula: `gross_total_pay = (standard_hours × applied_standard_rate) + (overtime_hours × applied_overtime_rate)`
- Past calculations are never modified when pay rates change

### Legal Compliance (Fair Work Australia)
- `ComplianceRule` table stores configurable legal thresholds:
  - `MAX_WEEKLY_HOURS` — 38h/week for full-time (Fair Work Act s62)
  - `MAX_DAILY_HOURS` — 7.6h/day before overtime
  - `MIN_BREAK_4H` — 30-minute break after 4 consecutive hours
  - `MIN_REST_BETWEEN` — 10-hour minimum rest between shifts
  - `MAX_CASUAL_DAILY` — 12h/day maximum for casual workers
- Rules are linked to `ExceptionReport` via `rule_id` FK

### Exception Reports (Issue 4.3)
- 6 exception types covering all PID requirements + Fair Work compliance:
  - `MissedClockOut` — clocked in but no clock-out recorded by end of day
  - `NoBreak4h` — worked 4+ consecutive hours without a break
  - `UnrosteredAttempt` — attempted clock-in when not on the roster
  - `OvertimeExceed` — exceeded daily overtime threshold
  - `MaxWeeklyHoursExceed` — exceeded weekly hour limit
  - `InsufficientRest` — less than minimum rest between consecutive shifts
- Each exception has a `severity` level (Low / Medium / High / Critical)

---

## PID Requirements ↔ Database Mapping

### Administration — Staff Setup

| PID Requirement | Database Mapping | Status |
|---|---|---|
| Staff ID Number | `Staff.staff_id` | OK |
| Name | `Staff.first_name` + `Staff.last_name` | OK |
| Type of Contract (Casual/Full Time/Part Time) | `Staff.employment_type` | OK |
| Standard Hours | `Staff.standard_weekly_hours` | OK |
| Role | `Staff.role` | OK |
| Pay rate — Standard Rate | `Staff.pay_rate_standard` | OK |
| Pay rate — Overtime Rate | `Staff.pay_rate_overtime` | OK |

### Administration — Rostering

| PID Requirement | Database Mapping | Status |
|---|---|---|
| Staff for date | `Roster.staff_id` + `Roster.roster_date` | OK |
| Start time | `Roster.scheduled_start` | OK |
| Number of hours | `Roster.scheduled_hours` (computed column) | OK |

### Administration — Clock Stations

| PID Requirement | Database Mapping | Status |
|---|---|---|
| Name | `TimeStation.station_name` + `BiometricDevice.device_name` | OK |
| Location | `TimeStation.location` | OK |
| Type: Card/Face/Fingerprint/Retinal | `BiometricDevice.device_type` | OK |

### Administration — Manual Override & Audit

| PID Requirement | Database Mapping | Status |
|---|---|---|
| Admin clock in/out staff (emergency) | `ClockRecord.is_manual_override` + `manual_override_by` | OK |
| Amend with auditing and reason | `AuditLog.change_reason` (mandatory) + `old_values` / `new_values` | OK |

### Administration — Biometric Registration

| PID Requirement | Database Mapping | Status |
|---|---|---|
| Register card/biometric to staff | `BiometricEnrollment` | OK |
| New staff | INSERT with `status = 'Active'` | OK |
| Re-register biometric | Revoke existing → new INSERT | OK |
| Lost card | `BiometricEnrollment.status = 'Lost'` | OK |
| Injury to hands/fingers | `BiometricEnrollment.status = 'Injured'` | OK |

### Reports

| PID Requirement | Database Mapping | Status |
|---|---|---|
| From/To dates — Time information | `vw_AttendanceSummary` | OK |
| From/To dates — Pay information | `vw_CostAnalysis` | OK |
| Pay Slips (fortnightly) | `Payslip` + `WageCalculation` | OK |
| Exception: clocked in not clocked out | `ExceptionReport` type = `MissedClockOut` | OK |
| Exception: 4+ hours without break | `ExceptionReport` type = `NoBreak4h` | OK |
| Exception: attempt when not rostered | `ExceptionReport` type = `UnrosteredAttempt` | OK |
| Management cost analysis | `vw_CostAnalysis` | OK |

### Farm Staff

| PID Requirement | Database Mapping | Status |
|---|---|---|
| Clock in/out on any time station | `ClockRecord.clock_in_device_id` → Device → Station | OK |
| Clock in at different station to clock out | `clock_in_device_id` ≠ `clock_out_device_id` | OK |
| Log breaks with reason | `BreakRecord.break_type` + `break_note` | OK |
| Access Roster Information | `Roster` table via API query | OK |

### Solution Considerations

| PID Requirement | Database Mapping | Status |
|---|---|---|
| Identity verification | `BiometricEnrollment.biometric_token` (encrypted hash) | OK |
| Legal working rights/time | `ComplianceRule` + `ExceptionReport` | OK |
| Data capture, storage and presentation | All tables with proper types + constraints | OK |
| Security of Data | `VARBINARY` for biometrics, `AuditLog` for all changes | OK |
| Non-cloud / on-prem | SQL Server on Windows Server 2025 | OK |
| Internet intermittently unavailable | `ClockRecord.is_synced` + `synced_at` | OK |

---

## Table Relationship Summary

```
TimeStation ──── BiometricDevice
                      │
Staff ──┬── BiometricEnrollment (by enrollment_type)
        ├── Roster
        ├── ClockRecord ──┬── BreakRecord
        │   ├── clock_in_device_id  → BiometricDevice
        │   ├── clock_out_device_id → BiometricDevice
        │   └── roster_id → Roster
        ├── WageCalculation ──── Payslip
        ├── ExceptionReport ──── ComplianceRule
        └── AuditLog
```

## Index Strategy

| Index | Purpose |
|-------|---------|
| `IX_Staff_Active` | Fast lookup of active employees (filtered) |
| `IX_Enrollment_Active` | Active biometric registrations per staff (filtered) |
| `IX_Roster_StaffDate` | Roster lookup by staff and date |
| `IX_Roster_Date` | Roster lookup by date (daily overview) |
| `IX_Clock_StaffDate` | Clock history by staff and date |
| `IX_Clock_Unsynced` | Pending offline sync records (filtered) |
| `IX_Clock_Roster` | Clock records linked to roster |
| `IX_Device_Station` | Devices per station |
| `IX_Exception_Open` | Unresolved exceptions (filtered) |
| `IX_Exception_Type` | Exceptions by type |
| `IX_Audit_Table` | Audit trail by table and record |
| `IX_Audit_DateTime` | Audit trail by timestamp |

## Views

| View | Purpose | PID Reference |
|------|---------|---------------|
| `vw_CostAnalysis` | Period-based staff cost breakdown | *"management information — cost analysis"* |
| `vw_AttendanceSummary` | Attendance with roster comparison and station info | *"time information reports attendance"* |
| `vw_OpenExceptions` | Unresolved exceptions dashboard | *"Exception reports"* |
