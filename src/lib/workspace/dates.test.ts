import { describe, expect, it } from "vitest";
import {
  currentDay,
  currentMonth,
  currentWeek,
  inRange,
  lastNDays,
  reportRange,
  yearToDate,
} from "./dates";

describe("workspace date ranges", () => {
  it("reads the calendar day from the workspace clock", () => {
    expect(currentDay("2026-10-13T07:45:00-04:00")).toBe("2026-10-13");
    // A late-evening instant keeps its own local date rather than rolling to UTC.
    expect(currentDay("2026-10-13T23:30:00-04:00")).toBe("2026-10-13");
  });

  it("covers the whole month the clock is in", () => {
    expect(currentMonth("2026-10-13T07:45:00-04:00")).toEqual({
      start: "2026-10-01",
      end: "2026-10-31",
    });
    expect(currentMonth("2026-02-01T09:00:00-05:00")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
    expect(currentMonth("2028-02-10T09:00:00-05:00")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
  });

  it("starts the week on Monday by default", () => {
    // 2026-10-13 is a Tuesday.
    expect(currentWeek("2026-10-13T07:45:00-04:00")).toEqual({
      start: "2026-10-12",
      end: "2026-10-18",
    });
    expect(currentWeek("2026-10-13T07:45:00-04:00", 0)).toEqual({
      start: "2026-10-11",
      end: "2026-10-17",
    });
  });

  it("keeps a week intact across the daylight-saving change", () => {
    // US clocks fall back on 2026-11-01.
    expect(currentWeek("2026-10-31T12:00:00-04:00")).toEqual({
      start: "2026-10-26",
      end: "2026-11-01",
    });
    expect(currentWeek("2026-11-02T12:00:00-05:00")).toEqual({
      start: "2026-11-02",
      end: "2026-11-08",
    });
  });

  it("runs year to date from January first", () => {
    expect(yearToDate("2026-03-04T10:00:00-05:00")).toEqual({
      start: "2026-01-01",
      end: "2026-03-04",
    });
  });

  it("counts the last N days inclusively", () => {
    expect(lastNDays("2026-03-04T10:00:00-05:00", 7)).toEqual({
      start: "2026-02-26",
      end: "2026-03-04",
    });
    expect(lastNDays("2026-01-02T10:00:00-05:00", 7)).toEqual({
      start: "2025-12-27",
      end: "2026-01-02",
    });
  });

  it("maps a report period to its range and treats all as unbounded", () => {
    expect(reportRange("2026-10-13T07:45:00-04:00", "month")?.start).toBe("2026-10-01");
    expect(reportRange("2026-10-13T07:45:00-04:00", "all")).toBeNull();
    expect(inRange("2026-10-13", null)).toBe(true);
    expect(inRange("2026-09-30", currentMonth("2026-10-13T07:45:00-04:00"))).toBe(false);
  });

  it("reads the week report period as the last seven days, not the calendar week", () => {
    // 2026-10-13 is a Tuesday, so the calendar week starts on the 12th and runs
    // past today. The control says "Last 7 days" and must deliver 7-13.
    expect(reportRange("2026-10-13T07:45:00-04:00", "week")).toEqual({
      start: "2026-10-07",
      end: "2026-10-13",
    });
    expect(reportRange("2026-10-13T07:45:00-04:00", "week")).not.toEqual(
      currentWeek("2026-10-13T07:45:00-04:00"),
    );
  });
});
