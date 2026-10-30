import { describe, expect, it } from "vitest";
import type { SessionSnapshot } from "../../types/domain";
import {
  DEMO_EVENT_SHIFT_ID,
  currentVolunteer,
  getApplications,
  getAttendanceRoster,
  getHoursSummary,
  getLiveEvent,
  getRoster,
  getUpcomingForVolunteer,
  getWaitlist,
  rosterCounts,
} from "./selectors";
import { demoWorkspace } from "./dataset";
import { createDefaultSnapshot } from "./previewRepository";

const maya = currentVolunteer(demoWorkspace);
const base = createDefaultSnapshot();

describe("shared read model consistency", () => {
  it("uses the curated Maya ledger once and totals 18.5 hours", () => {
    const summary = getHoursSummary(maya.id, base, demoWorkspace);
    expect(summary.totalMinutes).toBe(1110);
    expect(summary.verifiedMinutes).toBe(570);
    expect(summary.pendingMinutes).toBe(540);
    expect(
      new Set(getUpcomingForVolunteer(maya.id, base, demoWorkspace).map((row) => row.shift.id))
        .size,
    ).toBe(2);
  });

  it("only marks demo-day arrivals as checked in once the check-in window opens", () => {
    const event = getLiveEvent(base, demoWorkspace);
    expect(event).not.toBeNull();
    if (!event) return;
    expect(event.roster.length).toBe(3);
    const counts = rosterCounts(event.roster);
    expect(counts.checkedIn).toBe(2);
    expect(counts.expected).toBe(1);
    for (const row of event.roster.filter((person) => person.status === "checked_in")) {
      expect(row.checkedInAt && Date.parse(row.checkedInAt) < Date.parse(demoWorkspace.now)).toBe(
        true,
      );
    }

    const library = getRoster("sh-tue-library", base, demoWorkspace);
    expect(library.every((row) => row.status === "expected")).toBe(true);
  });

  it("reflects a session check-in in the same roster used by attendance and the kiosk", () => {
    const initial = getLiveEvent(base, demoWorkspace);
    expect(initial).not.toBeNull();
    if (!initial) return;
    const expected = initial.roster.find((row) => row.status === "expected");
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
            checkedInAt: demoWorkspace.now,
            checkedOutAt: null,
          },
        ],
      },
    } satisfies SessionSnapshot;

    const updated = getLiveEvent(session, demoWorkspace);
    expect(updated).not.toBeNull();
    if (!updated) return;
    expect(rosterCounts(updated.roster).checkedIn).toBe(3);
    expect(updated.roster.find((row) => row.volunteer.id === expected.volunteer.id)?.status).toBe(
      "checked_in",
    );
  });

  it("keeps a no-show on the attendance board but out of the staffing count", () => {
    const event = getLiveEvent(base, demoWorkspace);
    expect(event).not.toBeNull();
    if (!event) return;
    const absent = event.roster.find((row) => row.status === "expected");
    expect(absent).toBeDefined();
    if (!absent) return;

    const session = {
      ...base,
      registrations: base.registrations.map((row) =>
        row.shiftId === DEMO_EVENT_SHIFT_ID && row.volunteerId === absent.volunteer.id
          ? { ...row, status: "no_show" as const }
          : row,
      ),
      attendance: {
        ...base.attendance,
        [DEMO_EVENT_SHIFT_ID]: [
          ...(base.attendance[DEMO_EVENT_SHIFT_ID] ?? []),
          {
            volunteerId: absent.volunteer.id,
            shiftId: DEMO_EVENT_SHIFT_ID,
            role: absent.role,
            status: "no_show" as const,
            checkedInAt: null,
            checkedOutAt: null,
          },
        ],
      },
    } satisfies SessionSnapshot;

    // The staffing roster no longer holds their seat…
    expect(
      getRoster(DEMO_EVENT_SHIFT_ID, session, demoWorkspace).some(
        (row) => row.volunteer.id === absent.volunteer.id,
      ),
    ).toBe(false);
    // …but the attendance board still shows the absence.
    const board = getAttendanceRoster(DEMO_EVENT_SHIFT_ID, session, demoWorkspace);
    const row = board.find((person) => person.volunteer.id === absent.volunteer.id);
    expect(row?.status).toBe("no_show");
    expect(rosterCounts(board).noShow).toBe(1);
    expect(rosterCounts(board).confirmed).toBe(board.length - 1);
  });

  it("moves waitlisted volunteers to promoted without duplicating their chair", () => {
    const entry = getWaitlist("sh-sat-food", base, demoWorkspace)[0];
    expect(entry).toBeDefined();
    if (!entry) return;
    const promoted = getWaitlist(
      "sh-sat-food",
      {
        ...base,
        waitlist: base.waitlist.map((row) =>
          row.id === entry.entry.id ? { ...row, status: "promoted" as const } : row,
        ),
      },
      demoWorkspace,
    );
    expect(promoted[0]?.status).toBe("promoted");
    expect(
      getRoster("sh-sat-food", base, demoWorkspace).some(
        (row) => row.volunteer.id === entry.volunteer.id,
      ),
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
