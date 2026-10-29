import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { accountHome, useAuth } from "../lib/auth/session";
import { isSetupPending, setupRoute } from "../lib/onboarding/store";
import { useOrganizationWorkspace } from "../lib/organizations/useOrganizationWorkspace";

interface RequireAuthProps {
  children: ReactNode;
  accountRole?: "coordinator" | "volunteer";
  roles?: Array<"coordinator" | "volunteer">;
}

export function RequireAuth({ children, accountRole, roles }: RequireAuthProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  // Organization access is read from the workspace repository. Until that read
  // finishes, the cache is empty and must not be mistaken for "no memberships".
  const organizations = useOrganizationWorkspace(user);

  if (loading || (user && organizations.loading)) {
    return (
      <div role="status" aria-live="polite" style={{ padding: 32 }}>
        Checking account…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }

  // Setup runs once, immediately after an identity is created. Until it is
  // finished every workspace route sends the person back to their setup screen.
  // The setup route itself has to stay reachable, or the redirect loops.
  if (isSetupPending(user)) {
    const target = setupRoute(user, organizations.organizations.length > 0);
    if (location.pathname !== target) return <Navigate to={target} replace />;
  }

  // An identity with no membership may only be on the screens that create or
  // redeem one. Those routes are how it acquires a role in the first place.
  const OPEN_TO_UNASSIGNED = [
    "/coordinator/start",
    "/volunteer/start",
    "/coordinator/organization/new",
  ];
  if (user.role === "none" && OPEN_TO_UNASSIGNED.includes(location.pathname)) {
    return <>{children}</>;
  }

  // A workspace role is derived from an active membership; an account with no
  // organization has no role and cannot open a coordinator or volunteer screen.
  const allowed = roles ?? (accountRole ? [accountRole] : [user.role]);
  if (!allowed.includes(user.role as "coordinator" | "volunteer")) {
    return <Navigate to={accountHome(user)} replace />;
  }

  return <>{children}</>;
}
