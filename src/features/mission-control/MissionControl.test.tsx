import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../../lib/auth/session";
import { WorkspaceSessionProvider } from "../../lib/workspace/session";
import { MissionControlPage } from "./MissionControlPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WorkspaceSessionProvider>
          <MemoryRouter initialEntries={["/coordinator/mission-control"]}>
            <MissionControlPage />
          </MemoryRouter>
        </WorkspaceSessionProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Mission Control", () => {
  it("renders the greeting and the four derived metrics", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Good morning, Praket." }),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /77 Active volunteers/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /91% Role coverage/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /418 h Hours this month/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /14 Upcoming shifts/ })).toBeInTheDocument();
  });

  it("renders attention items with a text explanation", async () => {
    renderPage();
    const attention = await screen.findByRole("region", { name: "What needs a hand" });
    expect(within(attention).getByText("Driver missing · Sat 9:00 AM")).toBeInTheDocument();
    expect(within(attention).getByText("2 spots open · Sat 1:00 PM")).toBeInTheDocument();
    expect(within(attention).getByText("Math tutor missing · Sun 2:00 PM")).toBeInTheDocument();
  });

  it("gives the weekly chart a text alternative", async () => {
    renderPage();
    const table = await screen.findByRole("table", { name: "Seat fill by day this week" });
    expect(within(table).getByRole("rowheader", { name: "Sat 17" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "62%" })).toBeInTheDocument();
  });

  it("has no serious axe violations", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "Good morning, Praket." });
    const results = await axe(container);
    const blocking = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(blocking).toEqual([]);
  });
});
