import { describe, expect, it } from "vitest";
import type { HourRow } from "../../lib/workspace/selectors";
import { buildTrendPoints } from "./CustomReportPage";

function row(date: string, minutes: number): HourRow {
  return {
    id: `${date}-${minutes}`,
    date,
    approvedMinutes: minutes,
    requestedMinutes: minutes,
  } as HourRow;
}

describe("custom report trend", () => {
  it("orders the axis by ISO date and sums rows on the same day", () => {
    const points = buildTrendPoints([
      row("2026-10-10", 60),
      row("2026-10-01", 30),
      row("2026-10-10", 15),
      row("2026-10-05", 45),
    ]);

    expect(points.map((point) => point.value)).toEqual([30, 45, 75]);
  });
});
