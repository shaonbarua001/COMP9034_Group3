# Farm Time Management System - ER Diagram (v2)

> Mermaid ER Diagram. Copy the content inside the code block and paste it into [mermaid.live](https://mermaid.live) to render.

```mermaid
erDiagram
    STAFF {
        int staff_id PK
        varchar first_name
        varchar last_name
        varchar email
        varchar phone
        varchar employment_type
        varchar role
        decimal pay_rate_standard
        decimal pay_rate_overtime
        decimal standard_weekly_hours
        date hire_date
        date termination_date
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    TIME_STATION {
        int station_id PK
        varchar station_name
        varchar location
        varchar description
        boolean is_active
        datetime created_at
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
        varchar enrollment_type
        varbinary biometric_token
        varchar status
        varchar revoke_reason
        int enrolled_by FK
        datetime enrolled_at
        datetime revoked_at
    }

    ROSTER {
        int roster_id PK
        int staff_id FK
        date roster_date
        time scheduled_start
        time scheduled_end
        decimal scheduled_hours
        varchar status
        int created_by FK
        datetime created_at
        datetime updated_at
    }

    CLOCK_RECORD {
        int clock_id PK
        int staff_id FK
        int roster_id FK
        int clock_in_device_id FK
        int clock_out_device_id FK
        datetime clock_in
        datetime clock_out
        varchar clock_in_method
        varchar clock_out_method
        boolean is_manual_override
        int manual_override_by FK
        varchar manual_reason
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
    }

    COMPLIANCE_RULE {
        int rule_id PK
        varchar rule_code
        varchar description
        varchar rule_type
        decimal threshold_value
        varchar threshold_unit
        varchar applies_to
        boolean is_active
        datetime effective_from
        datetime effective_to
    }

    WAGE_CALCULATION {
        int wage_id PK
        int staff_id FK
        int payslip_id FK
        date period_start
        date period_end
        decimal total_standard_hours
        decimal total_overtime_hours
        decimal total_break_hours
        decimal gross_standard_pay
        decimal gross_overtime_pay
        decimal gross_total_pay
        decimal applied_standard_rate
        decimal applied_overtime_rate
        varchar status
        datetime calculated_at
    }

    PAYSLIP {
        int payslip_id PK
        int staff_id FK
        date period_start
        date period_end
        decimal gross_pay
        decimal deductions
        decimal net_pay
        varchar status
        datetime generated_at
        datetime distributed_at
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
        int resolved_by FK
        varchar resolution_note
        datetime detected_at
        datetime resolved_at
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
        datetime performed_at
    }

    TIME_STATION ||--o{ BIOMETRIC_DEVICE : "has devices"
    STAFF ||--o{ BIOMETRIC_ENROLLMENT : "enrolls"
    STAFF ||--o{ ROSTER : "is scheduled"
    STAFF ||--o{ CLOCK_RECORD : "clocks"
    BIOMETRIC_DEVICE ||--o{ CLOCK_RECORD : "clock in at"
    BIOMETRIC_DEVICE ||--o{ CLOCK_RECORD : "clock out at"
    ROSTER ||--o| CLOCK_RECORD : "linked to"
    CLOCK_RECORD ||--o{ BREAK_RECORD : "has breaks"
    STAFF ||--o{ WAGE_CALCULATION : "earns"
    STAFF ||--o{ PAYSLIP : "receives"
    PAYSLIP ||--o{ WAGE_CALCULATION : "contains"
    STAFF ||--o{ EXCEPTION_REPORT : "flagged for"
    CLOCK_RECORD ||--o{ EXCEPTION_REPORT : "triggers"
    ROSTER ||--o{ EXCEPTION_REPORT : "triggers"
    COMPLIANCE_RULE ||--o{ EXCEPTION_REPORT : "violated"
    STAFF ||--o{ AUDIT_LOG : "performed by"
```

## Entity Summary (12 Tables + 3 Views)

| Entity | Description |
|--------|-------------|
| **STAFF** | Employee master data. Contract type (Casual/FullTime/PartTime), role, pay rates, standard weekly hours |
| **TIME_STATION** | Physical clock-in/out locations on the farm (Gate, Barn, Shed, Office) |
| **BIOMETRIC_DEVICE** | Recognition devices installed at each station (Card/Face/Fingerprint/Retinal) |
| **BIOMETRIC_ENROLLMENT** | Staff-to-biometric/card registration. Handles lost card, finger injury, re-registration |
| **ROSTER** | Work schedule. Date, start/end time, scheduled hours per staff |
| **CLOCK_RECORD** | Actual clock-in/out records. Supports biometric and manual (emergency) entry. Separate in/out devices |
| **BREAK_RECORD** | Break records linked to clock records. Type + free-text note |
| **COMPLIANCE_RULE** | Fair Work Australia legal thresholds (max weekly hours, mandatory breaks, rest periods) |
| **WAGE_CALCULATION** | Period-based hours and pay calculation with rate snapshots |
| **PAYSLIP** | Fortnightly pay slips with gross/deductions/net |
| **EXCEPTION_REPORT** | Flagged exceptions: missed clock-out, no break after 4h, unrostered attempt, overtime exceed |
| **AUDIT_LOG** | Change audit trail for all data modifications. Reason mandatory |

## Views

| View | Purpose |
|------|---------|
| `vw_CostAnalysis` | Management cost analysis by period and staff |
| `vw_AttendanceSummary` | Attendance overview with roster comparison and station info |
| `vw_OpenExceptions` | Dashboard of unresolved exceptions with compliance rule details |
