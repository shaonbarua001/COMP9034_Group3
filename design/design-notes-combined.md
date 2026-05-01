# Database Design Notes (v3 Combined)

> Merged design: Seung Yun (v2) + Asif ER Design

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
- Pay rates separated into `PayRate` table (no redundant storage in Staff)
- `scheduled_hours` and `break_duration_min` are computed columns to avoid redundant storage
- Roster recurrence patterns separated into `RosterRecurrence` table

### Security (Issue 1.3)
- `biometric_token` stored as `VARBINARY(512)` — **encrypted hash only**, never raw biometric data
- `AdminUser` table provides separate authentication layer with `password_hash` and MFA support
- `tax_file_number` and `bank_account` encrypted at application layer
- All data modifications require an `AuditLog` entry with a mandatory `change_reason`
- `AuditLog.ip_address` tracks the source of every change

### Offline Synchronisation (Issue 2.2)
- **Dual-layer offline support**:
  - `OfflineBuffer` — stores raw JSON event payloads captured locally at the station
  - `ClockRecord.is_synced` / `synced_at` — tracks whether the processed record has reached central server
- `BiometricDevice.last_sync_at` tracks last successful device sync
- `TimeStation.last_heartbeat` monitors station connectivity health
- Conflict resolution handled at API layer; database provides the flags and buffers

### Wage Calculation (Issue 4.1)
- `PayRate` table stores **versioned** rates with `effective_from`/`effective_to` and `is_current` flag
- `WageCalculation` stores period-based calculation results as **snapshots**
- `applied_standard_rate`, `applied_overtime_rate`, `applied_casual_loading` preserve rates at calculation time
- Formula: `gross_total = (standard_hours x standard_rate) + (overtime_hours x overtime_rate) + casual_loading`
- Past calculations are never modified when pay rates change
- `Amendment.triggered_pay_recalc` flags whether a time entry change requires wage recalculation

### Legal Compliance (Fair Work Australia)
- `ComplianceRule` table stores configurable legal thresholds:
  - `MAX_WEEKLY_HOURS` — 38h/week for full-time (Fair Work Act s62)
  - `MAX_DAILY_HOURS` — 7.6h/day before overtime
  - `MIN_BREAK_4H` — 30-minute break after 4 consecutive hours
  - `MIN_REST_BETWEEN` — 10-hour minimum rest between shifts
  - `MAX_CASUAL_DAILY` — 12h/day maximum for casual workers
- Rules linked to `ExceptionReport` via `rule_id` FK
- `BreakRecord.is_compliant_fair_work` provides real-time compliance flag per break

### Exception Reports (Issue 4.3)
- 6 exception types covering all PID requirements + Fair Work compliance:
  - `MissedClockOut` — clocked in but no clock-out recorded by end of day
  - `NoBreak4h` — worked 4+ consecutive hours without a break
  - `UnrosteredAttempt` — attempted clock-in when not on the roster
  - `OvertimeExceed` — exceeded daily overtime threshold
  - `MaxWeeklyHoursExceed` — exceeded weekly hour limit
  - `InsufficientRest` — less than minimum rest between consecutive shifts
- Each exception has a `severity` level (Low / Medium / High / Critical)
- 3-state resolution workflow: Open → Acknowledged → Resolved
- `acknowledged_by` tracks who first saw the exception

### Amendment Workflow (Asif)
- `Amendment` table provides structured, field-level change tracking for clock records
- Dual approval support: `is_approved` + `requires_second_approval` + `approved_by_staff_id`
- Complements `AuditLog` (Amendment = structured time-entry changes, AuditLog = generic all-table audit)

---

## PID Requirements <-> Database Mapping

### Administration — Staff Setup

| PID Requirement | Database Mapping | Status |
|---|---|---|
| Staff ID Number | `Staff.staff_id` | OK |
| Name | `Staff.first_name` + `Staff.last_name` | OK |
| Type of Contract (Casual/Full Time/Part Time) | `Staff.employment_type` | OK |
| Standard Hours | `Staff.standard_weekly_hours` | OK |
| Role | `Staff.role` | OK |
| Pay rate — Standard Rate | `PayRate.ordinary_rate` (versioned) | OK |
| Pay rate — Overtime Rate | `PayRate.overtime_rate` (versioned) | OK |
| Casual Loading | `PayRate.casual_loading` | OK |
| Personal info (TFN, Bank, Emergency) | `Staff` fields | OK |
| Department | `Staff.department` | OK |

### Administration — Rostering

| PID Requirement | Database Mapping | Status |
|---|---|---|
| Staff for date | `Roster.staff_id` + `Roster.roster_date` | OK |
| Start time | `Roster.scheduled_start` | OK |
| Number of hours | `Roster.scheduled_hours` (computed column) | OK |
| Recurring patterns | `RosterRecurrence` (Weekly/Fortnightly/Monthly/Custom) | OK |
| Override acknowledged | `Roster.is_override_acknowledged` | OK |

### Administration — Clock Stations & Devices

| PID Requirement | Database Mapping | Status |
|---|---|---|
| Name | `TimeStation.station_name` + `BiometricDevice.device_name` | OK |
| Location | `TimeStation.location` | OK |
| Type: Card/Face/Fingerprint/Retinal | `BiometricDevice.device_type` | OK |
| Network info | `TimeStation.network_address` | OK |
| Device health | `TimeStation.last_heartbeat` + `status` | OK |
| Station provisioning | `StationOnboarding` | OK |

### Administration — Manual Override & Audit

| PID Requirement | Database Mapping | Status |
|---|---|---|
| Admin clock in/out staff (emergency) | `ClockRecord.is_manual_override` + `manual_override_by` | OK |
| Amend with auditing and reason | `Amendment` (structured) + `AuditLog` (generic) | OK |
| Dual approval for sensitive changes | `Amendment.requires_second_approval` + `approved_by_staff_id` | OK |
| IP tracking | `AuditLog.ip_address` | OK |

### Administration — Biometric Registration

| PID Requirement | Database Mapping | Status |
|---|---|---|
| Register card/biometric to staff | `BiometricEnrollment` | OK |
| New staff | INSERT with `status = 'Active'` | OK |
| Re-register biometric | Revoke existing -> new INSERT | OK |
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
| Current pay rates overview | `vw_CurrentPayRates` | OK |
| Pending amendments queue | `vw_PendingAmendments` | OK |
| Report generation tracking | `Report` table | OK |

### Farm Staff

| PID Requirement | Database Mapping | Status |
|---|---|---|
| Clock in/out on any time station | `ClockRecord.clock_in_device_id` -> Device -> Station | OK |
| Clock in at different station to clock out | `clock_in_device_id` != `clock_out_device_id` | OK |
| Log breaks with reason | `BreakRecord.break_type` + `break_note` | OK |
| Access Roster Information | `Roster` table via API query | OK |

### Solution Considerations

| PID Requirement | Database Mapping | Status |
|---|---|---|
| Identity verification | `BiometricEnrollment.biometric_token` (encrypted hash) | OK |
| Legal working rights/time | `ComplianceRule` + `ExceptionReport` | OK |
| Data capture, storage and presentation | All tables with proper types + constraints | OK |
| Security of Data | `VARBINARY` for biometrics, `AuditLog`, `AdminUser` with MFA | OK |
| Non-cloud / on-prem | SQL Server on Windows Server 2025 | OK |
| Internet intermittently unavailable | `OfflineBuffer` + `ClockRecord.is_synced` + `synced_at` | OK |

---

## Table Relationship Summary

```
Staff ──┬── PayRate (versioned rates)
        ├── AdminUser (authentication)
        ├── RosterRecurrence ──── Roster
        ├── BiometricEnrollment ──── BiometricDevice
        ├── ClockRecord ──┬── BreakRecord
        │   ├── clock_in_device_id  -> BiometricDevice
        │   ├── clock_out_device_id -> BiometricDevice
        │   ├── roster_id -> Roster
        │   ├── offline_buffer_id -> OfflineBuffer
        │   └── Amendment (approval workflow)
        ├── WageCalculation ──── Payslip
        │   └── pay_rate_id -> PayRate
        ├── ExceptionReport ──── ComplianceRule
        ├── AuditLog
        └── Report

TimeStation ──┬── BiometricDevice
              ├── StationOnboarding
              ├── OfflineBuffer
              └── SystemLog
```

## Index Strategy

| Index | Purpose |
|-------|---------|
| `IX_Staff_Active` | Fast lookup of active employees (filtered) |
| `IX_Staff_EmpType` | Filter by employment type |
| `IX_PayRate_Current` | Current pay rate per staff (filtered) |
| `IX_Admin_Staff` | Unique admin per staff member |
| `IX_Station_Active` | Active stations only (filtered) |
| `IX_Device_Station` | Devices per station |
| `IX_Enrollment_Active` | Active biometric registrations per staff (filtered) |
| `IX_Recurrence_Staff` | Recurrence patterns per staff |
| `IX_Roster_StaffDate` | Roster lookup by staff and date |
| `IX_Roster_Date` | Roster lookup by date (daily overview) |
| `IX_Buffer_Unsynced` | Pending offline sync buffers (filtered) |
| `IX_Clock_StaffDate` | Clock history by staff and date |
| `IX_Clock_Unsynced` | Pending offline sync records (filtered) |
| `IX_Clock_Roster` | Clock records linked to roster |
| `IX_Break_Clock` | Breaks per clock record |
| `IX_Amendment_Pending` | Unapproved amendments (filtered) |
| `IX_Exception_Open` | Unresolved exceptions (filtered) |
| `IX_Exception_Staff` | Exceptions by staff |
| `IX_Exception_Type` | Exceptions by type |
| `IX_Wage_StaffPeriod` | Wage calc by staff and period |
| `IX_Payslip_StaffPeriod` | Payslip by staff and period |
| `IX_Audit_Table` | Audit trail by table and record |
| `IX_Audit_DateTime` | Audit trail by timestamp |
| `IX_Report_Staff` | Reports by generator |
| `IX_Log_Severity` | System logs by severity |
| `IX_Log_Station` | System logs by station |
| `IX_Log_Unresolved` | Unresolved system events (filtered) |

## Views

| View | Purpose | PID Reference |
|------|---------|---------------|
| `vw_CostAnalysis` | Period-based staff cost breakdown (includes casual loading) | *"management information — cost analysis"* |
| `vw_AttendanceSummary` | Attendance with roster comparison, station info, unrostered flags | *"time information reports attendance"* |
| `vw_OpenExceptions` | Unresolved/acknowledged exceptions dashboard | *"Exception reports"* |
| `vw_PendingAmendments` | Approval queue for pending time entry amendments | *"Amend information on the time clock"* |
| `vw_CurrentPayRates` | Current active pay rates per staff | *"Pay rate — Standard Rate, Overtime Rate"* |
