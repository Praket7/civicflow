import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultSnapshot, previewRepository } from "./previewRepository";
import { getWorkspaceRepository, setRepositoryToken } from "./repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const snapshot = createDefaultSnapshot();

describe("workspace repository", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(snapshot);
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("uses the browser fallback when the native host is absent", async () => {
    const repository = getWorkspaceRepository();
    expect(repository.source).toBe("preview");
    const state = await repository.getSnapshot();
    expect(state.applications).toHaveLength(7);
    expect(state.waitlist).toHaveLength(4);
    expect(state.settings.organizationName).toBe("FeedMore WNY");
  });

  it("maps every desktop write to its Rust command and camelCase arguments", async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockResolvedValue(snapshot);
    setRepositoryToken("session-token");
    const repository = getWorkspaceRepository();
    expect(repository.source).toBe("desktop");

    await repository.getSnapshot();
    await repository.setSaved("opp-garden", false);
    await repository.setApplicationStage("app-001", "review");
    await repository.checkIn("sh-tue-pantry", "vol-maya");
    await repository.checkOut("sh-tue-pantry", "vol-maya");
    await repository.markNoShow("sh-tue-pantry", "vol-054");
    await repository.promoteWaitlist("sh-sat-food", "vol-054");
    await repository.reviewHours("hours-maya-4", {
      status: "verified",
      approvedMinutes: 480,
      reason: "Trimmed travel time",
      reviewedAt: "2026-10-13T07:45:00-04:00",
    });
    await repository.updateSettings({ defaultShiftLength: 240 });
    await repository.createOpportunity({
      title: "Weekend Pantry Restock",
      cause: "food",
      description: "Restock shelves and load delivery boxes for Saturday routes.",
      address: "91 Holt St, Buffalo, NY",
      capacity: 12,
      duration: "2 hours",
      requirements: ["Driver"],
    });
    await repository.registerForShift("sh-sat-food", "vol-maya", "Driver");
    await repository.saveVolunteerProfile({
      skills: ["Spanish"],
      availability: [{ day: "wed", period: "morning" }],
      completedOnboarding: true,
    });
    await repository.applyRoster("sh-sat-food", [
      { candidateId: "vol-002", role: "Driver", promoteWaitlist: false },
    ]);
    await repository.resetDemo();

    const calls = vi.mocked(invoke).mock.calls;
    expect(calls.map(([command]) => command)).toEqual([
      "get_workspace_snapshot",
      "set_saved_opportunity",
      "set_application_stage",
      "check_in_volunteer",
      "check_out_volunteer",
      "mark_volunteer_no_show",
      "promote_waitlist",
      "review_hours",
      "update_workspace_settings",
      "create_opportunity",
      "register_for_shift",
      "save_volunteer_profile",
      "apply_roster_plan",
      "reset_demo",
    ]);
    expect(calls[0][1]).toEqual({ token: "session-token" });
    expect(calls[1][1]).toEqual({
      opportunityId: "opp-garden",
      saved: false,
      token: "session-token",
    });
    expect(calls[2][1]).toEqual({
      applicationId: "app-001",
      stage: "review",
      token: "session-token",
    });
    expect(calls[7][1]).toEqual({
      entryId: "hours-maya-4",
      status: "verified",
      approvedMinutes: 480,
      reason: "Trimmed travel time",
      token: "session-token",
    });
    expect(calls[8][1]).toEqual({
      patch: { defaultShiftLength: 240 },
      token: "session-token",
    });
    expect(calls[10][1]).toEqual({
      shiftId: "sh-sat-food",
      volunteerId: "vol-maya",
      role: "Driver",
      token: "session-token",
    });
    expect(calls[11][1]).toEqual({
      skills: ["Spanish"],
      availability: [{ day: "wed", period: "morning" }],
      completedOnboarding: true,
      token: "session-token",
    });
    expect(calls[12][1]).toEqual({
      shiftId: "sh-sat-food",
      assignments: [{ candidateId: "vol-002", role: "Driver", promoteWaitlist: false }],
      token: "session-token",
    });
    setRepositoryToken(null);
  });

  it("preview cancellation promotes the next eligible waitlist candidate", async () => {
    await previewRepository.resetDemo();
    const state = await previewRepository.cancelRegistration(
      "sh-sat-food",
      "vol-045",
      "Family emergency",
    );
    expect(
      state.registrations.find(
        (row) => row.shiftId === "sh-sat-food" && row.volunteerId === "vol-045",
      )?.status,
    ).toBe("canceled");
    expect(
      state.registrations.find(
        (row) => row.shiftId === "sh-sat-food" && row.volunteerId === "vol-maya",
      )?.status,
    ).toBe("registered");
    expect(
      state.waitlist.find((row) => row.shiftId === "sh-sat-food" && row.volunteerId === "vol-maya")
        ?.status,
    ).toBe("promoted");
    expect(state.audit.some((event) => event.action === "waitlist.promote")).toBe(true);
    await previewRepository.resetDemo();
  });

  it("restores a preview snapshot and audits the restore", async () => {
    await previewRepository.resetDemo();
    const [backup] = await previewRepository.createBackup("Contract backup");
    expect(backup).toBeDefined();
    if (!backup) return;

    const baseline = await previewRepository.getSnapshot();
    await previewRepository.checkIn("sh-tue-pantry", "vol-maya");
    const mutated = await previewRepository.setSaved("opp-garden", false);
    expect(mutated.attendance["sh-tue-pantry"]).toHaveLength(
      (baseline.attendance["sh-tue-pantry"]?.length ?? 0) + 1,
    );
    expect(mutated.savedOpportunityIds).not.toContain("opp-garden");

    const result = await previewRepository.restoreBackup(backup.id);
    expect(result.snapshot.attendance).toEqual(baseline.attendance);
    expect(result.snapshot.savedOpportunityIds).toContain("opp-garden");
    expect(result.snapshot.audit[0]).toMatchObject({
      action: "backup.restore",
      entityId: backup.id,
    });
    expect(result.backups[0]?.note).toBe(`Before restoring ${backup.id}`);
  });

  it("refuses unknown or malformed preview snapshots", async () => {
    await previewRepository.resetDemo();
    await expect(previewRepository.restoreBackup("missing")).rejects.toThrow(/not available/);

    const [backup] = await previewRepository.createBackup("Tamper target");
    expect(backup).toBeDefined();
    if (!backup) return;
    const stored = JSON.parse(localStorage.getItem("civicflow.backups.v1") ?? "[]") as Array<{
      meta: unknown;
      snapshot: unknown;
    }>;
    stored[0] = { ...stored[0], snapshot: { nope: true } };
    localStorage.setItem("civicflow.backups.v1", JSON.stringify(stored));

    const before = await previewRepository.getSnapshot();
    await expect(previewRepository.restoreBackup(backup.id)).rejects.toThrow(
      /incomplete or foreign/,
    );
    expect(await previewRepository.getSnapshot()).toEqual(before);
  });

  it("keeps only the newest twenty preview snapshots", async () => {
    await previewRepository.resetDemo();
    for (let index = 0; index < 25; index += 1) {
      await previewRepository.createBackup(`Retention ${index}`);
    }

    const backups = await previewRepository.listBackups();
    expect(backups).toHaveLength(20);
    expect(backups[0]?.note).toBe("Retention 24");
    expect(backups[19]?.note).toBe("Retention 5");
    expect(backups.some((backup) => backup.note === "Retention 4")).toBe(false);
  });

  it("keeps preview writes in one snapshot", async () => {
    await previewRepository.resetDemo();
    const state = await previewRepository.checkIn("sh-tue-pantry", "vol-maya");
    expect(state.attendance["sh-tue-pantry"]?.[0]?.status).toBe("checked_in");
    const saved = await previewRepository.setSaved("opp-park", true);
    expect(saved.savedOpportunityIds).toContain("opp-park");
    const reviewed = await previewRepository.reviewHours("hours-maya-4", {
      status: "verified",
      approvedMinutes: 540,
      reason: "Approved as submitted",
      reviewedAt: "2026-10-13T07:45:00-04:00",
    });
    expect(reviewed.hoursDecisions["hours-maya-4"]?.status).toBe("verified");
    const applied = await previewRepository.applyRoster("sh-sat-food", [
      { candidateId: "vol-002", role: "Driver", promoteWaitlist: false },
    ]);
    expect(
      applied.registrations.find(
        (row) => row.shiftId === "sh-sat-food" && row.volunteerId === "vol-002",
      )?.role,
    ).toBe("Driver");
    expect(applied.audit[0]?.action).toBe("autoroster.apply");
    await previewRepository.resetDemo();
  });
});
