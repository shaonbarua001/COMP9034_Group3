-- ============================================================
-- Farm Time Management System - Combined Database Schema (v3)
-- Merged: Seung Yun (v2) + Asif ER Design
-- Target: SQL Server (Windows Server 2025, on-prem)
-- Tables: 20  |  Views: 5  |  Seed Data included
-- ============================================================


-- ============================================================
-- 1. STAFF (Employee Master)
-- Source: Both (Asif's personal info fields + Seung Yun's employment fields)
-- ============================================================
CREATE TABLE Staff (
    staff_id                INT IDENTITY(1,1) PRIMARY KEY,
    first_name              NVARCHAR(50)    NOT NULL,
    last_name               NVARCHAR(50)    NOT NULL,
    date_of_birth           DATE            NULL,
    email                   NVARCHAR(100)   NULL,
    phone                   NVARCHAR(20)    NULL,
    employment_type         NVARCHAR(20)    NOT NULL
        CONSTRAINT CK_Staff_EmpType CHECK (employment_type IN ('Casual', 'FullTime', 'PartTime')),
    role                    NVARCHAR(20)    NOT NULL DEFAULT 'Worker'
        CONSTRAINT CK_Staff_Role CHECK (role IN ('Worker', 'Supervisor', 'Admin')),
    department              NVARCHAR(100)   NULL,
    standard_weekly_hours   DECIMAL(5,2)    NOT NULL DEFAULT 38.00,
    hire_date               DATE            NOT NULL,
    termination_date        DATE            NULL,
    is_active               BIT             NOT NULL DEFAULT 1,
    -- Personal / payroll info (Asif)
    emergency_contact_name  NVARCHAR(100)   NULL,
    tax_file_number         NVARCHAR(20)    NULL,      -- TFN - encrypted at app layer
    bank_bsb                NVARCHAR(10)    NULL,
    bank_account            NVARCHAR(20)    NULL,
    created_at              DATETIME2       NOT NULL DEFAULT GETDATE(),
    updated_at              DATETIME2       NOT NULL DEFAULT GETDATE()
);

CREATE INDEX IX_Staff_Active  ON Staff (is_active) WHERE is_active = 1;
CREATE INDEX IX_Staff_EmpType ON Staff (employment_type);


-- ============================================================
-- 2. PAY_RATE (Versioned Pay Rates)
-- Source: Asif - separates rate history from Staff
-- Replaces: Seung Yun's pay_rate_standard/overtime on Staff
-- ============================================================
CREATE TABLE PayRate (
    pay_rate_id         INT IDENTITY(1,1) PRIMARY KEY,
    staff_id            INT             NOT NULL,
    ordinary_rate       DECIMAL(10,2)   NOT NULL,
    overtime_rate       DECIMAL(10,2)   NOT NULL,
    casual_loading      DECIMAL(10,2)   NOT NULL DEFAULT 0,
    effective_from      DATE            NOT NULL,
    effective_to        DATE            NULL,       -- NULL = currently active
    is_current          BIT             NOT NULL DEFAULT 1,
    created_at          DATETIME2       NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_PayRate_Staff FOREIGN KEY (staff_id) REFERENCES Staff(staff_id)
);

CREATE INDEX IX_PayRate_Staff   ON PayRate (staff_id);
CREATE INDEX IX_PayRate_Current ON PayRate (staff_id, is_current) WHERE is_current = 1;


-- ============================================================
-- 3. ADMIN_USER (Administrator Authentication)
-- Source: Asif - separate admin auth with MFA
-- ============================================================
CREATE TABLE AdminUser (
    admin_id            INT IDENTITY(1,1) PRIMARY KEY,
    staff_id            INT             NOT NULL,
    admin_role          NVARCHAR(50)    NOT NULL DEFAULT 'Admin'
        CONSTRAINT CK_Admin_Role CHECK (admin_role IN ('Admin', 'SuperAdmin', 'Auditor')),
    password_hash       NVARCHAR(256)   NOT NULL,
    last_login          DATETIME2       NULL,
    requires_mfa        BIT             NOT NULL DEFAULT 0,
    is_active           BIT             NOT NULL DEFAULT 1,
    created_at          DATETIME2       NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Admin_Staff FOREIGN KEY (staff_id) REFERENCES Staff(staff_id)
);

CREATE UNIQUE INDEX IX_Admin_Staff ON AdminUser (staff_id);


-- ============================================================
-- 4. TIME_STATION (Clock-in/out Locations)
-- Source: Both (Seung Yun base + Asif's network/heartbeat fields)
-- ============================================================
CREATE TABLE TimeStation (
    station_id          INT IDENTITY(1,1) PRIMARY KEY,
    station_name        NVARCHAR(100)   NOT NULL,
    location            NVARCHAR(200)   NOT NULL,
    description         NVARCHAR(500)   NULL,
    network_address     NVARCHAR(100)   NULL,       -- Asif: IP/hostname
    status              NVARCHAR(20)    NOT NULL DEFAULT 'Online'
        CONSTRAINT CK_Station_Status CHECK (status IN ('Online', 'Offline', 'Maintenance')),
    last_heartbeat      DATETIME2       NULL,       -- Asif: device health
    is_active           BIT             NOT NULL DEFAULT 1,
    created_at          DATETIME2       NOT NULL DEFAULT GETDATE()
);

CREATE INDEX IX_Station_Active ON TimeStation (is_active) WHERE is_active = 1;


-- ============================================================
-- 5. STATION_ONBOARDING (Device Onboarding Tokens)
-- Source: Asif - zero-touch provisioning for new stations
-- ============================================================
CREATE TABLE StationOnboarding (
    onboarding_id       INT IDENTITY(1,1) PRIMARY KEY,
    station_id          INT             NOT NULL,
    token               NVARCHAR(200)   NOT NULL,
    issued_at           DATETIME2       NOT NULL DEFAULT GETDATE(),
    linked_at           DATETIME2       NULL,
    is_used             BIT             NOT NULL DEFAULT 0,

    CONSTRAINT FK_Onboarding_Station FOREIGN KEY (station_id) REFERENCES TimeStation(station_id)
);

CREATE INDEX IX_Onboarding_Station ON StationOnboarding (station_id);


-- ============================================================
-- 6. BIOMETRIC_DEVICE (Recognition Devices per Station)
-- Source: Seung Yun - 1 station can have N devices (card + fingerprint etc.)
-- ============================================================
CREATE TABLE BiometricDevice (
    device_id           INT IDENTITY(1,1) PRIMARY KEY,
    station_id          INT             NOT NULL,
    device_name         NVARCHAR(100)   NOT NULL,
    device_type         NVARCHAR(20)    NOT NULL
        CONSTRAINT CK_Device_Type CHECK (device_type IN ('Card', 'Face', 'Fingerprint', 'Retinal')),
    is_online           BIT             NOT NULL DEFAULT 1,
    is_active           BIT             NOT NULL DEFAULT 1,
    last_sync_at        DATETIME2       NULL,
    created_at          DATETIME2       NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Device_Station FOREIGN KEY (station_id) REFERENCES TimeStation(station_id)
);

CREATE INDEX IX_Device_Station ON BiometricDevice (station_id);


-- ============================================================
-- 7. BIOMETRIC_ENROLLMENT (Staff Biometric/Card Registration)
-- Source: Both (Seung Yun's revoke workflow + Asif's station link)
-- ============================================================
CREATE TABLE BiometricEnrollment (
    enrollment_id       INT IDENTITY(1,1) PRIMARY KEY,
    staff_id            INT             NOT NULL,
    device_id           INT             NULL,       -- which device was used for enrollment
    enrollment_type     NVARCHAR(20)    NOT NULL
        CONSTRAINT CK_Enrollment_Type CHECK (enrollment_type IN ('Card', 'Face', 'Fingerprint', 'Retinal')),
    biometric_token     VARBINARY(512)  NOT NULL,   -- encrypted hash only
    status              NVARCHAR(20)    NOT NULL DEFAULT 'Active'
        CONSTRAINT CK_Enrollment_Status CHECK (status IN ('Active', 'Revoked', 'Lost', 'Injured')),
    deactivation_reason NVARCHAR(500)   NULL,       -- covers revoke, lost card, injury etc.
    enrolled_by         INT             NOT NULL,
    enrolled_at         DATETIME2       NOT NULL DEFAULT GETDATE(),
    revoked_at          DATETIME2       NULL,

    CONSTRAINT FK_Enrollment_Staff      FOREIGN KEY (staff_id)    REFERENCES Staff(staff_id),
    CONSTRAINT FK_Enrollment_Device     FOREIGN KEY (device_id)   REFERENCES BiometricDevice(device_id),
    CONSTRAINT FK_Enrollment_EnrolledBy FOREIGN KEY (enrolled_by) REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Enrollment_Staff  ON BiometricEnrollment (staff_id);
CREATE INDEX IX_Enrollment_Active ON BiometricEnrollment (staff_id, status) WHERE status = 'Active';


-- ============================================================
-- 8. ROSTER_RECURRENCE (Recurring Schedule Patterns)
-- Source: Asif - auto-generate rosters from patterns
-- ============================================================
CREATE TABLE RosterRecurrence (
    recurrence_id       INT IDENTITY(1,1) PRIMARY KEY,
    staff_id            INT             NOT NULL,
    pattern             NVARCHAR(50)    NOT NULL
        CONSTRAINT CK_Recurrence_Pattern CHECK (pattern IN ('Weekly', 'Fortnightly', 'Monthly', 'Custom')),
    recurrence_start    DATE            NOT NULL,
    recurrence_end      DATE            NULL,
    days_of_week        NVARCHAR(50)    NOT NULL,   -- e.g. 'Mon,Tue,Wed,Thu,Fri'
    is_active           BIT             NOT NULL DEFAULT 1,
    created_at          DATETIME2       NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Recurrence_Staff FOREIGN KEY (staff_id) REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Recurrence_Staff ON RosterRecurrence (staff_id);


-- ============================================================
-- 9. ROSTER (Work Schedule)
-- Source: Both (Seung Yun's computed hours + Asif's recurrence link)
-- ============================================================
CREATE TABLE Roster (
    roster_id               INT IDENTITY(1,1) PRIMARY KEY,
    staff_id                INT             NOT NULL,
    recurrence_id           INT             NULL,       -- Asif: linked to pattern
    roster_date             DATE            NOT NULL,
    scheduled_start         TIME            NOT NULL,
    scheduled_end           TIME            NOT NULL,
    scheduled_hours         AS CAST(DATEDIFF(MINUTE, scheduled_start, scheduled_end) / 60.0 AS DECIMAL(5,2)) PERSISTED,
    status                  NVARCHAR(20)    NOT NULL DEFAULT 'Scheduled'
        CONSTRAINT CK_Roster_Status CHECK (status IN ('Scheduled', 'Cancelled', 'Modified')),
    is_override_acknowledged BIT            NOT NULL DEFAULT 0,  -- Asif: staff acknowledged change
    created_by              INT             NOT NULL,
    created_at              DATETIME2       NOT NULL DEFAULT GETDATE(),
    updated_at              DATETIME2       NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Roster_Staff      FOREIGN KEY (staff_id)      REFERENCES Staff(staff_id),
    CONSTRAINT FK_Roster_Recurrence FOREIGN KEY (recurrence_id) REFERENCES RosterRecurrence(recurrence_id),
    CONSTRAINT FK_Roster_CreatedBy  FOREIGN KEY (created_by)    REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Roster_StaffDate ON Roster (staff_id, roster_date);
CREATE INDEX IX_Roster_Date      ON Roster (roster_date);


-- ============================================================
-- 10. OFFLINE_BUFFER (Local Buffer for Offline Stations)
-- Source: Asif - stores raw events when internet is down
-- Complements: Seung Yun's is_synced flag on ClockRecord
-- ============================================================
CREATE TABLE OfflineBuffer (
    buffer_id           INT IDENTITY(1,1) PRIMARY KEY,
    station_id          INT             NOT NULL,
    raw_event_payload   NVARCHAR(MAX)   NOT NULL,   -- JSON payload from device
    captured_at         DATETIME2       NOT NULL DEFAULT GETDATE(),
    is_synced           BIT             NOT NULL DEFAULT 0,
    synced_at           DATETIME2       NULL,

    CONSTRAINT FK_Buffer_Station FOREIGN KEY (station_id) REFERENCES TimeStation(station_id)
);

CREATE INDEX IX_Buffer_Unsynced ON OfflineBuffer (is_synced) WHERE is_synced = 0;
CREATE INDEX IX_Buffer_Station  ON OfflineBuffer (station_id);


-- ============================================================
-- 11. CLOCK_RECORD (Clock-in/out Records)
-- Source: Both (Seung Yun's device-level tracking + Asif's flags)
-- ============================================================
CREATE TABLE ClockRecord (
    clock_id            INT IDENTITY(1,1) PRIMARY KEY,
    staff_id            INT             NOT NULL,
    roster_id           INT             NULL,
    clock_in_device_id  INT             NULL,       -- NULL if manual entry
    clock_out_device_id INT             NULL,       -- can differ from clock_in
    offline_buffer_id   INT             NULL,       -- Asif: link to offline source
    clock_in            DATETIME2       NOT NULL,
    clock_out           DATETIME2       NULL,
    clock_in_method     NVARCHAR(20)    NOT NULL DEFAULT 'Biometric'
        CONSTRAINT CK_Clock_InMethod CHECK (clock_in_method IN ('Biometric', 'Manual')),
    clock_out_method    NVARCHAR(20)    NULL
        CONSTRAINT CK_Clock_OutMethod CHECK (clock_out_method IN ('Biometric', 'Manual', 'AutoMissed')),
    paid_hours          DECIMAL(5,2)    NULL,       -- Asif: calculated paid hours
    is_manual_override  BIT             NOT NULL DEFAULT 0,
    manual_override_by  INT             NULL,
    manual_reason       NVARCHAR(500)   NULL,
    is_superseded       BIT             NOT NULL DEFAULT 0,   -- Asif: replaced by amendment
    is_unrostered_flag  BIT             NOT NULL DEFAULT 0,   -- Asif: not on roster
    is_synced           BIT             NOT NULL DEFAULT 1,   -- 0 = offline pending
    synced_at           DATETIME2       NULL,
    created_at          DATETIME2       NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Clock_Staff      FOREIGN KEY (staff_id)            REFERENCES Staff(staff_id),
    CONSTRAINT FK_Clock_Roster     FOREIGN KEY (roster_id)           REFERENCES Roster(roster_id),
    CONSTRAINT FK_Clock_InDevice   FOREIGN KEY (clock_in_device_id)  REFERENCES BiometricDevice(device_id),
    CONSTRAINT FK_Clock_OutDevice  FOREIGN KEY (clock_out_device_id) REFERENCES BiometricDevice(device_id),
    CONSTRAINT FK_Clock_Buffer     FOREIGN KEY (offline_buffer_id)   REFERENCES OfflineBuffer(buffer_id),
    CONSTRAINT FK_Clock_OverrideBy FOREIGN KEY (manual_override_by)  REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Clock_StaffDate ON ClockRecord (staff_id, clock_in);
CREATE INDEX IX_Clock_Unsynced  ON ClockRecord (is_synced) WHERE is_synced = 0;
CREATE INDEX IX_Clock_Roster    ON ClockRecord (roster_id);


-- ============================================================
-- 12. BREAK_RECORD (Break Logs)
-- Source: Both (Seung Yun's types + Asif's compliance flag)
-- ============================================================
CREATE TABLE BreakRecord (
    break_id                INT IDENTITY(1,1) PRIMARY KEY,
    clock_id                INT             NOT NULL,
    break_start             DATETIME2       NOT NULL,
    break_end               DATETIME2       NULL,
    break_type              NVARCHAR(20)    NOT NULL DEFAULT 'Lunch'
        CONSTRAINT CK_Break_Type CHECK (break_type IN ('Lunch', 'Rest', 'Personal', 'Medical', 'Other')),
    break_note              NVARCHAR(500)   NULL,
    break_duration_min      AS CASE
        WHEN break_end IS NOT NULL
        THEN CAST(DATEDIFF(MINUTE, break_start, break_end) AS DECIMAL(5,1))
        ELSE NULL
    END,
    is_compliant_fair_work  BIT             NOT NULL DEFAULT 1,  -- Asif: auto-checked

    CONSTRAINT FK_Break_Clock FOREIGN KEY (clock_id) REFERENCES ClockRecord(clock_id)
);

CREATE INDEX IX_Break_Clock ON BreakRecord (clock_id);


-- ============================================================
-- 13. AMENDMENT (Time Entry Amendments with Approval Workflow)
-- Source: Asif - dedicated amendment tracking with dual approval
-- Complements: Seung Yun's AuditLog (Amendment = structured, AuditLog = generic)
-- ============================================================
CREATE TABLE Amendment (
    amendment_id            INT IDENTITY(1,1) PRIMARY KEY,
    clock_id                INT             NOT NULL,
    admin_staff_id          INT             NOT NULL,
    approved_by_staff_id    INT             NULL,
    field_changed           NVARCHAR(100)   NOT NULL,
    old_value               NVARCHAR(500)   NULL,
    new_value               NVARCHAR(500)   NULL,
    reason                  NVARCHAR(500)   NOT NULL,
    amended_at              DATETIME2       NOT NULL DEFAULT GETDATE(),
    is_approved             BIT             NOT NULL DEFAULT 0,
    requires_second_approval BIT            NOT NULL DEFAULT 0,
    triggered_pay_recalc    BIT             NOT NULL DEFAULT 0,

    CONSTRAINT FK_Amendment_Clock    FOREIGN KEY (clock_id)             REFERENCES ClockRecord(clock_id),
    CONSTRAINT FK_Amendment_Admin    FOREIGN KEY (admin_staff_id)       REFERENCES Staff(staff_id),
    CONSTRAINT FK_Amendment_Approver FOREIGN KEY (approved_by_staff_id) REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Amendment_Clock   ON Amendment (clock_id);
CREATE INDEX IX_Amendment_Pending ON Amendment (is_approved) WHERE is_approved = 0;


-- ============================================================
-- 14. COMPLIANCE_RULE (Fair Work Legal Thresholds)
-- Source: Seung Yun (detailed) + Asif (LastUpdated)
-- ============================================================
CREATE TABLE ComplianceRule (
    rule_id             INT IDENTITY(1,1) PRIMARY KEY,
    rule_code           NVARCHAR(50)    NOT NULL UNIQUE,
    rule_name           NVARCHAR(100)   NOT NULL,       -- Asif: human-readable name
    description         NVARCHAR(500)   NOT NULL,
    rule_type           NVARCHAR(20)    NOT NULL
        CONSTRAINT CK_Rule_Type CHECK (rule_type IN ('WorkingHours', 'Break', 'Overtime', 'Rest')),
    threshold_value     DECIMAL(10,2)   NOT NULL,
    threshold_unit      NVARCHAR(20)    NOT NULL
        CONSTRAINT CK_Rule_Unit CHECK (threshold_unit IN ('hours/week', 'hours/day', 'hours', 'minutes')),
    applies_to          NVARCHAR(20)    NOT NULL DEFAULT 'All'
        CONSTRAINT CK_Rule_AppliesTo CHECK (applies_to IN ('All', 'FullTime', 'PartTime', 'Casual')),
    is_active           BIT             NOT NULL DEFAULT 1,
    effective_from      DATE            NOT NULL,
    effective_to        DATE            NULL,
    last_updated        DATETIME2       NOT NULL DEFAULT GETDATE()  -- Asif
);


-- ============================================================
-- 15. EXCEPTION_REPORT (Flagged Exceptions / Compliance Violations)
-- Source: Seung Yun (types + severity) + Asif (acknowledged_by)
-- ============================================================
CREATE TABLE ExceptionReport (
    exception_id        INT IDENTITY(1,1) PRIMARY KEY,
    staff_id            INT             NOT NULL,
    clock_id            INT             NULL,
    roster_id           INT             NULL,
    rule_id             INT             NULL,
    exception_type      NVARCHAR(30)    NOT NULL
        CONSTRAINT CK_Exception_Type CHECK (exception_type IN (
            'MissedClockOut', 'NoBreak4h', 'UnrosteredAttempt',
            'OvertimeExceed', 'MaxWeeklyHoursExceed', 'InsufficientRest'
        )),
    description         NVARCHAR(1000)  NOT NULL,
    severity            NVARCHAR(10)    NOT NULL DEFAULT 'Medium'
        CONSTRAINT CK_Exception_Severity CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
    resolution_status   NVARCHAR(20)    NOT NULL DEFAULT 'Open'
        CONSTRAINT CK_Exception_ResStatus CHECK (resolution_status IN ('Open', 'Acknowledged', 'Resolved')),
    acknowledged_by     INT             NULL,       -- Asif: who saw it first
    resolved_by         INT             NULL,
    resolution_note     NVARCHAR(1000)  NULL,
    detected_at         DATETIME2       NOT NULL DEFAULT GETDATE(),
    resolved_at         DATETIME2       NULL,

    CONSTRAINT FK_Exception_Staff    FOREIGN KEY (staff_id)        REFERENCES Staff(staff_id),
    CONSTRAINT FK_Exception_Clock    FOREIGN KEY (clock_id)        REFERENCES ClockRecord(clock_id),
    CONSTRAINT FK_Exception_Roster   FOREIGN KEY (roster_id)       REFERENCES Roster(roster_id),
    CONSTRAINT FK_Exception_Rule     FOREIGN KEY (rule_id)         REFERENCES ComplianceRule(rule_id),
    CONSTRAINT FK_Exception_AckedBy  FOREIGN KEY (acknowledged_by) REFERENCES Staff(staff_id),
    CONSTRAINT FK_Exception_Resolver FOREIGN KEY (resolved_by)     REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Exception_Open  ON ExceptionReport (resolution_status) WHERE resolution_status = 'Open';
CREATE INDEX IX_Exception_Staff ON ExceptionReport (staff_id);
CREATE INDEX IX_Exception_Type  ON ExceptionReport (exception_type);


-- ============================================================
-- 16. WAGE_CALCULATION (Pay Calculation with Rate Snapshots)
-- Source: Seung Yun - detailed period-based calculation
-- Enhanced: links to PayRate for versioned rate lookup
-- ============================================================
CREATE TABLE WageCalculation (
    wage_id                 INT IDENTITY(1,1) PRIMARY KEY,
    staff_id                INT             NOT NULL,
    payslip_id              INT             NULL,
    pay_rate_id             INT             NULL,       -- link to rate version used
    period_start            DATE            NOT NULL,
    period_end              DATE            NOT NULL,
    total_standard_hours    DECIMAL(8,2)    NOT NULL DEFAULT 0,
    total_overtime_hours    DECIMAL(8,2)    NOT NULL DEFAULT 0,
    total_break_hours       DECIMAL(8,2)    NOT NULL DEFAULT 0,
    applied_standard_rate   DECIMAL(10,2)   NOT NULL,
    applied_overtime_rate   DECIMAL(10,2)   NOT NULL,
    applied_casual_loading  DECIMAL(10,2)   NOT NULL DEFAULT 0,  -- Asif
    gross_standard_pay      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    gross_overtime_pay      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    gross_casual_loading    DECIMAL(12,2)   NOT NULL DEFAULT 0,  -- Asif
    gross_total_pay         DECIMAL(12,2)   NOT NULL DEFAULT 0,
    status                  NVARCHAR(20)    NOT NULL DEFAULT 'Draft'
        CONSTRAINT CK_Wage_Status CHECK (status IN ('Draft', 'Confirmed', 'Paid')),
    calculated_at           DATETIME2       NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Wage_Staff   FOREIGN KEY (staff_id)    REFERENCES Staff(staff_id),
    CONSTRAINT FK_Wage_Rate    FOREIGN KEY (pay_rate_id) REFERENCES PayRate(pay_rate_id)
    -- FK to Payslip added after Payslip table
);

CREATE INDEX IX_Wage_StaffPeriod ON WageCalculation (staff_id, period_start);


-- ============================================================
-- 17. PAYSLIP (Fortnightly Pay Slips)
-- Source: Both (Seung Yun's deductions/net + Asif's export/amend)
-- ============================================================
CREATE TABLE Payslip (
    payslip_id          INT IDENTITY(1,1) PRIMARY KEY,
    staff_id            INT             NOT NULL,
    period_start        DATE            NOT NULL,
    period_end          DATE            NOT NULL,
    ordinary_hours      DECIMAL(8,2)    NOT NULL DEFAULT 0,     -- Asif
    overtime_hours      DECIMAL(8,2)    NOT NULL DEFAULT 0,     -- Asif
    casual_loading_amt  DECIMAL(12,2)   NOT NULL DEFAULT 0,     -- Asif
    gross_pay           DECIMAL(12,2)   NOT NULL,
    deductions          DECIMAL(12,2)   NOT NULL DEFAULT 0,     -- Seung Yun
    net_pay             DECIMAL(12,2)   NOT NULL,               -- Seung Yun
    status              NVARCHAR(20)    NOT NULL DEFAULT 'Generated'
        CONSTRAINT CK_Payslip_Status CHECK (status IN ('Generated', 'Reviewed', 'Distributed')),
    is_amended          BIT             NOT NULL DEFAULT 0,     -- Asif
    export_path         NVARCHAR(500)   NULL,                   -- Asif: PDF/file path
    generated_at        DATETIME2       NOT NULL DEFAULT GETDATE(),
    distributed_at      DATETIME2       NULL,

    CONSTRAINT FK_Payslip_Staff FOREIGN KEY (staff_id) REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Payslip_StaffPeriod ON Payslip (staff_id, period_start);

-- Deferred FK: WageCalculation -> Payslip
ALTER TABLE WageCalculation
    ADD CONSTRAINT FK_Wage_Payslip FOREIGN KEY (payslip_id) REFERENCES Payslip(payslip_id);


-- ============================================================
-- 18. AUDIT_LOG (Change Audit Trail)
-- Source: Both (Seung Yun's mandatory reason + Asif's IP tracking)
-- ============================================================
CREATE TABLE AuditLog (
    audit_id            INT IDENTITY(1,1) PRIMARY KEY,
    table_name          NVARCHAR(100)   NOT NULL,
    record_id           INT             NOT NULL,
    action              NVARCHAR(10)    NOT NULL
        CONSTRAINT CK_Audit_Action CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    performed_by        INT             NOT NULL,
    change_reason       NVARCHAR(500)   NOT NULL,
    old_values          NVARCHAR(MAX)   NULL,
    new_values          NVARCHAR(MAX)   NULL,
    ip_address          NVARCHAR(45)    NULL,       -- Asif
    performed_at        DATETIME2       NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Audit_Staff FOREIGN KEY (performed_by) REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Audit_Table    ON AuditLog (table_name, record_id);
CREATE INDEX IX_Audit_DateTime ON AuditLog (performed_at);


-- ============================================================
-- 19. REPORT (Report Generation Tracking)
-- Source: Asif - tracks who generated what report
-- ============================================================
CREATE TABLE Report (
    report_id           INT IDENTITY(1,1) PRIMARY KEY,
    generated_by        INT             NOT NULL,
    report_type         NVARCHAR(50)    NOT NULL
        CONSTRAINT CK_Report_Type CHECK (report_type IN (
            'Attendance', 'Payroll', 'Exception', 'CostAnalysis', 'Compliance', 'Custom'
        )),
    period_start        DATE            NULL,
    period_end          DATE            NULL,
    export_format       NVARCHAR(20)    NOT NULL DEFAULT 'PDF'
        CONSTRAINT CK_Report_Format CHECK (export_format IN ('PDF', 'CSV', 'Excel')),
    file_path           NVARCHAR(500)   NULL,
    generated_at        DATETIME2       NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Report_Staff FOREIGN KEY (generated_by) REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Report_Staff ON Report (generated_by);


-- ============================================================
-- 20. SYSTEM_LOG (System Event Logging)
-- Source: Asif - infrastructure/device event tracking
-- ============================================================
CREATE TABLE SystemLog (
    log_id              INT IDENTITY(1,1) PRIMARY KEY,
    station_id          INT             NULL,
    staff_id            INT             NULL,
    event_type          NVARCHAR(50)    NOT NULL,
    severity            NVARCHAR(20)    NOT NULL DEFAULT 'Info'
        CONSTRAINT CK_Log_Severity CHECK (severity IN ('Info', 'Warning', 'Error', 'Critical')),
    message             NVARCHAR(MAX)   NOT NULL,
    source_layer        NVARCHAR(50)    NULL
        CONSTRAINT CK_Log_Layer CHECK (source_layer IN (
            'StaffHR', 'DeviceBiometric', 'TimeCapture', 'Payroll',
            'ComplianceAudit', 'Reporting', 'System'
        )),
    ip_address          NVARCHAR(45)    NULL,
    occurred_at         DATETIME2       NOT NULL DEFAULT GETDATE(),
    is_resolved         BIT             NOT NULL DEFAULT 0,
    resolved_at         DATETIME2       NULL,

    CONSTRAINT FK_Log_Station FOREIGN KEY (station_id) REFERENCES TimeStation(station_id),
    CONSTRAINT FK_Log_Staff   FOREIGN KEY (staff_id)   REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Log_Severity   ON SystemLog (severity);
CREATE INDEX IX_Log_Station    ON SystemLog (station_id);
CREATE INDEX IX_Log_Unresolved ON SystemLog (is_resolved) WHERE is_resolved = 0;


-- ============================================================
-- VIEWS
-- ============================================================

-- View 1: Cost Analysis (Management)
GO
CREATE VIEW vw_CostAnalysis AS
SELECT
    w.period_start,
    w.period_end,
    s.staff_id,
    s.first_name + ' ' + s.last_name   AS staff_name,
    s.employment_type,
    s.role,
    s.department,
    w.total_standard_hours,
    w.total_overtime_hours,
    w.total_break_hours,
    w.gross_standard_pay,
    w.gross_overtime_pay,
    w.gross_casual_loading,
    w.gross_total_pay,
    w.applied_standard_rate,
    w.applied_overtime_rate,
    w.applied_casual_loading
FROM WageCalculation w
JOIN Staff s ON w.staff_id = s.staff_id;
GO


-- View 2: Attendance Summary with Station Info
CREATE VIEW vw_AttendanceSummary AS
SELECT
    c.staff_id,
    s.first_name + ' ' + s.last_name   AS staff_name,
    CAST(c.clock_in AS DATE)            AS work_date,
    c.clock_in,
    c.clock_out,
    CASE
        WHEN c.clock_out IS NOT NULL
        THEN CAST(DATEDIFF(MINUTE, c.clock_in, c.clock_out) / 60.0 AS DECIMAL(5,2))
        ELSE NULL
    END                                 AS worked_hours,
    c.paid_hours,
    c.clock_in_method,
    c.clock_out_method,
    c.is_manual_override,
    c.is_unrostered_flag,
    r.scheduled_start,
    r.scheduled_end,
    r.scheduled_hours,
    din.device_name                     AS clock_in_device,
    dout.device_name                    AS clock_out_device,
    sin.station_name                    AS clock_in_station,
    sout.station_name                   AS clock_out_station
FROM ClockRecord c
JOIN Staff s                            ON c.staff_id           = s.staff_id
LEFT JOIN Roster r                      ON c.roster_id          = r.roster_id
LEFT JOIN BiometricDevice din           ON c.clock_in_device_id = din.device_id
LEFT JOIN TimeStation sin               ON din.station_id       = sin.station_id
LEFT JOIN BiometricDevice dout          ON c.clock_out_device_id = dout.device_id
LEFT JOIN TimeStation sout              ON dout.station_id      = sout.station_id;
GO


-- View 3: Open Exceptions Dashboard
CREATE VIEW vw_OpenExceptions AS
SELECT
    e.exception_id,
    e.exception_type,
    e.severity,
    e.description,
    e.detected_at,
    s.first_name + ' ' + s.last_name   AS staff_name,
    cr.rule_code,
    cr.rule_name,
    cr.description                      AS rule_description,
    ack.first_name + ' ' + ack.last_name AS acknowledged_by_name
FROM ExceptionReport e
JOIN Staff s                            ON e.staff_id           = s.staff_id
LEFT JOIN ComplianceRule cr             ON e.rule_id            = cr.rule_id
LEFT JOIN Staff ack                     ON e.acknowledged_by    = ack.staff_id
WHERE e.resolution_status IN ('Open', 'Acknowledged');
GO


-- View 4: Pending Amendments (Asif's approval workflow)
CREATE VIEW vw_PendingAmendments AS
SELECT
    a.amendment_id,
    a.field_changed,
    a.old_value,
    a.new_value,
    a.reason,
    a.amended_at,
    a.requires_second_approval,
    s.first_name + ' ' + s.last_name       AS staff_name,
    adm.first_name + ' ' + adm.last_name   AS amended_by,
    apr.first_name + ' ' + apr.last_name    AS approved_by
FROM Amendment a
JOIN ClockRecord c                          ON a.clock_id              = c.clock_id
JOIN Staff s                                ON c.staff_id              = s.staff_id
JOIN Staff adm                              ON a.admin_staff_id        = adm.staff_id
LEFT JOIN Staff apr                         ON a.approved_by_staff_id  = apr.staff_id
WHERE a.is_approved = 0;
GO


-- View 5: Current Pay Rates per Staff
CREATE VIEW vw_CurrentPayRates AS
SELECT
    s.staff_id,
    s.first_name + ' ' + s.last_name   AS staff_name,
    s.employment_type,
    s.department,
    pr.ordinary_rate,
    pr.overtime_rate,
    pr.casual_loading,
    pr.effective_from
FROM Staff s
JOIN PayRate pr ON s.staff_id = pr.staff_id
WHERE pr.is_current = 1
  AND s.is_active = 1;
GO


-- ============================================================
-- SEED DATA
-- ============================================================

-- Time Stations
INSERT INTO TimeStation (station_name, location, description, network_address, status)
VALUES
    ('Main Gate',    'Farm Entrance',      'Primary entry point for all staff',  '192.168.1.10', 'Online'),
    ('Barn A',       'Barn A - East Wing', 'Livestock area station',             '192.168.1.11', 'Online'),
    ('Packing Shed', 'Packing Shed',       'Produce processing area',            '192.168.1.12', 'Online'),
    ('Admin Office', 'Main Building',      'Office staff station',               '192.168.1.13', 'Online');

-- Biometric Devices (1 station can have multiple devices)
INSERT INTO BiometricDevice (station_id, device_name, device_type)
VALUES
    (1, 'Gate Fingerprint Reader',  'Fingerprint'),
    (1, 'Gate Card Reader',         'Card'),
    (2, 'Barn A Card Reader',       'Card'),
    (3, 'Shed Fingerprint Reader',  'Fingerprint'),
    (4, 'Office Face Scanner',      'Face');

-- Admin user
INSERT INTO Staff (first_name, last_name, email, employment_type, role, department, standard_weekly_hours, hire_date)
VALUES ('Farm', 'Admin', 'admin@farmtime.local', 'FullTime', 'Admin', 'Management', 38.00, '2025-01-01');

-- Workers
INSERT INTO Staff (first_name, last_name, email, employment_type, role, department, standard_weekly_hours, hire_date)
VALUES
    ('John',  'Smith',  'john@farmtime.local',  'FullTime', 'Worker',     'Field Ops',   38.00, '2025-03-01'),
    ('Sarah', 'Jones',  'sarah@farmtime.local', 'PartTime', 'Worker',     'Packing',     20.00, '2025-04-15'),
    ('Mike',  'Brown',  'mike@farmtime.local',  'Casual',   'Worker',     'Field Ops',    0.00, '2025-06-01'),
    ('Emma',  'Wilson', 'emma@farmtime.local',  'FullTime', 'Supervisor', 'Field Ops',   38.00, '2025-02-01');

-- Pay Rates (versioned)
INSERT INTO PayRate (staff_id, ordinary_rate, overtime_rate, casual_loading, effective_from, is_current)
VALUES
    (1, 45.00, 67.50, 0,    '2025-01-01', 1),
    (2, 28.50, 42.75, 0,    '2025-03-01', 1),
    (3, 28.50, 42.75, 0,    '2025-04-15', 1),
    (4, 28.50, 42.75, 7.13, '2025-06-01', 1),  -- 25% casual loading
    (5, 35.00, 52.50, 0,    '2025-02-01', 1);

-- Admin User auth
INSERT INTO AdminUser (staff_id, admin_role, password_hash, requires_mfa)
VALUES (1, 'SuperAdmin', 'PLACEHOLDER_HASH_CHANGE_ME', 1);

-- Compliance Rules (Fair Work Australia)
INSERT INTO ComplianceRule (rule_code, rule_name, description, rule_type, threshold_value, threshold_unit, applies_to, effective_from)
VALUES
    ('MAX_WEEKLY_HOURS', 'Max Weekly Hours',      'Maximum ordinary hours per week (Fair Work Act s62)',       'WorkingHours', 38.00, 'hours/week', 'FullTime', '2025-01-01'),
    ('MAX_DAILY_HOURS',  'Max Daily Hours',        'Maximum hours per day before overtime triggers',           'WorkingHours',  7.60, 'hours/day',  'FullTime', '2025-01-01'),
    ('MIN_BREAK_4H',     'Mandatory Break (4h)',    'Minimum break required after 4 consecutive hours',        'Break',        30.00, 'minutes',    'All',      '2025-01-01'),
    ('MIN_REST_BETWEEN', 'Min Rest Between Shifts', 'Minimum rest period between consecutive shifts',          'Rest',         10.00, 'hours',      'All',      '2025-01-01'),
    ('MAX_CASUAL_DAILY', 'Max Casual Daily Hours',  'Maximum casual worker daily hours',                       'WorkingHours', 12.00, 'hours/day',  'Casual',   '2025-01-01');

-- Sample Enrollments
INSERT INTO BiometricEnrollment (staff_id, device_id, enrollment_type, biometric_token, status, enrolled_by)
VALUES
    (2, 1, 'Fingerprint', CONVERT(VARBINARY(512), 'hash_john_fp'),    'Active', 1),
    (2, 2, 'Card',        CONVERT(VARBINARY(512), 'hash_john_card'),  'Active', 1),
    (3, 2, 'Card',        CONVERT(VARBINARY(512), 'hash_sarah_card'), 'Active', 1),
    (4, 1, 'Fingerprint', CONVERT(VARBINARY(512), 'hash_mike_fp'),    'Active', 1),
    (5, 5, 'Face',        CONVERT(VARBINARY(512), 'hash_emma_face'),  'Active', 1);

-- Roster Recurrence (weekly pattern for full-timers)
INSERT INTO RosterRecurrence (staff_id, pattern, recurrence_start, recurrence_end, days_of_week)
VALUES
    (2, 'Weekly', '2026-01-01', NULL, 'Mon,Tue,Wed,Thu,Fri'),
    (5, 'Weekly', '2026-01-01', NULL, 'Mon,Tue,Wed,Thu,Fri');

-- Sample Rosters
INSERT INTO Roster (staff_id, recurrence_id, roster_date, scheduled_start, scheduled_end, created_by)
VALUES
    (2, 1,    '2026-04-02', '06:00', '14:00', 1),
    (3, NULL, '2026-04-02', '08:00', '13:00', 1),
    (4, NULL, '2026-04-02', '06:00', '14:00', 1),
    (5, 2,    '2026-04-02', '07:00', '15:00', 1);

-- Sample Clock Records
INSERT INTO ClockRecord (staff_id, roster_id, clock_in_device_id, clock_out_device_id, clock_in, clock_out, clock_in_method, clock_out_method)
VALUES
    (2, 1, 1, 3, '2026-04-02 05:55:00', '2026-04-02 14:05:00', 'Biometric', 'Biometric'),
    (3, 2, 2, 2, '2026-04-02 07:58:00', '2026-04-02 13:02:00', 'Biometric', 'Biometric'),
    (5, 4, 5, 4, '2026-04-02 06:50:00', '2026-04-02 15:10:00', 'Biometric', 'Biometric');

-- Sample Break Records
INSERT INTO BreakRecord (clock_id, break_start, break_end, break_type, break_note, is_compliant_fair_work)
VALUES
    (1, '2026-04-02 10:00:00', '2026-04-02 10:30:00', 'Lunch',    NULL, 1),
    (2, '2026-04-02 10:30:00', '2026-04-02 10:45:00', 'Rest',     NULL, 1),
    (3, '2026-04-02 10:00:00', '2026-04-02 10:30:00', 'Lunch',    NULL, 1),
    (3, '2026-04-02 13:00:00', '2026-04-02 13:15:00', 'Personal', 'Quick errand', 1);

-- Sample Manual Override
INSERT INTO ClockRecord (staff_id, roster_id, clock_in, clock_in_method, is_manual_override, manual_override_by, manual_reason)
VALUES
    (4, 3, '2026-04-02 06:10:00', 'Manual', 1, 1, 'Fingerprint reader at gate not responding');

-- Sample Exception
INSERT INTO ExceptionReport (staff_id, clock_id, rule_id, exception_type, description, severity)
VALUES
    (4, 4, NULL, 'MissedClockOut', 'Mike Brown clocked in but no clock out recorded for 2026-04-02', 'High');

-- Sample Amendment
INSERT INTO Amendment (clock_id, admin_staff_id, field_changed, old_value, new_value, reason, is_approved, triggered_pay_recalc)
VALUES
    (1, 1, 'clock_out', '2026-04-02 14:05:00', '2026-04-02 14:00:00', 'Corrected to match actual shift end time', 1, 0);

-- Station Onboarding token sample
INSERT INTO StationOnboarding (station_id, token, is_used, linked_at)
VALUES
    (1, 'onboard-token-gate-2025', 1, '2025-01-15 10:00:00');

-- Sample Payslip (fortnightly: 2026-03-30 to 2026-04-12)
INSERT INTO Payslip (staff_id, period_start, period_end, ordinary_hours, overtime_hours, casual_loading_amt, gross_pay, deductions, net_pay, status)
VALUES
    (2, '2026-03-30', '2026-04-12', 76.00, 2.17, 0,     2258.48, 338.77, 1919.71, 'Generated'),
    (3, '2026-03-30', '2026-04-12', 40.00, 0,    0,     1140.00, 171.00,  969.00, 'Generated'),
    (5, '2026-03-30', '2026-04-12', 76.00, 4.33, 0,     2887.33, 433.10, 2454.23, 'Generated');

-- Sample Wage Calculations (linked to payslips above)
INSERT INTO WageCalculation (staff_id, payslip_id, pay_rate_id, period_start, period_end,
    total_standard_hours, total_overtime_hours, total_break_hours,
    applied_standard_rate, applied_overtime_rate, applied_casual_loading,
    gross_standard_pay, gross_overtime_pay, gross_casual_loading, gross_total_pay, status)
VALUES
    (2, 1, 2, '2026-03-30', '2026-04-12', 76.00, 2.17, 5.00, 28.50, 42.75, 0, 2166.00, 92.77, 0, 2258.48, 'Confirmed'),
    (3, 2, 3, '2026-03-30', '2026-04-12', 40.00, 0,    2.50, 28.50, 42.75, 0, 1140.00, 0,     0, 1140.00, 'Confirmed'),
    (5, 3, 5, '2026-03-30', '2026-04-12', 76.00, 4.33, 5.00, 35.00, 52.50, 0, 2660.00, 227.33,0, 2887.33, 'Confirmed');

-- Sample Report generation
INSERT INTO Report (generated_by, report_type, period_start, period_end, export_format)
VALUES
    (1, 'Attendance',    '2026-03-30', '2026-04-12', 'PDF'),
    (1, 'CostAnalysis',  '2026-03-30', '2026-04-12', 'Excel');

-- Sample System Log
INSERT INTO SystemLog (station_id, event_type, severity, message, source_layer)
VALUES
    (1, 'DeviceSync', 'Info', 'Gate Fingerprint Reader synced successfully', 'DeviceBiometric'),
    (2, 'HeartbeatMissed', 'Warning', 'Barn A Card Reader missed 3 consecutive heartbeats', 'DeviceBiometric');
