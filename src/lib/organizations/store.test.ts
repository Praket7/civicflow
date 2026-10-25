import { beforeEach, describe, expect, it } from "vitest";
import type { Account } from "../../types/domain";
import {
  createOrganization,
  currentOrganizationFor,
  joinOrganization,
  membershipsFor,
  organizationForCode,
  organizationsFor,
  recordOrganizationUpdate,
  resetOrganizationsForTests,
  setCurrentOrganization,
  unreadUpdatesFor,
  markUpdatesRead,
} from "./store";

const coordinator: Account = {
  id: "user-coordinator",
  name: "Dana Whitfield",
  email: "dana@example.org",
  role: "coordinator",
  volunteerId: null,
};

const volunteer: Account = {
  id: "user-volunteer",
  name: "Luis Ortega",
  email: "luis@example.org",
  role: "volunteer",
  volunteerId: "vol-luis",
};

function newOrganization(visibility: "public" | "private" = "public") {
  return createOrganization(coordinator, {
    name: "East Side Tutoring",
    description: "After-school tutoring for third to fifth graders at the East Side library.",
    website: "eastside.example.org",
    address: "1 Library Way",
    city: "Buffalo",
    state: "NY",
    contactEmails: ["dana@example.org"],
    image: "/media/hero-community.jpg",
    imageAlt: "Neighbours at a community event",
    visibility,
  });
}

beforeEach(() => {
  resetOrganizationsForTests();
});

describe("organization codes", () => {
  it("gives a new workspace a 10-digit coordinator code and a 6-digit volunteer code", () => {
    const organization = newOrganization();

    expect(organization.coordinatorCode).toMatch(/^\d{10}$/);
    expect(organization.volunteerCode).toMatch(/^\d{6}$/);
    expect(organizationForCode(organization.coordinatorCode, "coordinator")?.id).toBe(
      organization.id,
    );
    expect(organizationForCode(organization.volunteerCode, "volunteer")?.id).toBe(organization.id);
  });

  it("makes the creator a coordinator and selects the new workspace", () => {
    const organization = newOrganization();

    expect(membershipsFor(coordinator.email)).toEqual([
      expect.objectContaining({ organizationId: organization.id, role: "coordinator" }),
    ]);
    expect(currentOrganizationFor(coordinator.email)?.id).toBe(organization.id);
  });

  it("keeps codes unique across workspaces", () => {
    const first = newOrganization();
    const second = createOrganization(coordinator, {
      name: "Northside Pantry",
      description: "A weekly pantry for families on the north side of the city.",
      website: "northside.example.org",
      address: "12 Main Street",
      city: "Buffalo",
      state: "NY",
      contactEmails: ["dana@example.org"],
      image: "/media/hero-community.jpg",
      imageAlt: "Neighbours at a community event",
      visibility: "public",
    });

    expect(second.coordinatorCode).not.toBe(first.coordinatorCode);
    expect(second.volunteerCode).not.toBe(first.volunteerCode);
  });
});

describe("joining", () => {
  it("lets a volunteer join a public organization without a code", () => {
    const organization = newOrganization("public");

    joinOrganization(volunteer, organization.id);

    expect(organizationsFor(volunteer.email).map((entry) => entry.organization.id)).toEqual([
      organization.id,
    ]);
    expect(currentOrganizationFor(volunteer.email)?.id).toBe(organization.id);
  });

  it("keeps a private organization closed until the six-digit code is supplied", () => {
    const organization = newOrganization("private");

    expect(() => joinOrganization(volunteer, organization.id)).toThrow(/private/i);
    expect(() => joinOrganization(volunteer, organization.id, "000000")).toThrow(/private/i);

    joinOrganization(volunteer, organization.id, organization.volunteerCode);
    expect(membershipsFor(volunteer.email)).toHaveLength(1);
  });

  it("only accepts the coordinator code for another coordinator", () => {
    const organization = newOrganization("public");
    const secondCoordinator: Account = {
      ...coordinator,
      id: "user-coordinator-2",
      name: "Amara Okafor",
      email: "amara@example.org",
    };

    expect(() =>
      joinOrganization(secondCoordinator, organization.id, organization.volunteerCode),
    ).toThrow(/coordinator code/i);

    joinOrganization(secondCoordinator, organization.id, organization.coordinatorCode);
    expect(membershipsFor(secondCoordinator.email)).toHaveLength(1);
  });

  it("ignores a switch to a workspace the account has not joined", () => {
    const organization = newOrganization();
    setCurrentOrganization(volunteer.email, organization.id);

    expect(currentOrganizationFor(volunteer.email)).toBeNull();
    expect(membershipsFor(volunteer.email)).toEqual([]);
  });

  it("keeps several workspaces and switches between them", () => {
    const first = newOrganization();
    const second = createOrganization(coordinator, {
      name: "Southside Garden",
      description: "Neighbours grow vegetables together and share the harvest each Saturday.",
      website: "southside.example.org",
      address: "9 Garden Street",
      city: "Buffalo",
      state: "NY",
      contactEmails: ["dana@example.org"],
      image: "/media/hero-community.jpg",
      imageAlt: "Neighbours at a community event",
      visibility: "public",
    });
    joinOrganization(volunteer, first.id);
    joinOrganization(volunteer, second.id);

    setCurrentOrganization(volunteer.email, first.id);
    expect(currentOrganizationFor(volunteer.email)?.id).toBe(first.id);
    setCurrentOrganization(volunteer.email, second.id);
    expect(currentOrganizationFor(volunteer.email)?.id).toBe(second.id);
  });
});

describe("workspace updates", () => {
  it("only shows an event to members of that workspace, and marks it read", () => {
    const organization = newOrganization();
    recordOrganizationUpdate({
      organizationId: organization.id,
      kind: "event",
      title: "New event: Saturday tutoring",
      body: "East Side Tutoring published Saturday tutoring.",
      href: "/volunteer/discover",
      author: "Dana Whitfield",
    });

    expect(unreadUpdatesFor(coordinator.email)).toHaveLength(1);
    expect(unreadUpdatesFor(volunteer.email)).toHaveLength(0);

    joinOrganization(volunteer, organization.id);
    expect(unreadUpdatesFor(volunteer.email)).toHaveLength(1);

    markUpdatesRead(volunteer.email);
    expect(unreadUpdatesFor(volunteer.email)).toHaveLength(0);
  });
});
