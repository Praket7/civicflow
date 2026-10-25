import { createContext, useContext } from "react";

/**
 * Which workspace a screen is reading. Cached reads (Mission Control,
 * notifications) are scoped to it, so switching organizations can never show
 * another workspace's summary while the new one loads.
 */
const WorkspaceScopeContext = createContext("demo");

export const WorkspaceScopeProvider = WorkspaceScopeContext.Provider;

export function useWorkspaceScope(): string {
  return useContext(WorkspaceScopeContext);
}
