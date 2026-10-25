import { useEffect, useState } from "react";
import type { Account } from "../../types/domain";
import {
  currentOrganizationFor,
  membershipsFor,
  organizationsFor,
  subscribeToOrganizations,
  unreadUpdatesFor,
  updatesFor,
} from "./store";
import type { OrganizationMembership, OrganizationSummary, OrganizationUpdate } from "./store";

interface OrganizationWorkspace {
  organizations: OrganizationSummary[];
  current: ReturnType<typeof currentOrganizationFor>;
  memberships: OrganizationMembership[];
  updates: OrganizationUpdate[];
  unread: number;
}

function read(account: Account | null): OrganizationWorkspace {
  if (!account) {
    return { organizations: [], current: null, memberships: [], updates: [], unread: 0 };
  }
  return {
    organizations: organizationsFor(account.email),
    current: currentOrganizationFor(account.email),
    memberships: membershipsFor(account.email),
    updates: updatesFor(account.email),
    unread: unreadUpdatesFor(account.email).length,
  };
}

/** Everything the workspace switcher and the notification menu need. */
export function useOrganizationWorkspace(account: Account | null): OrganizationWorkspace {
  const email = account?.email ?? "";
  const [value, setValue] = useState<OrganizationWorkspace>(() => read(account));

  useEffect(() => {
    const sync = () => setValue(read(account));
    sync();
    return subscribeToOrganizations(sync);
  }, [account, email]);

  return value;
}
