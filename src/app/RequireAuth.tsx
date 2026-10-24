import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { accountHome, useAuth } from "../lib/auth/session";

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

  const allowed = roles ?? (accountRole ? [accountRole] : [user.role]);
  if (!allowed.includes(user.role)) {
    return <Navigate to={accountHome(user)} replace />;
  }

  return <>{children}</>;
}
