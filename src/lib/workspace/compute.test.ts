import { describe, expect, it } from "vitest";
import { demoWorkspace } from "./dataset";
import {
  buildMissionControl,
  deriveAttention,
  roleCoveragePercent,
  weeklyCoverage,
} from "./compute";

describe("mission control read model", () => {
  it("counts only unreviewed and open future shifts", () => {
    const summary = buildMissionControl(demoWorkspace);
    expect(summary.activeVolunteers).toBe(77);
    expect(summary.upcomingShifts).toBe(14);
    expect(summary.attentionCount).toBe(3);
    expect(summary.unreadNotifications).toBe(3);
  });

  it("computes role coverage from upcoming role slots", () => {
    expect(roleCoveragePercent(demoWorkspace.shifts, demoWorkspace.demoNow)).toBe(91);
  });

  it("reports weekly seat fill for the Monday-start week", () => {
    const days = weeklyCoverage(demoWorkspace.shifts, demoWorkspace.demoNow);
    expect(days.map((day) => day.percent)).toEqual([100, 92, 100, 83, 76, 62, 90]);
    expect(days.map((day) => day.label)).toEqual([
      "Mon 12",
      "Tue 13",
      "Wed 14",
      "Thu 15",
      "Fri 16",
      "Sat 17",
      "Sun 18",
    ]);
  });

  it("explains the three real gaps in date order", () => {
    const items = deriveAttention(demoWorkspace);
    expect(items.map((item) => item.detail)).toEqual([
      "Driver missing · Sat 9:00 AM",
      "2 spots open · Sat 1:00 PM",
      "Math tutor missing · Sun 2:00 PM",
    ]);
    expect(items[0].severity).toBe("critical");
    expect(items[0].href).toBe("/coordinator/coverage?shift=sh-sat-food");
  });

  it("does not raise a 75 percent seat gap as an alarm", () => {
    const shift = demoWorkspace.shifts.find((entry) => entry.id === "sh-tue-pantry")!;
    expect(shift.confirmed).toBe(3);
    expect(shift.capacity).toBe(4);
    const items = deriveAttention({ ...demoWorkspace, shifts: [shift] });
    expect(items).toEqual([]);
  });
});
