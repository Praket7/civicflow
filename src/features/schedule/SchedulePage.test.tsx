import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DisplayPreferencesProvider } from "../../lib/display";
import { WorkspaceSessionProvider } from "../../lib/workspace/session";
import { settleQueries } from "../../test/queries";
import { SchedulePage } from "./SchedulePage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    ...render(
      <DisplayPreferencesProvider>
        <QueryClientProvider client={queryClient}>
          <WorkspaceSessionProvider>
            <MemoryRouter initialEntries={["/coordinator/schedule"]}>
              <SchedulePage />
            </MemoryRouter>
          </WorkspaceSessionProvider>
        </QueryClientProvider>
      </DisplayPreferencesProvider>,
    ),
    queryClient,
  };
}

describe("Schedule", () => {
  it("summarizes the demo week and its role gaps by day", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /October 12.*18, 2026/ })).toBeVisible();
    expect(screen.getByText("2 shifts · 3 gaps")).toBeInTheDocument();
    expect(screen.getByText("1 shift · 1 gap")).toBeInTheDocument();
  });

  it("moves the selected-shift rail when another card is chosen", async () => {
    renderPage();
    const user = userEvent.setup();
    const foodShift = await screen.findByRole("button", {
      name: /Community Food Distribution.*10\/16 seats/,
    });

    await user.click(foodShift);

    const rail = screen.getByRole("complementary", { name: "Schedule details" });
    expect(
      await within(rail).findByRole("heading", { name: "Community Food Distribution" }),
    ).toBeInTheDocument();
    expect(within(rail).getByText(/10 of 16 seats confirmed/)).toBeInTheDocument();
    expect(within(rail).getByText("Driver")).toBeInTheDocument();
  });

  it("filters the calendar by cause and keeps the list view in sync", async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Schedule" });

    expect(
      screen.getAllByRole("button", { name: /Community Garden Restoration/ }).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Environment" }));

    expect(screen.queryAllByRole("button", { name: /Community Garden Restoration/ })).toHaveLength(
      0,
    );
    expect(screen.getByText("12 of 15 shifts")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "List" }));
    expect(screen.getByText("All scheduled shifts")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "All scheduled shifts" })).toBeInTheDocument();
  });

  it("has no serious axe violations", async () => {
    const { container, queryClient } = renderPage();
    await screen.findByRole("heading", { name: "Schedule" });
    await settleQueries(queryClient);

    const results = await axe(container);
    const blocking = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(blocking).toEqual([]);
  });
});
