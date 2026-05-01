import { computeWorkedHours, type TimeEvent } from './timecalc.js';

export type ExceptionType = 'missing_clock_out' | 'no_break_over_4_hours' | 'unrostered_attempt';

export interface DetectInput {
  staffId: number;
  date: string;
  events: TimeEvent[];
  hasRoster: boolean;
}

export interface DetectedException {
  type: ExceptionType;
  severity: 'low' | 'medium' | 'high';
}

export function detectExceptions(input: DetectInput): DetectedException[] {
  const output: DetectedException[] = [];
  const types = input.events.map((event) => event.eventType);

  if (types.includes('clock_in') && !types.includes('clock_out')) {
    output.push({ type: 'missing_clock_out', severity: 'high' });
  }

  if (types.includes('clock_in') && types.includes('clock_out')) {
    const worked = computeWorkedHours(input.events);
    const hasBreak = types.includes('break_start') && types.includes('break_end');
    if (worked > 4 && !hasBreak) {
      output.push({ type: 'no_break_over_4_hours', severity: 'medium' });
    }
  }

  if (!input.hasRoster && types.includes('clock_in')) {
    output.push({ type: 'unrostered_attempt', severity: 'medium' });
  }

  return output;
}
