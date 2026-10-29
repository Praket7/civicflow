import { useEffect, useState } from "react";
import type { Account } from "../../types/domain";
import { getWorkspaceRepository } from "../workspace/repository";
import {
  bindOrganizationCommands,
  currentOrganizationFor,
  hydrateOrganizations,
  membershipsFor,
  organizationsFor,
  reportOrganizationError,
  subscribeToOrganizations,
  unreadUpdatesFor,
  updatesFor,
} from "./store";
import type {
  OrganizationMembership,
  OrganizationProfile,
  OrganizationSummary,
  OrganizationUpdate,
} from "./store";

interface OrganizationWorkspace {
  organizations: OrganizationSummary[];
  current: OrganizationProfile | null;
  memberships: OrganizationMembership[];
  updates: OrganizationUpdate[];
  unread: number;
  loading: boolean;
}

const empty: OrganizationWorkspace = {
  organizations: [],
  current: null,
  memberships: [],
  updates: [],
  unread: 0,
  loading: true,
};

function read(account: Account | null): OrganizationWorkspace {
  if (!account) return { ...empty, loading: false };
  return {
    organizations: organizationsFor(account.email),
    current: currentOrganizationFor(account.email),
    memberships: membershipsFor(account.email),
    updates: updatesFor(account.email),
    unread: unreadUpdatesFor(account.email).length,
    loading: false,
  };
}

let bound = false;

/**
 * One organization read per signed-in identity. The repository is the
 * authority; this hook only mirrors its answer into the synchronous cache the
 * shell renders from. A failed read leaves the previous cache visible and
 * surfaces the message instead of inventing a membership.
 */
export function useOrganizationWorkspace(account: Account | null): OrganizationWorkspace {
  const repository = getWorkspaceRepository();
  const [value, setValue] = useState<OrganizationWorkspace>(() => read(account));

  useEffect(() => {
    if (!bound) {
      bindOrganizationCommands({
        select: (organizationId) => repository.selectOrganization(organizationId),
        create: (input) => repository.createOrganization(input),
        update: (organizationId, patch) => repository.updateOrganization(organizationId, patch),
        list: () => repository.listOrganizations(),
        redeem: (code) => repository.redeemOrganizationInvite(code),
        join: (organizationId) => repository.joinPublicOrganization(organizationId),
      });
      bound = true;
    }

    let active = true;
    const sync = () => {
      if (active) setValue(read(account));
    };
    const unsubscribe = subscribeToOrganizations(sync);

    if (!account) {
      // The subscription above turns this into the render that clears access.
      hydrateOrganizations([]);
      return () => {
        active = false;
        unsubscribe();
      };
    }

    repository
      .listOrganizations()
      .then((access) => {
        if (!active) return;
        hydrateOrganizations(access);
        sync();
      })
      .catch((caught: unknown) => {
        if (!active) return;
        reportOrganizationError(caught);
        setValue((current) => ({ ...current, loading: false }));
      });

    return () => {
      active = false;
      unsubscribe();
    };
    // The repository object is a module singleton; the identity is the input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, account?.email]);

  return value;
}
