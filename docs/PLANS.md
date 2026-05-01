## Farming Time Management PoC Plan (MacBook Local, Monorepo)

### Summary
Build an offline-capable PoC with a monorepo split: `Next.js` frontend + `Express` API + local `Supabase` (native processes, no Docker).  
Scope is full core workflow: admin setup, rostering, station clock in/out, break logging, attendance/time reporting, fortnightly pay runs, payslip preview, and exception reporting.  
Identity is simulated at station UI via method buttons (`Card/Face/Fingerprint/Retinal`) plus staff lookup.

### Implementation Changes
- Monorepo structure:
  - `apps/web` (Next.js): Admin portal, staff portal, station kiosk UI.
  - `apps/api` (Express + TypeScript): business logic, payroll engine, audit/event APIs.
  - `packages/shared` (types/schemas): shared DTOs, enums, validation contracts.
- Core domain model (Postgres):
  - `staff` (staffId, name, contractType, standardHours, role, standardRate, overtimeRate, active).
  - `stations` (name, location, methodType).
  - `staff_identity_methods` (staffId, methodType, externalRef/status, enrolledAt) for simulated registration.
  - `rosters` (staffId, date, startTime, plannedHours).
  - `time_events` (staffId, stationId, eventType in/out/break_start/break_end, methodType, timestamp, reason).
  - `time_adjustments` (before/after values, reason, adjustedBy, adjustedAt) for audited amendments.
  - `pay_periods` (startDate, endDate, status).
  - `pay_runs` + `pay_run_items` (hours, overtimeHours, basePay, overtimePay, deductions, totalPay).
  - `exceptions` (type, staffId, date, severity, resolvedBy, resolvedAt, notes).
  - `audit_logs` (actor, action, entity, entityId, payload, timestamp).
- API surface (Express, versioned under `/api/v1`):
  - Staff/station setup: CRUD + identity method register/re-register/lost/injury status updates.
  - Roster APIs: create/update/list by date range.
  - Station APIs: submit clock/break events from any station; admin manual clock action with mandatory reason.
  - Attendance/reporting APIs: from/to time summaries, roster-vs-actual variance.
  - Payroll APIs: generate fortnightly run, recalculate, finalize, list payslip data.
  - Exception APIs: daily missing clock-out, >4h without break, unrostered attempt.
- Business rules (locked):
  - Payroll: deterministic rule set: standard hours at `standardRate`, excess at `overtimeRate`.
  - Compliance: do not block actions; always log and surface exceptions.
  - Roles/auth: two roles (`admin`, `staff`) with route/API guards.
- UI modules (Next.js):
  - Admin: staff management, station management, rostering, amendments (with reason), reports, pay runs.
  - Staff: own roster view and own clock history.
  - Station kiosk: method button select + staff lookup + action (in/out/break start/end).
- Output/export:
  - CSV export for attendance/pay reports.
  - On-screen printable payslip preview (browser print-to-PDF compatible).
- Security/baseline NFR for PoC:
  - Password auth with hashed passwords and role claims.
  - Server-side validation on all write APIs.
  - Full audit trail for manual overrides and amendments.
  - Local-only config and secrets via `.env` (no cloud dependency).

### Frontend Requirements (Authoritative)
This section is authoritative for frontend delivery and is derived from `docs/DESIGN.md` and `docs/frontend/*/code.html`.

#### Global UX/Design Constraints
- Typography and readability:
  - Use `Public Sans` consistently.
  - Maintain high-contrast text/background combinations suitable for field and kiosk use.
- Layout and visual structure:
  - Enforce the no-line rule for sectioning: do not rely on 1px divider borders for primary grouping.
  - Use tonal layering and spacing for separation, with surface hierarchy:
    - Base canvas: `surface`
    - Section grouping: `surface-container-low`
    - High-focus interaction cards: `surface-container-lowest`
- Interaction styling:
  - Primary actions must use gradient treatment (`primary` -> `primary_container`).
  - Floating alerts/overlays should use glass treatment (`surface-variant` with opacity + blur).
  - Favor tonal depth and soft elevation over heavy border-driven segmentation.
- Accessibility and ergonomics:
  - Interactive targets for kiosk/field-critical controls must be at least 48px.
  - Preserve readability for high-glare and low-light operating conditions.

#### Shared Frontend Shell Requirements
- All major modules must provide a shared shell with:
  - Left navigation entries for Dashboard, Staff, Roster, Clocking Station, and Payroll/Reports.
  - Top-level search input and notification/help affordances.
  - Operator/admin profile context in the header.
- Color tokens and interactive states must align with the shared design-system token set, not per-page ad hoc colors.

#### Module-Specific Functional UI Requirements
- Admin Dashboard:
  - Daily operations KPI tiles and operational summary state.
  - Live shift feed with shift status chips.
  - Pending exception panel with per-item resolve/edit actions and bulk resolve action.
  - Quick actions for add staff, generate pay run, update roster, and compliance reporting.
- Staff Management:
  - Staff directory table with employee ID, role, contract type, rates, and identity/biometric status.
  - Onboard-new-staff action.
  - Pay-rate edit and save flow with rate history access.
  - Identity registration/status actions (registered, smartcard active, register card, pending biometric).
- Roster Management:
  - Day/week/fortnight toggle controls.
  - Calendar-style roster grid by staff and day, with visible shift assignment cells.
  - Quick-add staff row and click-to-assign shift entry behavior.
  - Operational insight panel plus recommendation action to apply roster optimization suggestions.
- Clocking Station:
  - High-contrast primary clock-in and clock-out controls.
  - Break logging options including tea break, lunch, and safety check.
  - Scanner-ready identity prompt/status area.
  - Recent terminal activity feed showing live status/events.
  - Contextual weather/hydration alert overlay.
- Reporting and Payroll:
  - Pay-period date range inputs.
  - Generate payslips action.
  - Time information and pay information summary metrics.
  - Exception report table with resolve workflow per exception item.

#### Frontend Acceptance Criteria
- The five required module screens exist and expose the listed controls and states.
- Design behavior from `docs/DESIGN.md` is reflected in implementation:
  - Public Sans typography
  - Tonal layout layering
  - Gradient primary action treatment
  - Touch target minimums for kiosk-critical controls
- Core UI actions are wired to existing plan API/event contracts:
  - Clock events
  - Roster updates
  - Pay-run generation
  - Exception resolution
  - Identity registration/status updates
- Desktop and mobile layouts are operationally usable and responsive.

### Public Interfaces/Types
- Shared enums: `ContractType`, `IdentityMethodType`, `TimeEventType`, `ExceptionType`, `PayRunStatus`, `UserRole`.
- Core DTOs:
  - `ClockEventRequest`, `ManualClockRequest`, `TimeAdjustmentRequest`.
  - `RosterEntryDTO`, `AttendanceSummaryDTO`, `PayRunItemDTO`, `PayslipDTO`, `ExceptionDTO`.
- API contract guarantees:
  - All write endpoints return created/updated entity + audit reference id.
  - Reporting endpoints accept explicit `from` and `to` dates (ISO format).
  - Pay run generation requires pay period boundaries and returns deterministic calculation breakdown.
- Frontend contract notes:
  - Frontend modules are required deliverables, not optional visual mockups.
  - Module actions must map to the existing API contracts defined above; no separate API family is introduced by frontend scope.
  - A shared tokenized theme layer is required so design constraints are enforceable consistently across modules.

### Test Plan
- Unit tests:
  - Payroll calculator (standard vs overtime boundaries, break deductions config behavior).
  - Exception detector (>4h no break, unrostered attempts, missing clock-out).
  - Audit logger for amendments/manual actions.
- Integration tests:
  - End-to-end flow: roster -> clock in/out -> attendance summary -> pay run -> payslip preview data.
  - Admin manual clock path with required reason and audit persistence.
  - Cross-station flow: clock in at Station A, out at Station B.
- Frontend E2E checks:
  - Dashboard exception handling and quick-action navigation.
  - Staff onboarding plus biometric status transition.
  - Roster assignment/edit interaction in weekly and fortnight views.
  - Clock in/out plus break log plus activity feed update.
  - Payroll date range selection plus payslip generation plus exception resolve path.
- Role/access tests:
  - Staff cannot access admin setup/report/payrun endpoints.
  - Admin can view/edit all operational data.
- Output tests:
  - CSV generation schema checks.
  - Payslip preview rendering snapshot for key fields.
- Visual QA checks:
  - No forbidden border-line sectioning for core layout grouping.
  - Gradient primary actions, tonal surfaces, and glass overlays render as specified.
  - Kiosk touch-target and contrast requirements are met.
- Acceptance demo scenarios:
  - Lost card / re-registration simulated path.
  - Emergency admin clock-out.
  - Fortnight pay run with at least one overtime and one exception case.

### Assumptions and Defaults
- Workspace is currently empty; implementation begins with full scaffold.
- Local Postgres is already available or will be installed on the MacBook.
- No real biometric SDK/device integration in PoC; identity method is simulated in UI and stored as event metadata.
- Legal checks are surfaced as exceptions (reporting + dashboard), not enforced as hard runtime blocks.
- Print-ready payslip preview is sufficient for PoC; generated binary PDF files are not required in v1.
- `docs/frontend/*/code.html` are requirement references for information architecture and behavior, not pixel-perfect locked mockups.
- Existing backend/API scope remains valid; this revision tightens frontend delivery expectations and acceptance evidence.
