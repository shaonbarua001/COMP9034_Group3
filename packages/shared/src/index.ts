export enum ContractType {
  Casual = 'casual',
  PartTime = 'part_time',
  FullTime = 'full_time'
}

export enum IdentityMethodType {
  Card = 'card',
  Face = 'face',
  Fingerprint = 'fingerprint',
  Retinal = 'retinal'
}

export enum TimeEventType {
  ClockIn = 'clock_in',
  ClockOut = 'clock_out',
  BreakStart = 'break_start',
  BreakEnd = 'break_end'
}

export enum ExceptionType {
  MissingClockOut = 'missing_clock_out',
  NoBreakOver4Hours = 'no_break_over_4_hours',
  UnrosteredAttempt = 'unrostered_attempt'
}

export enum PayRunStatus {
  Draft = 'draft',
  Finalized = 'finalized'
}

export enum UserRole {
  Admin = 'admin',
  Staff = 'staff'
}

export interface ClockEventRequest {
  staffId: string;
  stationId?: number;
  eventType: TimeEventType;
  methodType: IdentityMethodType;
  timestamp: string;
  reason?: string;
}

export interface ManualClockRequest extends ClockEventRequest {
  reason: string;
}

export interface TimeAdjustmentRequest {
  timeEventId: number;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
}

export interface RosterEntryDTO {
  staffId: string;
  stationId?: number;
  date: string;
  startTime: string;
  plannedHours: number;
  notes?: string;
}

export interface AttendanceSummaryDTO {
  staffId: string;
  name: string;
  plannedHours: number;
  actualHours: number;
  varianceHours: number;
}

export interface PayRunItemDTO {
  staffId: string;
  hours: number;
  overtimeHours: number;
  basePay: number;
  overtimePay: number;
  deductions: number;
  totalPay: number;
}

export interface PayslipDTO extends PayRunItemDTO {
  name: string;
}

export interface ExceptionDTO {
  id: number;
  type: ExceptionType;
  staffId?: string;
  date: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
}
