export interface TimeEvent {
  eventType: string;
  timestamp: string;
}

const MS_PER_HOUR = 1000 * 60 * 60;

function toMillis(value: string): number {
  return new Date(value).getTime();
}

export function computeWorkedHours(events: TimeEvent[]): number {
  const sorted = [...events].sort((a, b) => toMillis(a.timestamp) - toMillis(b.timestamp));
  let currentClockIn: number | null = null;
  let breakStart: number | null = null;
  let totalMs = 0;

  for (const event of sorted) {
    const ts = toMillis(event.timestamp);
    if (event.eventType === 'clock_in') {
      currentClockIn = ts;
      breakStart = null;
      continue;
    }

    if (event.eventType === 'break_start' && currentClockIn !== null) {
      breakStart = ts;
      continue;
    }

    if (event.eventType === 'break_end' && currentClockIn !== null && breakStart !== null) {
      currentClockIn += ts - breakStart;
      breakStart = null;
      continue;
    }

    if (event.eventType === 'clock_out' && currentClockIn !== null) {
      totalMs += Math.max(0, ts - currentClockIn);
      currentClockIn = null;
      breakStart = null;
    }
  }

  return Number((totalMs / MS_PER_HOUR).toFixed(2));
}

export interface PayrollComputation {
  hours: number;
  overtimeHours: number;
  basePay: number;
  overtimePay: number;
  deductions: number;
  totalPay: number;
}

export function calculatePayroll(
  workedHours: number,
  standardHoursPerWeek: number,
  standardRate: number,
  overtimeRate: number,
  deductions = 0
): PayrollComputation {
  const fortnightStandard = standardHoursPerWeek * 2;
  const normalHours = Math.min(workedHours, fortnightStandard);
  const overtimeHours = Math.max(0, workedHours - fortnightStandard);

  const basePay = Number((normalHours * standardRate).toFixed(2));
  const overtimePay = Number((overtimeHours * overtimeRate).toFixed(2));
  const totalPay = Number((basePay + overtimePay - deductions).toFixed(2));

  return {
    hours: Number(workedHours.toFixed(2)),
    overtimeHours: Number(overtimeHours.toFixed(2)),
    basePay,
    overtimePay,
    deductions: Number(deductions.toFixed(2)),
    totalPay
  };
}
