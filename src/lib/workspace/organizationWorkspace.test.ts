import { describe, expect, it } from "vitest";
import type { Account } from "../../types/domain";
import { demoWorkspace } from "./dataset";
import { isDemoOrganization, workspaceForOrganization } from "./organizationWorkspace";
import type { OrganizationProfile } from "../organizations/store";

function organization(overrides: Partial<OrganizationProfile> = {}): OrganizationProfile {
  return {
    id: "org-east-side-aid",
    name: "East Side Aid",
    description: "Neighbours sharing groceries and rides.",
    website: "eastsideaid.example.org",
    address: "112 Broadway",
    city: "Buffalo",
    state: "NY",
    contactEmails: ["casey@eastsideaid.example.org"],
    image: "data:image/jpeg;base64,cover",
    imageAlt: "East Side Aid cover photo",
    visibility: "public",
    createdAt: "2026-10-20T12:00:00.000Z",
    createdBy: "casey@eastsideaid.example.org",
    isDemo: false,
    syncMode: "local",
    ...overrides,
  };
}

const coordinator: Account = {
  id: "user-casey",
  name: "Casey Reed",
  email: "casey@eastsideaid.example.org",
  role: "coordinator",
  volunteerId: null,
};

const volunteer: Account = {
  id: "user-sam",
  name: "Sam Ortiz",
  email: "sam@example.org",
  role: "volunteer",
  volunteerId: "vol-sam",
};

describe("workspace scope", () => {
  it("keeps the seeded demo data for the bundled organization only", () => {
    const workspace = workspaceForOrganization(
      organization({ id: demoWorkspace.organization.id }),
      coordinator,
    );
    expect(workspace.shifts).toHaveLength(demoWorkspace.shifts.length);
    expect(workspace.opportunities).toHaveLength(demoWorkspace.opportunities.length);
    expect(isDemoOrganization(demoWorkspace.organization.id)).toBe(true);
  });

  it("starts a created organization with no events, shifts, or borrowed story", () => {
    const workspace = workspaceForOrganization(organization(), coordinator);

    expect(workspace.shifts).toEqual([]);
    expect(workspace.opportunities).toEqual([]);
    expect(workspace.registrations).toEqual([]);
    expect(workspace.hourEntries).toEqual([]);
    expect(workspace.recentActivity).toEqual([]);
    expect(workspace.notifications).toEqual([]);
    expect(workspace.impact.mealsPacked).toBe(0);
    expect(workspace.organization).toMatchObject({
      id: "org-east-side-aid",
      name: "East Side Aid",
      address: "112 Broadway",
      image: "data:image/jpeg;base64,cover",
      imageAlt: "East Side Aid cover photo",
    });
  });

  it("gives a volunteer their own empty record inside a created organization", () => {
    const workspace = workspaceForOrganization(organization(), volunteer);

    expect(workspace.currentVolunteerId).toBe("vol-sam");
    expect(workspace.volunteers).toHaveLength(1);
    expect(workspace.volunteers[0]).toMatchObject({
      name: "Sam Ortiz",
      email: "sam@example.org",
      hoursVerified: 0,
      eventsCompleted: 0,
    });
  });
});
