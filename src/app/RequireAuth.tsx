import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { accountHome, useAuth } from "../lib/auth/session";
import { isSetupPending, setupRoute } from "../lib/onboarding/store";
import { organizationsFor } from "../lib/organizations/store";

interface RequireAuthProps {
  children: ReactNode;
  accountRole?: "coordinator" | "volunteer";
  roles?: Array<"coordinator" | "volunteer">;
}

export function RequireAuth({ children, accountRole, roles }: RequireAuthProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div role="status" aria-live="polite" style={{ padding: 32 }}>
        Checking account…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }

  // Setup runs once, immediately after an account is created. Until it is
  // finished every workspace route sends the person back to their setup screen.
  // The setup route itself has to stay reachable, or the redirect loops.
  if (isSetupPending(user)) {
    const target = setupRoute(user, organizationsFor(user.email).length > 0);
    if (location.pathname !== target) return <Navigate to={target} replace />;
  }

  const allowed = roles ?? (accountRole ? [accountRole] : [user.role]);
  if (!allowed.includes(user.role)) {
    return <Navigate to={accountHome(user)} replace />;
  }

  return <>{children}</>;
}
