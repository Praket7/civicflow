import { beforeEach, describe, expect, it } from "vitest";
import type { Account } from "../../types/domain";
import type { OrganizationAccess, OrganizationProfile } from "./types";
import {
  bindOrganizationCommands,
  currentOrganizationFor,
  hydrateOrganizations,
  markUpdatesRead,
  membershipsFor,
  organizationsFor,
  recordOrganizationUpdate,
  resetOrganizationsForTests,
  selectOrganization,
  unreadUpdatesFor,
} from "./store";

const coordinator: Account = {
  id: "user-coordinator",
  name: "Dana Whitfield",
  email: "dana@example.org",
  role: "coordinator",
  volunteerId: null,
};

function record(id: string, name: string): OrganizationProfile {
  return {
    id,
    name,
    initials: name.slice(0, 2).toUpperCase(),
    mission: "Neighbours helping neighbours.",
    description: "Neighbours helping neighbours.",
    city: "Buffalo",
    state: "NY",
    address: "1 Main Street",
    website: "example.org",
    email: "dana@example.org",
    timezone: "America/New_York",
    visibility: "public",
    image: null,
    imageAlt: null,
    createdAt: "2026-01-01T00:00:00Z",
    createdByUserId: coordinator.id,
    isDemo: false,
    syncMode: "local",
  };
}

function access(
  id: string,
  name: string,
  role: OrganizationAccess["membership"]["role"] = "owner",
): OrganizationAccess {
  return {
    organization: record(id, name),
    membership: {
      organizationId: id,
      userId: coordinator.id,
      role,
      status: "active",
      joinedAt: "2026-01-01T00:00:00Z",
      membershipEpoch: 1,
    },
    members: 1,
  };
}

const first = access("org-first", "First Pantry");
const second = access("org-second", "Second Garden", "coordinator");

beforeEach(() => {
  resetOrganizationsForTests();
  hydrateOrganizations([first, second]);
});

describe("the organization cache", () => {
  it("shows only the memberships the repository returned", () => {
    expect(organizationsFor(coordinator.email).map((row) => row.organization.id)).toEqual([
      "org-first",
      "org-second",
    ]);
    expect(membershipsFor(coordinator.email)).toHaveLength(2);
  });

  it("starts on the first membership and can be pointed at another", () => {
    expect(currentOrganizationFor(coordinator.email)?.id).toBe("org-first");
    hydrateOrganizations([first, second], "org-second");
    expect(currentOrganizationFor(coordinator.email)?.id).toBe("org-second");
  });

  it("falls back to the first membership when the active one disappears", () => {
    hydrateOrganizations([first, second], "org-second");
    expect(currentOrganizationFor(coordinator.email)?.id).toBe("org-second");

    // The authority removed org-second from this identity's memberships.
    hydrateOrganizations([first]);
    expect(currentOrganizationFor(coordinator.email)?.id).toBe("org-first");
  });

  it("asks the repository before switching and re-reads its answer", async () => {
    const calls: string[] = [];
    bindOrganizationCommands({
      select: async (organizationId) => {
        calls.push(organizationId);
      },
      create: async () => first,
      update: async () => first.organization,
      list: async () => [first, second],
      redeem: async () => first,
      join: async () => first,
    });

    await selectOrganization(coordinator, "org-second");

    expect(calls).toEqual(["org-second"]);
    expect(currentOrganizationFor(coordinator.email)?.id).toBe("org-second");
  });

  it("refuses a switch before the repository is available", async () => {
    await expect(selectOrganization(coordinator, "org-second")).rejects.toThrow(/opening/i);
  });
});

describe("workspace activity", () => {
  it("only shows an update to members of that workspace, and marks it read", () => {
    recordOrganizationUpdate({
      organizationId: "org-first",
      kind: "event",
      title: "New event: Saturday pantry",
      body: "First Pantry published Saturday pantry.",
      href: "/volunteer/discover",
      author: "Dana Whitfield",
    });

    expect(unreadUpdatesFor(coordinator.email)).toHaveLength(1);

    markUpdatesRead(coordinator.email);
    expect(unreadUpdatesFor(coordinator.email)).toHaveLength(0);

    hydrateOrganizations([second]);
    expect(unreadUpdatesFor(coordinator.email)).toHaveLength(0);
  });
});
