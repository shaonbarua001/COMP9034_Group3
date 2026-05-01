# Farm Time Management System - ER Diagram (v3 Combined)

> Merged design: Seung Yun (v2) + Asif ER Design
> Mermaid ER Diagram. Copy the content inside the code block and paste it into [mermaid.live](https://mermaid.live) to render.

```mermaid
erDiagram
    STAFF {
        int staff_id PK
        varchar first_name
        varchar last_name
        date date_of_birth
        varchar email
        varchar phone
        varchar employment_type
        varchar role
        varchar department
        decimal standard_weekly_hours
        date hire_date
        date termination_date
        boolean is_active
        varchar emergency_contact_name
        varchar tax_file_number
        varchar bank_bsb
        varchar bank_account
        datetime created_at
        datetime updated_at
    }

    PAY_RATE {
        int pay_rate_id PK
        int staff_id FK
        decimal ordinary_rate
        decimal overtime_rate
        decimal casual_loading
        date effective_from
        date effective_to
        boolean is_current
        datetime created_at
    }

    ADMIN_USER {
        int admin_id PK
        int staff_id FK
        varchar admin_role
        varchar password_hash
        datetime last_login
        boolean requires_mfa
        boolean is_active
        datetime created_at
    }

    TIME_STATION {
        int station_id PK
        varchar station_name
        varchar location
        varchar description
        varchar network_address
        varchar status
        datetime last_heartbeat
        boolean is_active
        datetime created_at
    }

    STATION_ONBOARDING {
        int onboarding_id PK
        int station_id FK
        varchar token
        datetime issued_at
        datetime linked_at
        boolean is_used
    }

    BIOMETRIC_DEVICE {
        int device_id PK
        int station_id FK
        varchar device_name
        varchar device_type
        boolean is_online
        boolean is_active
        datetime last_sync_at
        datetime created_at
    }

    BIOMETRIC_ENROLLMENT {
        int enrollment_id PK
        int staff_id FK
        int device_id FK
        varchar enrollment_type
        varbinary biometric_token
        varchar status
        varchar deactivation_reason
        int enrolled_by FK
        datetime enrolled_at
        datetime revoked_at
    }

    ROSTER_RECURRENCE {
        int recurrence_id PK
        int staff_id FK
        varchar pattern
        date recurrence_start
        date recurrence_end
        varchar days_of_week
        boolean is_active
        datetime created_at
    }

    ROSTER {
        int roster_id PK
        int staff_id FK
        int recurrence_id FK
        date roster_date
        time scheduled_start
        time scheduled_end
        decimal scheduled_hours
        varchar status
        boolean is_override_acknowledged
        int created_by FK
        datetime created_at
        datetime updated_at
    }

    OFFLINE_BUFFER {
        int buffer_id PK
        int station_id FK
        text raw_event_payload
        datetime captured_at
        boolean is_synced
        datetime synced_at
    }

    CLOCK_RECORD {
        int clock_id PK
        int staff_id FK
        int roster_id FK
        int clock_in_device_id FK
        int clock_out_device_id FK
        int offline_buffer_id FK
        datetime clock_in
        datetime clock_out
        varchar clock_in_method
        varchar clock_out_method
        decimal paid_hours
        boolean is_manual_override
        int manual_override_by FK
        varchar manual_reason
        boolean is_superseded
        boolean is_unrostered_flag
        boolean is_synced
        datetime synced_at
        datetime created_at
    }

    BREAK_RECORD {
        int break_id PK
        int clock_id FK
        datetime break_start
        datetime break_end
        varchar break_type
        varchar break_note
        decimal break_duration_min
        boolean is_compliant_fair_work
    }

    AMENDMENT {
        int amendment_id PK
        int clock_id FK
        int admin_staff_id FK
        int approved_by_staff_id FK
        varchar field_changed
        varchar old_value
        varchar new_value
        varchar reason
        datetime amended_at
        boolean is_approved
        boolean requires_second_approval
        boolean triggered_pay_recalc
    }

    COMPLIANCE_RULE {
        int rule_id PK
        varchar rule_code
        varchar rule_name
        varchar description
        varchar rule_type
        decimal threshold_value
        varchar threshold_unit
        varchar applies_to
        boolean is_active
        date effective_from
        date effective_to
        datetime last_updated
    }

    EXCEPTION_REPORT {
        int exception_id PK
        int staff_id FK
        int clock_id FK
        int roster_id FK
        int rule_id FK
        varchar exception_type
        varchar description
        varchar severity
        varchar resolution_status
        int acknowledged_by FK
        int resolved_by FK
        varchar resolution_note
        datetime detected_at
        datetime resolved_at
    }

    WAGE_CALCULATION {
        int wage_id PK
        int staff_id FK
        int payslip_id FK
        int pay_rate_id FK
        date period_start
        date period_end
        decimal total_standard_hours
        decimal total_overtime_hours
        decimal total_break_hours
        decimal applied_standard_rate
        decimal applied_overtime_rate
        decimal applied_casual_loading
        decimal gross_standard_pay
        decimal gross_overtime_pay
        decimal gross_casual_loading
        decimal gross_total_pay
        varchar status
        datetime calculated_at
    }

    PAYSLIP {
        int payslip_id PK
        int staff_id FK
        date period_start
        date period_end
        decimal ordinary_hours
        decimal overtime_hours
        decimal casual_loading_amt
        decimal gross_pay
        decimal deductions
        decimal net_pay
        varchar status
        boolean is_amended
        varchar export_path
        datetime generated_at
        datetime distributed_at
    }

    AUDIT_LOG {
        int audit_id PK
        varchar table_name
        int record_id
        varchar action
        int performed_by FK
        varchar change_reason
        text old_values
        text new_values
        varchar ip_address
        datetime performed_at
    }

    REPORT {
        int report_id PK
        int generated_by FK
        varchar report_type
        date period_start
        date period_end
        varchar export_format
        varchar file_path
        datetime generated_at
    }

    SYSTEM_LOG {
        int log_id PK
        int station_id FK
        int staff_id FK
        varchar event_type
        varchar severity
        text message
        varchar source_layer
        varchar ip_address
        datetime occurred_at
        boolean is_resolved
        datetime resolved_at
    }

    %% ── Staff & HR Layer ──
    STAFF ||--o{ PAY_RATE : "versioned rates"
    STAFF ||--o| ADMIN_USER : "admin role"
    STAFF ||--o{ ROSTER_RECURRENCE : "recurring schedule"
    STAFF ||--o{ ROSTER : "is scheduled"
    STAFF ||--o{ BIOMETRIC_ENROLLMENT : "enrolls"
    STAFF ||--o{ CLOCK_RECORD : "clocks"
    STAFF ||--o{ WAGE_CALCULATION : "earns"
    STAFF ||--o{ PAYSLIP : "receives"
    STAFF ||--o{ EXCEPTION_REPORT : "flagged for"
    STAFF ||--o{ AUDIT_LOG : "performed by"
    STAFF ||--o{ REPORT : "generates"

    %% ── Device & Biometric Layer ──
    TIME_STATION ||--o{ BIOMETRIC_DEVICE : "has devices"
    TIME_STATION ||--o{ STATION_ONBOARDING : "onboarded via"
    TIME_STATION ||--o{ OFFLINE_BUFFER : "buffers locally"
    TIME_STATION ||--o{ SYSTEM_LOG : "generates events"
    BIOMETRIC_DEVICE ||--o{ BIOMETRIC_ENROLLMENT : "registered for"
    BIOMETRIC_DEVICE ||--o{ CLOCK_RECORD : "clock in at"
    BIOMETRIC_DEVICE ||--o{ CLOCK_RECORD : "clock out at"

    %% ── Time Capture Layer ──
    ROSTER_RECURRENCE ||--o{ ROSTER : "generates"
    ROSTER ||--o| CLOCK_RECORD : "linked to"
    OFFLINE_BUFFER ||--o| CLOCK_RECORD : "synced into"
    CLOCK_RECORD ||--o{ BREAK_RECORD : "has breaks"
    CLOCK_RECORD ||--o{ AMENDMENT : "amended by"
    CLOCK_RECORD ||--o{ EXCEPTION_REPORT : "triggers"

    %% ── Payroll Layer ──
    PAY_RATE ||--o{ WAGE_CALCULATION : "rate applied"
    PAYSLIP ||--o{ WAGE_CALCULATION : "contains"

    %% ── Compliance & Audit Layer ──
    COMPLIANCE_RULE ||--o{ EXCEPTION_REPORT : "violated"
    ROSTER ||--o{ EXCEPTION_REPORT : "triggers"
```

## Entity Summary (20 Tables + 5 Views)

### Staff & HR Layer

| Entity | Description |
|--------|-------------|
| **STAFF** | Employee master data. Personal info, contract type, role, department, bank details, emergency contact |
| **PAY_RATE** | Versioned pay rates per staff. Tracks rate history with effective dates and casual loading |
| **ADMIN_USER** | Administrator authentication. Separate from Staff role — includes password hash and MFA flag |
| **ROSTER_RECURRENCE** | Recurring schedule patterns (Weekly, Fortnightly, Monthly) with day-of-week configuration |
| **ROSTER** | Work schedule per staff per day. Computed hours column. Links to recurrence pattern |

### Device & Biometric Layer

| Entity | Description |
|--------|-------------|
| **TIME_STATION** | Physical clock-in/out locations with network address, health status, and heartbeat monitoring |
| **STATION_ONBOARDING** | Zero-touch provisioning tokens for new station deployment |
| **BIOMETRIC_DEVICE** | Recognition devices per station (Card/Face/Fingerprint/Retinal). 1 station can have N devices |
| **BIOMETRIC_ENROLLMENT** | Staff-to-biometric/card registration. Handles lost card, finger injury, re-registration |

### Time Capture Layer

| Entity | Description |
|--------|-------------|
| **OFFLINE_BUFFER** | Raw event payloads captured locally when internet is unavailable. Synced to central server later |
| **CLOCK_RECORD** | Actual clock-in/out records. Separate in/out devices, manual override, offline sync, unrostered flag |
| **BREAK_RECORD** | Break records with type, free-text note, computed duration, and Fair Work compliance flag |
| **AMENDMENT** | Structured time entry amendments with dual-approval workflow and pay recalculation trigger |

### Payroll Layer

| Entity | Description |
|--------|-------------|
| **WAGE_CALCULATION** | Period-based hours and pay calculation with rate snapshots (standard, overtime, casual loading) |
| **PAYSLIP** | Fortnightly pay slips with gross/deductions/net, amendment flag, and export path |

### Compliance & Audit Layer

| Entity | Description |
|--------|-------------|
| **COMPLIANCE_RULE** | Fair Work Australia legal thresholds. Configurable per contract type with effective dates |
| **EXCEPTION_REPORT** | Flagged exceptions with severity, 3-state resolution workflow, and acknowledgement tracking |
| **AUDIT_LOG** | Generic change audit trail for all tables. Mandatory reason, JSON snapshots, IP tracking |

### Reporting & System Layer

| Entity | Description |
|--------|-------------|
| **REPORT** | Report generation tracking — who generated what report, when, in which format |
| **SYSTEM_LOG** | Infrastructure/device event logging with severity, source layer, and resolution tracking |

## Views

| View | Purpose |
|------|---------|
| `vw_CostAnalysis` | Management cost analysis by period and staff (includes casual loading) |
| `vw_AttendanceSummary` | Attendance overview with roster comparison, station info, and unrostered flags |
| `vw_OpenExceptions` | Dashboard of unresolved/acknowledged exceptions with compliance rule details |
| `vw_PendingAmendments` | Approval queue for pending time entry amendments |
| `vw_CurrentPayRates` | Current active pay rates per active staff member |
