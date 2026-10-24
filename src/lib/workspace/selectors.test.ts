import { describe, expect, it } from "vitest";
import type { SessionSnapshot } from "../../types/domain";
import {
  DEMO_EVENT_SHIFT_ID,
  currentVolunteer,
  getApplications,
  getHoursSummary,
  getLiveEvent,
  getRoster,
  getUpcomingForVolunteer,
  getWaitlist,
  rosterCounts,
} from "./selectors";
import { demoWorkspace } from "./dataset";
import { createDefaultSnapshot } from "./previewRepository";

const maya = currentVolunteer();
const base = createDefaultSnapshot();

describe("shared read model consistency", () => {
  it("uses the curated Maya ledger once and totals 18.5 hours", () => {
    const summary = getHoursSummary(maya.id, base);
    expect(summary.totalMinutes).toBe(1110);
    expect(summary.verifiedMinutes).toBe(570);
    expect(summary.pendingMinutes).toBe(540);
    expect(new Set(getUpcomingForVolunteer(maya.id, base).map((row) => row.shift.id)).size).toBe(2);
  });

  it("only marks demo-day arrivals as checked in once the check-in window opens", () => {
    const event = getLiveEvent(base);
    expect(event.roster.length).toBe(3);
    const counts = rosterCounts(event.roster);
    expect(counts.checkedIn).toBe(2);
    expect(counts.expected).toBe(1);
    for (const row of event.roster.filter((person) => person.status === "checked_in")) {
      expect(
        row.checkedInAt && Date.parse(row.checkedInAt) < Date.parse(demoWorkspace.demoNow),
      ).toBe(true);
    }

    const library = getRoster("sh-tue-library", base);
    expect(library.every((row) => row.status === "expected")).toBe(true);
  });

  it("reflects a session check-in in the same roster used by attendance and the kiosk", () => {
    const expected = getLiveEvent(base).roster.find((row) => row.status === "expected");
    expect(expected).toBeDefined();
    if (!expected) return;

    const session = {
      ...base,
      attendance: {
        ...base.attendance,
        [DEMO_EVENT_SHIFT_ID]: [
          ...(base.attendance[DEMO_EVENT_SHIFT_ID] ?? []),
          {
            volunteerId: expected.volunteer.id,
            shiftId: DEMO_EVENT_SHIFT_ID,
            role: expected.role,
            status: "checked_in" as const,
            checkedInAt: demoWorkspace.demoNow,
            checkedOutAt: null,
          },
        ],
      },
    } satisfies SessionSnapshot;

    const updated = getLiveEvent(session);
    expect(rosterCounts(updated.roster).checkedIn).toBe(3);
    expect(updated.roster.find((row) => row.volunteer.id === expected.volunteer.id)?.status).toBe(
      "checked_in",
    );
  });

  it("moves waitlisted volunteers to promoted without duplicating their chair", () => {
    const entry = getWaitlist("sh-sat-food", base)[0];
    expect(entry).toBeDefined();
    if (!entry) return;
    const promoted = getWaitlist("sh-sat-food", {
      ...base,
      waitlist: base.waitlist.map((row) =>
        row.id === entry.entry.id ? { ...row, status: "promoted" as const } : row,
      ),
    });
    expect(promoted[0]?.status).toBe("promoted");
    expect(
      getRoster("sh-sat-food", base).some((row) => row.volunteer.id === entry.volunteer.id),
    ).toBe(false);
  });

  it("moves an applicant through the pipeline in the shared read model", () => {
    const applicant = getApplications(base)[0];
    const moved = getApplications({
      ...base,
      applications: base.applications.map((row) =>
        row.id === applicant.id ? { ...row, stage: "onboarding" as const } : row,
      ),
    });
    expect(moved.find((row) => row.id === applicant.id)?.stage).toBe("onboarding");
  });
});
