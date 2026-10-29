import { addDays, format, parseISO, startOfWeek } from "date-fns";

/**
 * One place that turns the workspace clock into the periods screens compare
 * against. A screen may format a date however it likes; it may not decide for
 * itself where "this month" or "last week" begins.
 */

export type ReportPeriod = "week" | "month" | "year" | "all";

export interface DateRange {
  /** Inclusive first day, `YYYY-MM-DD`. */
  start: string;
  /** Inclusive last day, `YYYY-MM-DD`. */
  end: string;
}

function day(value: Date): string {
  return format(value, "yyyy-MM-dd");
}

/** The calendar day the workspace clock is on, in the workspace's local offset. */
export function currentDay(now: string): string {
  return day(parseISO(now));
}

/** The month containing the workspace clock. */
export function currentMonth(now: string): DateRange {
  const at = parseISO(now);
  const start = new Date(at.getFullYear(), at.getMonth(), 1);
  const end = new Date(at.getFullYear(), at.getMonth() + 1, 0);
  return { start: day(start), end: day(end) };
}

/** The week containing the workspace clock, respecting the organization's week start. */
export function currentWeek(now: string, weekStartsOn: 0 | 1 = 1): DateRange {
  const start = startOfWeek(parseISO(now), { weekStartsOn });
  return { start: day(start), end: day(addDays(start, 6)) };
}

/** January 1 through the workspace clock. */
export function yearToDate(now: string): DateRange {
  const at = parseISO(now);
  return { start: `${at.getFullYear()}-01-01`, end: day(at) };
}

/** The `dayCount` days ending on the workspace clock. */
export function lastNDays(now: string, dayCount: number): DateRange {
  const end = parseISO(now);
  return { start: day(addDays(end, -(Math.max(1, dayCount) - 1))), end: day(end) };
}

/**
 * The range a report period selects. `all` has no bound of its own; callers
 * treat it as "every stored row".
 */
export function reportRange(now: string, period: ReportPeriod): DateRange | null {
  if (period === "week") return currentWeek(now);
  if (period === "month") return currentMonth(now);
  if (period === "year") return yearToDate(now);
  return null;
}

export function inRange(date: string, range: DateRange | null): boolean {
  if (!range) return true;
  return date >= range.start && date <= range.end;
}
