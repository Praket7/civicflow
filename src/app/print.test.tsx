import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../lib/auth/session";
import { DisplayPreferencesProvider } from "../lib/display";
import { LocaleProvider } from "../lib/i18n";
import { WorkspaceSessionProvider } from "../lib/workspace/session";
import { pages } from "./router";
import { routes } from "./routes";
import type { RouteMeta } from "./routes";

/**
 * Printing is a browser surface: jsdom does not evaluate `@media print`, and the
 * test config stubs CSS modules (`css: false`). These tests guard the two things
 * that made printing blank in the first place — a certificate stylesheet that
 * hid every other route, and screens that rendered no content — plus a source
 * guard that the certificate rule stays scoped to its own mount. The rendered
 * PDF check runs in the browser audit.
 */

const demoParams: Record<string, string> = {
  "opportunity-detail": "community-food-distribution",
  "opportunity-management": "opp-food",
  "volunteer-shift": "sh-sat-food",
  "coordinator-shift": "sh-sat-food",
  "volunteer-detail": "vol-maya",
};

function entryPath(route: RouteMeta) {
  const value = demoParams[route.id];
  return value ? route.path.replace(/:[^/]+/, value) : route.path;
}

function renderRoute(route: RouteMeta) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = pages[route.id];
  if (!page) throw new Error(`Route ${route.id} has no registered page`);
  return render(
    <DisplayPreferencesProvider>
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <WorkspaceSessionProvider>
              <MemoryRouter initialEntries={[entryPath(route)]}>
                <Routes>
                  <Route path={route.path} element={page} />
                </Routes>
              </MemoryRouter>
            </WorkspaceSessionProvider>
          </AuthProvider>
        </QueryClientProvider>
      </LocaleProvider>
    </DisplayPreferencesProvider>,
  );
}

async function expectContent(container: HTMLElement) {
  await waitFor(
    () => {
      expect(container.textContent).not.toContain("Opening workspace");
      expect(container.textContent).not.toContain("could not open the workspace");
      expect((container.textContent ?? "").trim().length).toBeGreaterThan(40);
    },
    { timeout: 5000 },
  );
}

describe("every registered route", () => {
  for (const route of routes) {
    it(`${route.number}. ${route.title} renders content`, async () => {
      const { container } = renderRoute(route);
      await expectContent(container);
    });
  }
});

describe("print surfaces", () => {
  const verification = routes.find((route) => route.id === "service-verification");
  const report = routes.find((route) => route.id === "impact-report");

  it("shows the certificate and gates its print stylesheet while mounted", async () => {
    if (!verification) throw new Error("Service Verification route is missing");
    const { container, unmount } = renderRoute(verification);
    await waitFor(() => expect(container.textContent).toContain("This certifies that"));

    expect(document.body.dataset.printView).toBe("verification");
    expect(container.textContent).toContain("Maya Chen");

    unmount();
    expect(document.body.dataset.printView).toBeUndefined();
  });

  it("renders a report that the certificate stylesheet cannot hide", async () => {
    if (!report) throw new Error("Impact Report route is missing");
    const { container } = renderRoute(report);
    await waitFor(() => expect(container.textContent).toContain("Where the hours went"));

    expect(document.body.dataset.printView).toBeUndefined();
    expect(container.textContent).toContain("verified hours");
    expect(container.textContent).toContain("How this was measured");
  });

  it("keeps the certificate print rule scoped to the certificate route", () => {
    const verificationCss = readFileSync(
      "src/features/volunteer/VerificationPage.module.css",
      "utf8",
    );
    const printBlock = verificationCss.slice(verificationCss.indexOf("@media print"));
    expect(printBlock).toContain('body[data-print-view="verification"] *');
    expect(printBlock).not.toContain(":global(body *)");
  });
});
