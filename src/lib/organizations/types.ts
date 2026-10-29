import type { MembershipRole, MembershipStatus } from "../../types/domain";

export type OrganizationVisibility = "public" | "private";
export type SyncMode = "local" | "synced";

export interface OrganizationProfile {
  id: string;
  name: string;
  initials: string;
  mission: string;
  description: string;
  city: string;
  state: string;
  address: string;
  website: string;
  email: string;
  timezone: string;
  visibility: OrganizationVisibility;
  image: string | null;
  imageAlt: string | null;
  createdAt: string;
  createdByUserId: string | null;
  isDemo: boolean;
  syncMode: SyncMode;
}

export interface OrganizationMembership {
  organizationId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: string;
  /** Bumped whenever the role or status changes. Privileged writes carry it. */
  membershipEpoch: number;
}

export interface OrganizationAccess {
  organization: OrganizationProfile;
  membership: OrganizationMembership;
  members: number;
}

export interface OrganizationMember {
  userId: string;
  name: string;
  email: string;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: string;
}

export interface IssuedInvite {
  id: string;
  organizationId: string;
  role: Exclude<MembershipRole, "owner">;
  email: string;
  token: string;
  expiresAt: string;
}

export interface PendingInvite {
  id: string;
  organizationId: string;
  role: Exclude<MembershipRole, "owner">;
  email: string | null;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  revokedAt: string | null;
}

export interface NewOrganizationInput {
  name: string;
  description: string;
  website: string;
  address: string;
  city: string;
  state: string;
  contactEmails: string[];
  image?: string | null;
  imageAlt?: string | null;
  visibility: OrganizationVisibility;
}

export interface OrganizationDetailsPatch {
  name?: string;
  description?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  image?: string | null;
  imageAlt?: string | null;
}

/** Local activity feed entries. Not authorization state; preview-only. */
export type OrganizationUpdateKind = "event" | "announcement";

export interface OrganizationUpdate {
  id: string;
  organizationId: string;
  kind: OrganizationUpdateKind;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  author: string;
}

export const ORGANIZATION_COVERS = [
  { src: "/media/opp-food-distribution.jpg", alt: "Volunteers packing food boxes" },
  { src: "/media/opp-senior-meals.jpg", alt: "A volunteer helping an older neighbor into a car" },
  { src: "/media/opp-community-garden.jpg", alt: "Volunteers in a community garden" },
] as const;

export function isCoordinatorRole(role: MembershipRole): boolean {
  return role === "owner" || role === "coordinator";
}

export function membershipRoleLabel(role: MembershipRole): string {
  if (role === "owner") return "Owner";
  if (role === "coordinator") return "Coordinator";
  return "Volunteer";
}
