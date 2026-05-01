# Farm Time Management System - Database Design Explanation

> This document provides a comprehensive, friendly explanation of the combined database design (v3).
> It covers the **why** behind every design decision, how each table connects to PID requirements,
> and the overall architecture of the system.

---

## 1. Project Background

### Who is the client?
**Beerenberg Family Farm** — a real farm located in South Australia.
Currently, this farm:
- Records staff clock-in/out using **paper timesheets**
- Calculates wages manually using **Excel spreadsheets**

### Current Problems (Pain Points)
As stated in the PID (Project Initiation Document):
1. **Over/underpayment** — manual calculation leads to errors
2. **Buddy punching** — staff clocking in/out on behalf of others (no identity verification)
3. **Legal risk** — difficulty tracking compliance with Fair Work Australia regulations (working hours, breaks, etc.)
4. **Inefficiency** — printing paper, manual tallying wastes significant time

### What we are building
An electronic **Time & Attendance / Payroll PoC (Proof of Concept)** that solves all of the above.
This is not a production product — it is a **technical proof** that the system is feasible.

### Core Workflow
The PID specifies this end-to-end flow:
```
Roster --> Clock in/out --> Time Report --> Fortnightly Pay Slips --> Cost Analysis
```
The database must support every step of this pipeline.

---

## 2. Environment Constraints

Before designing the schema, we identified these constraints from the PID:

| Constraint | PID Quote | Design Decision |
|------------|-----------|-----------------|
| Server | *"Windows Server 2025 already available"* | **SQL Server** (native Windows support) |
| Network | *"internet connection is intermittently unavailable"* | Offline sync architecture (`OfflineBuffer` + `is_synced` flags) |
| Cloud | *"prefer a non-cloud based solution"* | **On-premises** only, no cloud service dependencies |
| Infrastructure | *"LAN with Wi-Fi Coverage across all time stations"* | Local network based, `TimeStation` concept with heartbeat monitoring |

### Why SQL Server?
- Runs **natively** on Windows Server 2025 (easiest install/management)
- **SQL Server Express** is free — no licence cost for PoC
- **SSMS (SQL Server Management Studio)** provides a GUI management tool
- PostgreSQL is a viable alternative, but SQL Server has tighter Windows integration

---

## 3. Schema Architecture Overview

The database is organized into **6 logical layers**, containing **20 tables** and **5 views**:

```
+-------------------------------------------------------------------+
|                        STAFF & HR LAYER                           |
|  Staff | PayRate | AdminUser | RosterRecurrence | Roster          |
+-------------------------------------------------------------------+
|                    DEVICE & BIOMETRIC LAYER                       |
|  TimeStation | StationOnboarding | BiometricDevice                |
|  BiometricEnrollment                                              |
+-------------------------------------------------------------------+
|                      TIME CAPTURE LAYER                           |
|  OfflineBuffer | ClockRecord | BreakRecord | Amendment           |
+-------------------------------------------------------------------+
|                        PAYROLL LAYER                              |
|  WageCalculation | Payslip                                        |
+-------------------------------------------------------------------+
|                   COMPLIANCE & AUDIT LAYER                        |
|  ComplianceRule | ExceptionReport | AuditLog | AdminUser          |
+-------------------------------------------------------------------+
|                   REPORTING & SYSTEM LAYER                        |
|  Report | SystemLog                                               |
+-------------------------------------------------------------------+
```

---

## 4. Table-by-Table Explanation

### 4.1 Staff (Employee Master)

**Why does this table exist?**
The PID states: *"Staff ID Number, Name, Type of Contract, Role, Pay rate"*. Every feature in the system starts with **"who is this employee?"** — clock records, rosters, pay slips, and exceptions all link back to `staff_id`.

**Key design decisions:**
- `first_name` + `last_name` instead of a single `FullName` field — allows sorting and searching by last name
- `employment_type` uses a CHECK constraint (`Casual`, `FullTime`, `PartTime`) — prevents invalid data at the database level
- `standard_weekly_hours` defaults to 38.00 (Fair Work Act standard for full-time employees)
- Personal fields (`tax_file_number`, `bank_bsb`, `bank_account`) are included for payroll processing — these should be encrypted at the application layer
- `emergency_contact_name` is included for workplace safety compliance
- `is_active` + `termination_date` enable soft-delete — we never physically delete staff records because historical data (past clock records, pay slips) must be preserved

---

### 4.2 PayRate (Versioned Pay Rates)

**Why a separate table?** (Not embedded in Staff)
Pay rates change over time. If we stored the rate directly in the `Staff` table, we would **lose the history** every time a rate changes. This matters because:
- Past wage calculations must use the rate that was active **at that time**, not the current rate
- Auditors need to see what rate was in effect for any given period
- The `is_current` flag and `effective_from`/`effective_to` dates allow multiple rate versions per staff member

**Example scenario:**
John starts at $28.50/hr on 1 March 2025. On 1 July 2025, he gets a raise to $30.00/hr. The PayRate table will have:
| Row | ordinary_rate | effective_from | effective_to | is_current |
|-----|---------------|----------------|--------------|------------|
| 1 | 28.50 | 2025-03-01 | 2025-06-30 | 0 |
| 2 | 30.00 | 2025-07-01 | NULL | 1 |

**Casual loading** (`casual_loading` field) is included because Australian casual employees receive a 25% loading on top of the ordinary rate in lieu of leave entitlements.

---

### 4.3 AdminUser (Administrator Authentication)

**Why a separate table?** (Not just `Staff.role = 'Admin'`)
The `Staff.role` field determines the **business role** (Worker, Supervisor, Admin). But the `AdminUser` table handles **system authentication** — password hash, last login, and MFA (Multi-Factor Authentication).

This separation follows the **principle of least privilege**: not every Admin-role staff member necessarily has system login credentials, and authentication data should be isolated from general staff data.

---

### 4.4 TimeStation (Clock-in/out Locations)

**Why does this table exist?**
The PID states: *"clock in/out on any time station"* and *"clock in would be a different station to clock out"*. The farm has multiple physical locations (Main Gate, Barn A, Packing Shed, Admin Office) where staff can clock in or out.

**Key fields:**
- `network_address` — IP/hostname for network communication
- `status` (Online/Offline/Maintenance) — tracks whether the station is operational
- `last_heartbeat` — timestamp of the last health check signal from the station. If this is stale, the station may have lost connectivity

---

### 4.5 StationOnboarding (Device Provisioning)

**Why does this table exist?**
When a new station is deployed on the farm, it needs a secure way to register itself with the central server. The `StationOnboarding` table stores one-time tokens that are:
1. Generated by an admin (`issued_at`)
2. Used by the station to authenticate during first setup (`linked_at`)
3. Marked as consumed (`is_used = 1`) to prevent reuse

This is a **zero-touch provisioning** pattern — it means the IT person does not need to manually configure each station.

---

### 4.6 BiometricDevice (Recognition Devices per Station)

**Why separate from TimeStation?**
The PID states: *"Type: Card/Face/Fingerprint/Retinal Scan"*. A single station can have **multiple devices** — for example, the Main Gate might have both a fingerprint reader AND a card reader. If we merged devices into the station table, we could not represent this 1-to-many relationship.

**Key fields:**
- `device_type` — Card, Face, Fingerprint, or Retinal
- `is_online` — whether the device is currently responding
- `last_sync_at` — when the device last synced its data to the central server

---

### 4.7 BiometricEnrollment (Staff Registration)

**Why does this table exist?**
The PID states: *"Need to register card/biometric to their staff record — New staff, Re-register, Lost card, Injury to hands/fingers"*.

This table tracks the **lifecycle of biometric registrations**:
- New staff → INSERT with `status = 'Active'`
- Lost card → UPDATE existing to `status = 'Lost'`, INSERT new card
- Injured finger → UPDATE existing to `status = 'Injured'`, register alternative (e.g., face scan)
- Re-register → UPDATE existing to `status = 'Revoked'`, INSERT new enrollment

**Security:** `biometric_token` is stored as `VARBINARY(512)` — this is an **encrypted hash**, never the raw biometric data (fingerprint image, face vector, etc.).

---

### 4.8 RosterRecurrence (Recurring Schedule Patterns)

**Why does this table exist?**
Many farm employees work the same schedule every week (e.g., Monday to Friday, 6:00-14:00). Instead of manually creating 5 roster entries every single week, the system can auto-generate rosters from a recurrence pattern.

**Example:**
| pattern | days_of_week | recurrence_start |
|---------|--------------|------------------|
| Weekly | Mon,Tue,Wed,Thu,Fri | 2026-01-01 |

The application layer reads this pattern and generates individual `Roster` rows for each upcoming week.

---

### 4.9 Roster (Work Schedule)

**Why does this table exist?**
The PID states: *"Rostering information: Staff for date, start time and number of hours"*.

**Key design decisions:**
- `scheduled_hours` is a **computed column**: `DATEDIFF(MINUTE, scheduled_start, scheduled_end) / 60.0` — this means the value is always consistent with start/end times and cannot become stale
- `recurrence_id` links back to `RosterRecurrence` (NULL if manually created)
- `is_override_acknowledged` — when a supervisor changes a roster, the staff member must acknowledge the change
- `created_by` — tracks which admin/supervisor created this roster entry

---

### 4.10 OfflineBuffer (Local Event Buffer)

**Why does this table exist?**
The PID states: *"non-cloud, internet intermittently unavailable"*. When the internet goes down, stations still need to record clock events. The `OfflineBuffer` stores the **raw JSON event payload** locally at the station level.

**How it works:**
1. Staff clocks in at a station while internet is down
2. Station saves the raw event to `OfflineBuffer` with `is_synced = 0`
3. When connectivity is restored, events are processed and synced to `ClockRecord`
4. `synced_at` timestamp is recorded and `is_synced` is set to 1

This is a separate concern from `ClockRecord.is_synced` — the buffer holds **raw unprocessed** data, while `ClockRecord.is_synced` tracks whether a **processed** record has reached the central server.

---

### 4.11 ClockRecord (Clock-in/out Records)

**Why does this table exist?**
This is the **core table** of the entire system. It records when staff actually clocked in and out.

**Key design decisions:**
- `clock_in_device_id` and `clock_out_device_id` are **separate FKs** — because the PID says *"clock in would be a different station to clock out"*. A worker might clock in at the Main Gate but clock out at the Packing Shed.
- `clock_in_method` / `clock_out_method` — `Biometric` (normal) or `Manual` (admin override) or `AutoMissed` (system detected no clock-out)
- `is_manual_override` + `manual_override_by` + `manual_reason` — PID: *"admin staff to clock in/out staff — biometrics not working or emergency"*
- `is_superseded` — when an amendment replaces this record, this flag is set to true (the original is preserved for audit purposes, not deleted)
- `is_unrostered_flag` — automatically flagged if the clock-in happened when no roster entry exists for that staff/date
- `paid_hours` — calculated paid hours after deducting breaks (can differ from raw clock duration)
- `offline_buffer_id` — links back to the raw offline event that generated this record

---

### 4.12 BreakRecord (Break Logs)

**Why does this table exist?**
The PID states: *"Log breaks with reason"* and *"IoT device reader then some sort of panel for choices"*.

**Key design decisions:**
- `break_type` (Lunch/Rest/Personal/Medical/Other) — corresponds to the selection panel on the IoT device
- `break_note` — free-text reason for additional detail
- `break_duration_min` — **computed column** that auto-calculates from `break_start` and `break_end`
- `is_compliant_fair_work` — a boolean flag that the system automatically sets based on compliance rules. For example, if a worker has been working for 4+ hours and takes a 30-minute break, this is marked as compliant.

---

### 4.13 Amendment (Time Entry Amendments)

**Why does this table exist?**
The PID states: *"Amend information on the time clock — with auditing and reason"*.

While `AuditLog` provides generic change tracking for all tables, `Amendment` is a **structured, purpose-built** table specifically for time entry corrections.

**Key design decisions:**
- `field_changed` + `old_value` + `new_value` — clearly identifies what was changed
- `reason` — mandatory explanation for the change
- **Dual approval workflow:**
  - `admin_staff_id` — who made the amendment
  - `approved_by_staff_id` — who approved it
  - `requires_second_approval` — for sensitive changes (e.g., changes affecting pay)
  - `is_approved` — approval status
- `triggered_pay_recalc` — flags whether this amendment requires a wage recalculation

---

### 4.14 ComplianceRule (Fair Work Legal Thresholds)

**Why does this table exist?**
The PID states: *"Legal Responsibility: Breaks/Weekly hours etc."* and references fairwork.gov.au.

**Why not hardcode these values?**
If the legal thresholds change (e.g., maximum weekly hours increases from 38 to 40), we only need to **update the database row** — no code changes required. Each rule also has `effective_from`/`effective_to` dates, so historical rules are preserved.

**Current rules:**

| rule_code | threshold | unit | applies_to |
|-----------|-----------|------|------------|
| MAX_WEEKLY_HOURS | 38.00 | hours/week | FullTime |
| MAX_DAILY_HOURS | 7.60 | hours/day | FullTime |
| MIN_BREAK_4H | 30.00 | minutes | All |
| MIN_REST_BETWEEN | 10.00 | hours | All |
| MAX_CASUAL_DAILY | 12.00 | hours/day | Casual |

---

### 4.15 ExceptionReport (Flagged Exceptions)

**Why does this table exist?**
The PID requires three specific exception reports:
1. *"daily clocked in not clocked out"* → `MissedClockOut`
2. *"more than 4 hours without break"* → `NoBreak4h`
3. *"attempt when not rostered"* → `UnrosteredAttempt`

We added three more for complete Fair Work compliance:
4. `OvertimeExceed` — exceeded daily overtime threshold
5. `MaxWeeklyHoursExceed` — exceeded weekly hour limit
6. `InsufficientRest` — less than minimum rest between consecutive shifts

**Key design decisions:**
- `severity` (Low/Medium/High/Critical) — allows prioritisation in the dashboard
- 3-state resolution workflow: **Open** → **Acknowledged** (someone has seen it) → **Resolved** (action taken)
- `acknowledged_by` — tracks who first reviewed the exception
- `resolved_by` + `resolution_note` — tracks who resolved it and how
- `rule_id` FK — links to the specific compliance rule that was violated

---

### 4.16 WageCalculation (Pay Calculation with Rate Snapshots)

**Why does this table exist?**
The PID states: *"time information reports → pay period"* and *"Standard Rate, Overtime Rate"*.

**Why separate from Payslip?**
A `Payslip` is the **final document** given to the employee. A `WageCalculation` is the **detailed calculation** that produced it. One payslip may contain multiple wage calculations (e.g., if rates changed mid-period).

**Key design decisions:**
- `applied_standard_rate`, `applied_overtime_rate`, `applied_casual_loading` — **snapshots** of the rates at calculation time. Even if rates change later, past calculations remain accurate.
- `pay_rate_id` FK — links to the specific `PayRate` version used
- Formula: `gross_total_pay = gross_standard_pay + gross_overtime_pay + gross_casual_loading`
- `status` (Draft/Confirmed/Paid) — workflow for pay period processing

---

### 4.17 Payslip (Fortnightly Pay Slips)

**Why does this table exist?**
The PID states: *"fortnightly pay slips"*.

**Key design decisions:**
- `period_start` / `period_end` — the fortnightly pay period
- `ordinary_hours` / `overtime_hours` — summary hours for the period
- `casual_loading_amt` — applicable for casual employees
- `gross_pay` → `deductions` → `net_pay` — standard payslip structure
- `is_amended` — flags if this payslip was recalculated after an amendment
- `export_path` — file system path to the generated PDF/document
- `status` (Generated/Reviewed/Distributed) — workflow from generation to delivery

---

### 4.18 AuditLog (Change Audit Trail)

**Why does this table exist?**
The PID states: *"Amend information on the time clock — with auditing and reason"*.

This is the **generic audit trail** for ALL data modifications across all tables.

**Key design decisions:**
- `change_reason` is **mandatory** (NOT NULL) — every modification must have a documented reason
- `old_values` / `new_values` — JSON snapshots of the record before and after the change
- `ip_address` — tracks the source of the change for security purposes
- `table_name` + `record_id` — polymorphic reference to any table/row in the database

---

### 4.19 Report (Report Generation Tracking)

**Why does this table exist?**
The system generates various reports (Attendance, Payroll, Exception, Cost Analysis, Compliance). This table tracks **who generated what report, when, and in which format**.

This is useful for:
- Audit compliance — proving that reports were generated and reviewed
- Re-generating reports — knowing the exact parameters used
- Usage analytics — understanding which reports are most commonly used

---

### 4.20 SystemLog (System Event Logging)

**Why does this table exist?**
This table tracks **infrastructure and device events** — things like:
- A station going offline
- A biometric device failing to sync
- Heartbeat timeouts
- System errors

**Key design decisions:**
- `severity` (Info/Warning/Error/Critical) — allows filtering and alerting
- `source_layer` — identifies which system layer generated the event (StaffHR, DeviceBiometric, TimeCapture, Payroll, ComplianceAudit, Reporting, System)
- `is_resolved` / `resolved_at` — tracks whether the issue has been addressed
- `station_id` and `staff_id` are both nullable — some events relate to a station, some to a user, some to neither

---

## 5. Views Explained

### vw_CostAnalysis
**Purpose:** Management cost analysis — shows how much each employee costs per pay period, broken down by standard pay, overtime pay, and casual loading.
**PID reference:** *"management information — cost analysis"*

### vw_AttendanceSummary
**Purpose:** Complete attendance overview — shows actual clock times vs. scheduled roster times, which station/device was used, and flags unrostered or manually overridden entries.
**PID reference:** *"time information reports attendance/number of hours for a given time/pay period"*

### vw_OpenExceptions
**Purpose:** Dashboard of all unresolved exceptions — shows what needs attention, linked to the relevant compliance rule and who has acknowledged it so far.
**PID reference:** *"Exception reports"*

### vw_PendingAmendments
**Purpose:** Approval queue — shows all time entry amendments that are waiting for approval, including who made the amendment and whether dual approval is required.
**PID reference:** *"Amend information on the time clock"*

### vw_CurrentPayRates
**Purpose:** Quick reference — shows the current active pay rate for each active employee, including casual loading.
**PID reference:** *"Pay rate — Standard Rate, Overtime Rate"*

---

## 6. Security Design

| Concern | Implementation |
|---------|----------------|
| Biometric data | Stored as encrypted hash (`VARBINARY(512)`), never raw biometric data |
| Sensitive personal data (TFN, bank details) | Encrypted at application layer; stored in `Staff` table |
| Authentication | `AdminUser` table with hashed passwords and optional MFA |
| Audit trail | `AuditLog` with mandatory `change_reason` and IP tracking |
| Amendment accountability | `Amendment` table with dual-approval workflow |
| Access control | `AdminUser.admin_role` (Admin/SuperAdmin/Auditor) for role-based access |
| Data integrity | CHECK constraints on all enum fields; FK constraints on all relationships |

---

## 7. Offline Architecture

The system uses a **dual-layer offline strategy**:

```
[Station Device]
      |
      v
[OfflineBuffer]          <-- Layer 1: Raw JSON events stored locally
      |                       when internet is down
      v
[ClockRecord]            <-- Layer 2: Processed records with
  is_synced = 0               is_synced flag for central sync
      |
      v
[Central Server]         <-- Final destination when connectivity
  is_synced = 1               is restored
```

**Why two layers?**
- `OfflineBuffer` stores **raw, unprocessed** device events — the system has not yet validated or structured this data
- `ClockRecord.is_synced` tracks whether a **validated, processed** record has reached the central database
- This separation allows the system to handle data validation failures separately from connectivity failures

---

## 8. Fair Work Australia Compliance

The database design ensures compliance with Australian workplace laws through:

1. **Configurable rules** (`ComplianceRule`) — legal thresholds are stored in the database, not hardcoded
2. **Automatic detection** (`ExceptionReport`) — the system flags violations as they occur
3. **Break compliance** (`BreakRecord.is_compliant_fair_work`) — real-time compliance checking per break
4. **Severity-based prioritisation** — Critical violations (e.g., exceeding maximum hours) are flagged higher
5. **Resolution workflow** — exceptions are tracked from detection through acknowledgement to resolution
6. **Historical preservation** — past compliance rules and violations are preserved with effective dates

---

## 9. Data Flow Summary

```
1. SETUP
   Admin creates Staff --> PayRate --> BiometricEnrollment
   Admin creates TimeStation --> BiometricDevice
   Admin creates RosterRecurrence --> Roster

2. DAILY OPERATIONS
   Staff clocks in at Device --> ClockRecord created
   Staff takes break --> BreakRecord created
   Staff clocks out at Device --> ClockRecord updated
   System checks compliance --> ExceptionReport if violated

3. IF OFFLINE
   Device stores event --> OfflineBuffer
   Connectivity restored --> ClockRecord created with is_synced flag

4. AMENDMENTS
   Admin corrects time entry --> Amendment created --> Approval workflow
   If approved --> ClockRecord updated, AuditLog created

5. FORTNIGHTLY PAYROLL
   System calculates --> WageCalculation (with rate snapshots)
   System generates --> Payslip
   Admin reviews and distributes

6. REPORTING
   Admin generates report --> Report tracking
   System monitors health --> SystemLog
```

---

## 10. Relationship Summary

| Parent | Child | Relationship | Cardinality |
|--------|-------|--------------|-------------|
| Staff | PayRate | versioned rates | 1 : N |
| Staff | AdminUser | admin authentication | 1 : 0..1 |
| Staff | RosterRecurrence | recurring patterns | 1 : N |
| Staff | Roster | work schedule | 1 : N |
| Staff | BiometricEnrollment | biometric registration | 1 : N |
| Staff | ClockRecord | clock in/out | 1 : N |
| Staff | WageCalculation | pay calculation | 1 : N |
| Staff | Payslip | pay slip | 1 : N |
| Staff | ExceptionReport | compliance violation | 1 : N |
| Staff | AuditLog | change audit | 1 : N |
| Staff | Report | report generation | 1 : N |
| TimeStation | BiometricDevice | installed devices | 1 : N |
| TimeStation | StationOnboarding | provisioning tokens | 1 : N |
| TimeStation | OfflineBuffer | local buffer | 1 : N |
| TimeStation | SystemLog | system events | 1 : N |
| BiometricDevice | BiometricEnrollment | registered at | 1 : N |
| BiometricDevice | ClockRecord (in) | clock in device | 1 : N |
| BiometricDevice | ClockRecord (out) | clock out device | 1 : N |
| RosterRecurrence | Roster | generates | 1 : N |
| Roster | ClockRecord | linked to | 1 : 0..1 |
| OfflineBuffer | ClockRecord | synced into | 1 : 0..1 |
| ClockRecord | BreakRecord | has breaks | 1 : N |
| ClockRecord | Amendment | amended by | 1 : N |
| ClockRecord | ExceptionReport | triggers | 1 : N |
| ComplianceRule | ExceptionReport | violated | 1 : N |
| PayRate | WageCalculation | rate applied | 1 : N |
| Payslip | WageCalculation | contains | 1 : N |
