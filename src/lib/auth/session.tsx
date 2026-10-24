import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Account, AuthSession } from "../../types/domain";
import { getWorkspaceRepository, setRepositoryToken } from "../workspace/repository";

const repository = getWorkspaceRepository();
const TOKEN_KEY = "civicflow.auth.token";

interface AuthValue {
  user: Account | null;
  token: string | null;
  loading: boolean;
  signIn(email: string, password: string, remember: boolean): Promise<AuthSession>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function rememberToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // A blocked storage area only shortens the session; it is not a failure.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => storedToken());
  const [user, setUser] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const current = token ?? storedToken();
    if (!current) {
      setRepositoryToken(null);
      setToken(null);
      setUser(null);
      setLoading(false);
      return;
    }
    setRepositoryToken(current);
    try {
      const account = await repository.currentUser(current);
      if (!account) {
        rememberToken(null);
        setRepositoryToken(null);
        setToken(null);
      } else {
        setToken(current);
      }
      setUser(account);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    const current = storedToken();
    if (!current) {
      // Defer the empty-session write so the effect body itself stays pure, and
      // re-read storage first: a sign-in can finish between mount and this tick.
      const timer = window.setTimeout(() => {
        if (!active || storedToken()) return;
        setRepositoryToken(null);
        setToken(null);
        setUser(null);
        setLoading(false);
      }, 0);
      return () => {
        active = false;
        window.clearTimeout(timer);
      };
    }
    setRepositoryToken(current);
    repository
      .currentUser(current)
      .then((account) => {
        if (!active) return;
        if (!account) {
          rememberToken(null);
          setRepositoryToken(null);
        }
        setToken(account ? current : null);
        setUser(account);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string, remember: boolean) => {
    const session = await repository.signIn(email, password, remember);
    setRepositoryToken(session.token);
    if (remember) rememberToken(session.token);
    else rememberToken(null);
    setToken(session.token);
    setUser(session.user);
    return session;
  }, []);

  const signOut = useCallback(async () => {
    const current = token ?? storedToken();
    // Clear the local session first so the window leaves the workspace even if
    // revoking the server-side session is slow or the database is busy.
    rememberToken(null);
    setRepositoryToken(null);
    setToken(null);
    setUser(null);
    if (current) {
      try {
        await repository.signOut(current);
      } catch {
        // The token is gone from this device; revocation can wait for expiry.
      }
    }
  }, [token]);

  const value = useMemo<AuthValue>(
    () => ({ user, token, loading, signIn, signOut, refresh }),
    [user, token, loading, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

export function accountHome(account: Account): string {
  return account.role === "volunteer" ? "/volunteer/home" : "/coordinator/mission-control";
}
