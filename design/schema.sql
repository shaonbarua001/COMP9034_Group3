-- ============================================================
-- Farm Time Management System - Database Schema (v2)
-- Target: SQL Server (Windows Server 2025, on-prem)
-- Compatible with: PostgreSQL (minor type adjustments needed)
-- ============================================================

-- ============================================================
-- 1. STAFF (Employee Master)
-- PID: "Staff ID Number, Name, Type of Contract, Role, Pay rate"
-- ============================================================
CREATE TABLE Staff (
    staff_id            INT IDENTITY(1,1) PRIMARY KEY,
    first_name          NVARCHAR(50)    NOT NULL,
    last_name           NVARCHAR(50)    NOT NULL,
    email               NVARCHAR(100)   NULL,
    phone               NVARCHAR(20)    NULL,
    employment_type     NVARCHAR(20)    NOT NULL
        CONSTRAINT CK_Staff_EmpType CHECK (employment_type IN ('Casual', 'FullTime', 'PartTime')),
    role                NVARCHAR(20)    NOT NULL DEFAULT 'Worker'
        CONSTRAINT CK_Staff_Role CHECK (role IN ('Worker', 'Supervisor', 'Admin')),
    pay_rate_standard   DECIMAL(10,2)   NOT NULL,
    pay_rate_overtime   DECIMAL(10,2)   NOT NULL,
    standard_weekly_hours DECIMAL(5,2)  NOT NULL DEFAULT 38.00,  -- Fair Work: 38h/week for full-time
    hire_date           DATE            NOT NULL,
    termination_date    DATE            NULL,
    is_active           BIT             NOT NULL DEFAULT 1,
    created_at          DATETIME2       NOT NULL DEFAULT GETDATE(),
    updated_at          DATETIME2       NOT NULL DEFAULT GETDATE()
);

CREATE INDEX IX_Staff_Active  ON Staff (is_active) WHERE is_active = 1;
CREATE INDEX IX_Staff_EmpType ON Staff (employment_type);


-- ============================================================
-- 2. TIME_STATION (Clock-in/out Locations)
-- PID: "Farm Staff - clock in/out on any time station"
-- PID: "clock in would be a different station to clock out"
-- ============================================================
CREATE TABLE TimeStation (
    station_id      INT IDENTITY(1,1) PRIMARY KEY,
    station_name    NVARCHAR(100)   NOT NULL,
    location        NVARCHAR(200)   NOT NULL,
    description     NVARCHAR(500)   NULL,
    is_active       BIT             NOT NULL DEFAULT 1,
    created_at      DATETIME2       NOT NULL DEFAULT GETDATE()
);


-- ============================================================
-- 3. BIOMETRIC_DEVICE (Recognition Devices per Station)
-- PID: "Name, Location, Type: Card/Face/Fingerprint/Retinal Scan"
-- ============================================================
CREATE TABLE BiometricDevice (
    device_id       INT IDENTITY(1,1) PRIMARY KEY,
    station_id      INT             NOT NULL,
    device_name     NVARCHAR(100)   NOT NULL,
    device_type     NVARCHAR(20)    NOT NULL
        CONSTRAINT CK_Device_Type CHECK (device_type IN ('Card', 'Face', 'Fingerprint', 'Retinal')),
    is_online       BIT             NOT NULL DEFAULT 1,
    is_active       BIT             NOT NULL DEFAULT 1,
    last_sync_at    DATETIME2       NULL,
    created_at      DATETIME2       NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Device_Station FOREIGN KEY (station_id) REFERENCES TimeStation(station_id)
);

CREATE INDEX IX_Device_Station ON BiometricDevice (station_id);


-- ============================================================
-- 4. BIOMETRIC_ENROLLMENT (Staff Biometric/Card Registration)
-- PID: "Register card/biometric to staff record"
-- PID: "New staff, Re-register, Lost card, Injury to hands/fingers"
-- ============================================================
CREATE TABLE BiometricEnrollment (
    enrollment_id   INT IDENTITY(1,1) PRIMARY KEY,
    staff_id        INT             NOT NULL,
    enrollment_type NVARCHAR(20)    NOT NULL
        CONSTRAINT CK_Enrollment_Type CHECK (enrollment_type IN ('Card', 'Face', 'Fingerprint', 'Retinal')),
    biometric_token VARBINARY(512)  NOT NULL,  -- encrypted hash only, never raw biometric data
    status          NVARCHAR(20)    NOT NULL DEFAULT 'Active'
        CONSTRAINT CK_Enrollment_Status CHECK (status IN ('Active', 'Revoked', 'Lost', 'Injured')),
    revoke_reason   NVARCHAR(500)   NULL,
    enrolled_by     INT             NOT NULL,  -- Admin who performed enrollment
    enrolled_at     DATETIME2       NOT NULL DEFAULT GETDATE(),
    revoked_at      DATETIME2       NULL,

    CONSTRAINT FK_Enrollment_Staff      FOREIGN KEY (staff_id)    REFERENCES Staff(staff_id),
    CONSTRAINT FK_Enrollment_EnrolledBy FOREIGN KEY (enrolled_by) REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Enrollment_Staff  ON BiometricEnrollment (staff_id);
CREATE INDEX IX_Enrollment_Active ON BiometricEnrollment (staff_id, status) WHERE status = 'Active';


-- ============================================================
-- 5. ROSTER (Work Schedule)
-- PID: "Rostering information: Staff for date, start time and number of hours"
-- ============================================================
CREATE TABLE Roster (
    roster_id       INT IDENTITY(1,1) PRIMARY KEY,
    staff_id        INT             NOT NULL,
    roster_date     DATE            NOT NULL,
    scheduled_start TIME            NOT NULL,
    scheduled_end   TIME            NOT NULL,
    scheduled_hours AS CAST(DATEDIFF(MINUTE, scheduled_start, scheduled_end) / 60.0 AS DECIMAL(5,2)) PERSISTED,
    status          NVARCHAR(20)    NOT NULL DEFAULT 'Scheduled'
        CONSTRAINT CK_Roster_Status CHECK (status IN ('Scheduled', 'Cancelled', 'Modified')),
    created_by      INT             NOT NULL,
    created_at      DATETIME2       NOT NULL DEFAULT GETDATE(),
    updated_at      DATETIME2       NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Roster_Staff     FOREIGN KEY (staff_id)   REFERENCES Staff(staff_id),
    CONSTRAINT FK_Roster_CreatedBy FOREIGN KEY (created_by) REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Roster_StaffDate ON Roster (staff_id, roster_date);
CREATE INDEX IX_Roster_Date      ON Roster (roster_date);


-- ============================================================
-- 6. CLOCK_RECORD (Clock-in/out Records)
-- PID: "clock in would be a different station to clock out"
-- PID: "admin staff to clock in/out staff - biometrics not working or emergency"
-- PID: "non-cloud, internet intermittently unavailable"
-- ============================================================
CREATE TABLE ClockRecord (
    clock_id            INT IDENTITY(1,1) PRIMARY KEY,
    staff_id            INT             NOT NULL,
    roster_id           INT             NULL,
    clock_in_device_id  INT             NULL,   -- NULL if manual entry
    clock_out_device_id INT             NULL,   -- can differ from clock_in device
    clock_in            DATETIME2       NOT NULL,
    clock_out           DATETIME2       NULL,
    clock_in_method     NVARCHAR(20)    NOT NULL DEFAULT 'Biometric'
        CONSTRAINT CK_Clock_InMethod CHECK (clock_in_method IN ('Biometric', 'Manual')),
    clock_out_method    NVARCHAR(20)    NULL
        CONSTRAINT CK_Clock_OutMethod CHECK (clock_out_method IN ('Biometric', 'Manual', 'AutoMissed')),
    is_manual_override  BIT             NOT NULL DEFAULT 0,
    manual_override_by  INT             NULL,
    manual_reason       NVARCHAR(500)   NULL,
    is_synced           BIT             NOT NULL DEFAULT 1,  -- 0 = offline pending sync
    synced_at           DATETIME2       NULL,
    created_at          DATETIME2       NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Clock_Staff       FOREIGN KEY (staff_id)            REFERENCES Staff(staff_id),
    CONSTRAINT FK_Clock_Roster      FOREIGN KEY (roster_id)           REFERENCES Roster(roster_id),
    CONSTRAINT FK_Clock_InDevice    FOREIGN KEY (clock_in_device_id)  REFERENCES BiometricDevice(device_id),
    CONSTRAINT FK_Clock_OutDevice   FOREIGN KEY (clock_out_device_id) REFERENCES BiometricDevice(device_id),
    CONSTRAINT FK_Clock_OverrideBy  FOREIGN KEY (manual_override_by)  REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Clock_StaffDate ON ClockRecord (staff_id, clock_in);
CREATE INDEX IX_Clock_Unsynced  ON ClockRecord (is_synced) WHERE is_synced = 0;
CREATE INDEX IX_Clock_Roster    ON ClockRecord (roster_id);


-- ============================================================
-- 7. BREAK_RECORD (Break Logs)
-- PID: "Log breaks with reason"
-- PID: "IoT device reader then some sort of panel for choices"
-- ============================================================
CREATE TABLE BreakRecord (
    break_id            INT IDENTITY(1,1) PRIMARY KEY,
    clock_id            INT             NOT NULL,
    break_start         DATETIME2       NOT NULL,
    break_end           DATETIME2       NULL,
    break_type          NVARCHAR(20)    NOT NULL DEFAULT 'Lunch'
        CONSTRAINT CK_Break_Type CHECK (break_type IN ('Lunch', 'Rest', 'Personal', 'Medical', 'Other')),
    break_note          NVARCHAR(500)   NULL,  -- free-text reason detail
    break_duration_min  AS CASE
        WHEN break_end IS NOT NULL
        THEN CAST(DATEDIFF(MINUTE, break_start, break_end) AS DECIMAL(5,1))
        ELSE NULL
    END,

    CONSTRAINT FK_Break_Clock FOREIGN KEY (clock_id) REFERENCES ClockRecord(clock_id)
);

CREATE INDEX IX_Break_Clock ON BreakRecord (clock_id);


-- ============================================================
-- 8. COMPLIANCE_RULE (Fair Work Legal Thresholds)
-- PID: "Legal Responsibility: Breaks/Weekly hours etc."
-- Reference: fairwork.gov.au
-- ============================================================
CREATE TABLE ComplianceRule (
    rule_id         INT IDENTITY(1,1) PRIMARY KEY,
    rule_code       NVARCHAR(50)    NOT NULL UNIQUE,
    description     NVARCHAR(500)   NOT NULL,
    rule_type       NVARCHAR(20)    NOT NULL
        CONSTRAINT CK_Rule_Type CHECK (rule_type IN ('WorkingHours', 'Break', 'Overtime', 'Rest')),
    threshold_value DECIMAL(10,2)   NOT NULL,
    threshold_unit  NVARCHAR(20)    NOT NULL
        CONSTRAINT CK_Rule_Unit CHECK (threshold_unit IN ('hours/week', 'hours/day', 'hours', 'minutes')),
    applies_to      NVARCHAR(20)    NOT NULL DEFAULT 'All'
        CONSTRAINT CK_Rule_AppliesTo CHECK (applies_to IN ('All', 'FullTime', 'PartTime', 'Casual')),
    is_active       BIT             NOT NULL DEFAULT 1,
    effective_from  DATE            NOT NULL,
    effective_to    DATE            NULL  -- NULL = currently active
);


-- ============================================================
-- 9. PAYSLIP (Fortnightly Pay Slips)
-- PID: "fortnightly pay slips"
-- ============================================================
CREATE TABLE Payslip (
    payslip_id      INT IDENTITY(1,1) PRIMARY KEY,
    staff_id        INT             NOT NULL,
    period_start    DATE            NOT NULL,
    period_end      DATE            NOT NULL,
    gross_pay       DECIMAL(12,2)   NOT NULL,
    deductions      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    net_pay         DECIMAL(12,2)   NOT NULL,
    status          NVARCHAR(20)    NOT NULL DEFAULT 'Generated'
        CONSTRAINT CK_Payslip_Status CHECK (status IN ('Generated', 'Reviewed', 'Distributed')),
    generated_at    DATETIME2       NOT NULL DEFAULT GETDATE(),
    distributed_at  DATETIME2       NULL,

    CONSTRAINT FK_Payslip_Staff FOREIGN KEY (staff_id) REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Payslip_StaffPeriod ON Payslip (staff_id, period_start);


-- ============================================================
-- 10. WAGE_CALCULATION (Pay Calculation with Rate Snapshots)
-- PID: "time information reports -> pay period"
-- PID: "Standard Rate, Overtime Rate"
-- ============================================================
CREATE TABLE WageCalculation (
    wage_id                 INT IDENTITY(1,1) PRIMARY KEY,
    staff_id                INT             NOT NULL,
    payslip_id              INT             NULL,
    period_start            DATE            NOT NULL,
    period_end              DATE            NOT NULL,
    total_standard_hours    DECIMAL(8,2)    NOT NULL DEFAULT 0,
    total_overtime_hours    DECIMAL(8,2)    NOT NULL DEFAULT 0,
    total_break_hours       DECIMAL(8,2)    NOT NULL DEFAULT 0,
    applied_standard_rate   DECIMAL(10,2)   NOT NULL,  -- snapshot of rate at calculation time
    applied_overtime_rate   DECIMAL(10,2)   NOT NULL,  -- snapshot of rate at calculation time
    gross_standard_pay      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    gross_overtime_pay      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    gross_total_pay         DECIMAL(12,2)   NOT NULL DEFAULT 0,
    status                  NVARCHAR(20)    NOT NULL DEFAULT 'Draft'
        CONSTRAINT CK_Wage_Status CHECK (status IN ('Draft', 'Confirmed', 'Paid')),
    calculated_at           DATETIME2       NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Wage_Staff   FOREIGN KEY (staff_id)   REFERENCES Staff(staff_id),
    CONSTRAINT FK_Wage_Payslip FOREIGN KEY (payslip_id) REFERENCES Payslip(payslip_id)
);

CREATE INDEX IX_Wage_StaffPeriod ON WageCalculation (staff_id, period_start);


-- ============================================================
-- 11. EXCEPTION_REPORT (Flagged Exceptions)
-- PID: "daily clocked in not clocked out"
-- PID: "more than 4 hours without break"
-- PID: "attempt when not rostered"
-- ============================================================
CREATE TABLE ExceptionReport (
    exception_id        INT IDENTITY(1,1) PRIMARY KEY,
    staff_id            INT             NOT NULL,
    clock_id            INT             NULL,
    roster_id           INT             NULL,
    rule_id             INT             NULL,   -- which compliance rule was violated
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
    resolved_by         INT             NULL,
    resolution_note     NVARCHAR(1000)  NULL,
    detected_at         DATETIME2       NOT NULL DEFAULT GETDATE(),
    resolved_at         DATETIME2       NULL,

    CONSTRAINT FK_Exception_Staff    FOREIGN KEY (staff_id)    REFERENCES Staff(staff_id),
    CONSTRAINT FK_Exception_Clock    FOREIGN KEY (clock_id)    REFERENCES ClockRecord(clock_id),
    CONSTRAINT FK_Exception_Roster   FOREIGN KEY (roster_id)   REFERENCES Roster(roster_id),
    CONSTRAINT FK_Exception_Rule     FOREIGN KEY (rule_id)     REFERENCES ComplianceRule(rule_id),
    CONSTRAINT FK_Exception_Resolver FOREIGN KEY (resolved_by) REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Exception_Open  ON ExceptionReport (resolution_status) WHERE resolution_status = 'Open';
CREATE INDEX IX_Exception_Staff ON ExceptionReport (staff_id);
CREATE INDEX IX_Exception_Type  ON ExceptionReport (exception_type);


-- ============================================================
-- 12. AUDIT_LOG (Change Audit Trail)
-- PID: "Amend information on the time clock - with auditing and reason"
-- ============================================================
CREATE TABLE AuditLog (
    audit_id        INT IDENTITY(1,1) PRIMARY KEY,
    table_name      NVARCHAR(100)   NOT NULL,
    record_id       INT             NOT NULL,
    action          NVARCHAR(10)    NOT NULL
        CONSTRAINT CK_Audit_Action CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    performed_by    INT             NOT NULL,
    change_reason   NVARCHAR(500)   NOT NULL,   -- mandatory for all modifications
    old_values      NVARCHAR(MAX)   NULL,        -- JSON snapshot before change
    new_values      NVARCHAR(MAX)   NULL,        -- JSON snapshot after change
    performed_at    DATETIME2       NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Audit_Staff FOREIGN KEY (performed_by) REFERENCES Staff(staff_id)
);

CREATE INDEX IX_Audit_Table    ON AuditLog (table_name, record_id);
CREATE INDEX IX_Audit_DateTime ON AuditLog (performed_at);


-- ============================================================
-- VIEWS (Reporting & Analysis)
-- ============================================================

-- Management Cost Analysis
-- PID: "management information - cost analysis"
GO
CREATE VIEW vw_CostAnalysis AS
SELECT
    w.period_start,
    w.period_end,
    s.staff_id,
    s.first_name + ' ' + s.last_name AS staff_name,
    s.employment_type,
    s.role,
    w.total_standard_hours,
    w.total_overtime_hours,
    w.total_break_hours,
    w.gross_standard_pay,
    w.gross_overtime_pay,
    w.gross_total_pay,
    w.applied_standard_rate,
    w.applied_overtime_rate
FROM WageCalculation w
JOIN Staff s ON w.staff_id = s.staff_id;
GO

-- Attendance Summary with Station Info
-- PID: "time information reports attendance/number of hours for a given time/pay period"
CREATE VIEW vw_AttendanceSummary AS
SELECT
    c.staff_id,
    s.first_name + ' ' + s.last_name AS staff_name,
    CAST(c.clock_in AS DATE) AS work_date,
    c.clock_in,
    c.clock_out,
    CASE
        WHEN c.clock_out IS NOT NULL
        THEN CAST(DATEDIFF(MINUTE, c.clock_in, c.clock_out) / 60.0 AS DECIMAL(5,2))
        ELSE NULL
    END AS worked_hours,
    c.clock_in_method,
    c.clock_out_method,
    c.is_manual_override,
    r.scheduled_start,
    r.scheduled_end,
    r.scheduled_hours,
    din.device_name  AS clock_in_device,
    dout.device_name AS clock_out_device,
    sin.station_name AS clock_in_station,
    sout.station_name AS clock_out_station
FROM ClockRecord c
JOIN Staff s ON c.staff_id = s.staff_id
LEFT JOIN Roster r ON c.roster_id = r.roster_id
LEFT JOIN BiometricDevice din  ON c.clock_in_device_id  = din.device_id
LEFT JOIN TimeStation sin      ON din.station_id         = sin.station_id
LEFT JOIN BiometricDevice dout ON c.clock_out_device_id  = dout.device_id
LEFT JOIN TimeStation sout     ON dout.station_id        = sout.station_id;
GO

-- Open Exceptions Dashboard
CREATE VIEW vw_OpenExceptions AS
SELECT
    e.exception_id,
    e.exception_type,
    e.severity,
    e.description,
    e.detected_at,
    s.first_name + ' ' + s.last_name AS staff_name,
    cr.rule_code,
    cr.description AS rule_description
FROM ExceptionReport e
JOIN Staff s ON e.staff_id = s.staff_id
LEFT JOIN ComplianceRule cr ON e.rule_id = cr.rule_id
WHERE e.resolution_status = 'Open';
GO


-- ============================================================
-- SEED DATA (Demo / Testing)
-- ============================================================

-- Time Stations
INSERT INTO TimeStation (station_name, location, description)
VALUES
    ('Main Gate',     'Farm Entrance',      'Primary entry point for all staff'),
    ('Barn A',        'Barn A - East Wing', 'Livestock area station'),
    ('Packing Shed',  'Packing Shed',       'Produce processing area'),
    ('Admin Office',  'Main Building',      'Office staff station');

-- Biometric Devices (linked to stations)
INSERT INTO BiometricDevice (station_id, device_name, device_type)
VALUES
    (1, 'Gate Fingerprint Reader',    'Fingerprint'),
    (1, 'Gate Card Reader',           'Card'),
    (2, 'Barn A Card Reader',         'Card'),
    (3, 'Shed Fingerprint Reader',    'Fingerprint'),
    (4, 'Office Face Scanner',        'Face');

-- Admin user
INSERT INTO Staff (first_name, last_name, email, employment_type, role, pay_rate_standard, pay_rate_overtime, standard_weekly_hours, hire_date)
VALUES ('Farm', 'Admin', 'admin@farmtime.local', 'FullTime', 'Admin', 45.00, 67.50, 38.00, '2025-01-01');

-- Workers
INSERT INTO Staff (first_name, last_name, email, employment_type, role, pay_rate_standard, pay_rate_overtime, standard_weekly_hours, hire_date)
VALUES
    ('John',  'Smith',   'john@farmtime.local',  'FullTime',  'Worker',     28.50, 42.75, 38.00, '2025-03-01'),
    ('Sarah', 'Jones',   'sarah@farmtime.local', 'PartTime',  'Worker',     28.50, 42.75, 20.00, '2025-04-15'),
    ('Mike',  'Brown',   'mike@farmtime.local',  'Casual',    'Worker',     32.00, 48.00,  0.00, '2025-06-01'),
    ('Emma',  'Wilson',  'emma@farmtime.local',  'FullTime',  'Supervisor', 35.00, 52.50, 38.00, '2025-02-01');

-- Compliance Rules (Fair Work Australia)
INSERT INTO ComplianceRule (rule_code, description, rule_type, threshold_value, threshold_unit, applies_to, effective_from)
VALUES
    ('MAX_WEEKLY_HOURS',  'Maximum ordinary hours per week (Fair Work Act s62)',        'WorkingHours', 38.00,  'hours/week', 'FullTime',  '2025-01-01'),
    ('MAX_DAILY_HOURS',   'Maximum hours per day before overtime triggers',             'WorkingHours', 7.60,   'hours/day',  'FullTime',  '2025-01-01'),
    ('MIN_BREAK_4H',      'Minimum break required after 4 consecutive hours of work',   'Break',        30.00,  'minutes',    'All',       '2025-01-01'),
    ('MIN_REST_BETWEEN',  'Minimum rest period between consecutive shifts',             'Rest',         10.00,  'hours',      'All',       '2025-01-01'),
    ('MAX_CASUAL_DAILY',  'Maximum casual worker daily hours',                          'WorkingHours', 12.00,  'hours/day',  'Casual',    '2025-01-01');

-- Sample Enrollments
INSERT INTO BiometricEnrollment (staff_id, enrollment_type, biometric_token, status, enrolled_by)
VALUES
    (2, 'Fingerprint', CONVERT(VARBINARY(512), 'hash_john_fp'),    'Active', 1),
    (2, 'Card',        CONVERT(VARBINARY(512), 'hash_john_card'),  'Active', 1),
    (3, 'Card',        CONVERT(VARBINARY(512), 'hash_sarah_card'), 'Active', 1),
    (4, 'Fingerprint', CONVERT(VARBINARY(512), 'hash_mike_fp'),    'Active', 1),
    (5, 'Face',        CONVERT(VARBINARY(512), 'hash_emma_face'),  'Active', 1);

-- Sample Rosters
INSERT INTO Roster (staff_id, roster_date, scheduled_start, scheduled_end, created_by)
VALUES
    (2, '2026-04-02', '06:00', '14:00', 1),
    (3, '2026-04-02', '08:00', '13:00', 1),
    (4, '2026-04-02', '06:00', '14:00', 1),
    (5, '2026-04-02', '07:00', '15:00', 1);

-- Sample Clock Records (different in/out stations)
INSERT INTO ClockRecord (staff_id, roster_id, clock_in_device_id, clock_out_device_id, clock_in, clock_out, clock_in_method, clock_out_method)
VALUES
    (2, 1, 1, 3, '2026-04-02 05:55:00', '2026-04-02 14:05:00', 'Biometric', 'Biometric'),
    (3, 2, 2, 2, '2026-04-02 07:58:00', '2026-04-02 13:02:00', 'Biometric', 'Biometric'),
    (5, 4, 5, 4, '2026-04-02 06:50:00', '2026-04-02 15:10:00', 'Biometric', 'Biometric');

-- Sample Break Records
INSERT INTO BreakRecord (clock_id, break_start, break_end, break_type, break_note)
VALUES
    (1, '2026-04-02 10:00:00', '2026-04-02 10:30:00', 'Lunch',    NULL),
    (2, '2026-04-02 10:30:00', '2026-04-02 10:45:00', 'Rest',     NULL),
    (3, '2026-04-02 10:00:00', '2026-04-02 10:30:00', 'Lunch',    NULL),
    (3, '2026-04-02 13:00:00', '2026-04-02 13:15:00', 'Personal', 'Quick errand');

-- Sample Manual Override (admin clocks in Mike who forgot badge)
INSERT INTO ClockRecord (staff_id, roster_id, clock_in, clock_in_method, is_manual_override, manual_override_by, manual_reason)
VALUES
    (4, 3, '2026-04-02 06:10:00', 'Manual', 1, 1, 'Fingerprint reader at gate not responding');

-- Sample Exception
INSERT INTO ExceptionReport (staff_id, clock_id, rule_id, exception_type, description, severity)
VALUES
    (4, 4, NULL, 'MissedClockOut', 'Mike Brown clocked in but no clock out recorded for 2026-04-02', 'High');
