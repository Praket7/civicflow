import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DisplayPreferencesProvider } from "../../lib/display";
import { WorkspaceSessionProvider } from "../../lib/workspace/session";
import { VolunteerImportCard } from "./VolunteerImportCard";

const GOOD_FILE = [
  "Name,Email,Phone,Status,Skills,Availability,Interests,Causes",
  '"Chen, Maya",maya.import@example.org,(716) 555-0142,onboarding,"Food handling; Tutoring",mon:morning; wed:evening,Pantry shifts,food; education',
  "Ibrahim Diallo,ibrahim.import@example.org,,active,Driver,tue:afternoon,Delivery,food",
].join("\n");

const BAD_FILE = [
  "Name,Email,Skills,Availability,Causes",
  "Sam Rivera,sam.import@example.org,Driver,mon:noon,farming",
].join("\n");

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <DisplayPreferencesProvider>
      <QueryClientProvider client={queryClient}>
        <WorkspaceSessionProvider>
          <MemoryRouter>
            <VolunteerImportCard />
          </MemoryRouter>
        </WorkspaceSessionProvider>
      </QueryClientProvider>
    </DisplayPreferencesProvider>,
  );
}

async function paste(text: string) {
  const user = userEvent.setup();
  const field = await screen.findByLabelText("Or paste the rows");
  await user.clear(field);
  await user.type(field, text);
  await user.click(screen.getByRole("button", { name: "Check the file" }));
  return user;
}

describe("volunteer spreadsheet import", () => {
  it("checks a file row by row and offers the add once it is clean", async () => {
    renderCard();
    await paste(GOOD_FILE);

    expect(await screen.findByText(/2 rows read · 2 ready · 0 need a fix/)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Rows read from the file" })).toBeInTheDocument();
    // A quoted cell keeps its comma as part of the name.
    expect(screen.getByText("Chen, Maya")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 2 volunteers" })).toBeEnabled();
  });

  it("names the line and the value that needs a fix and refuses the file", async () => {
    renderCard();
    await paste(BAD_FILE);

    expect(await screen.findByText(/1 rows read · 0 ready · 1 need a fix/)).toBeInTheDocument();
    expect(screen.getByText(/needs a day and a period, like mon:morning/)).toBeInTheDocument();
    expect(screen.getByText(/is not a cause/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add the volunteers" })).toBeDisabled();
  });

  it("adds the file's rows as one import and clears the field", async () => {
    renderCard();
    const user = await paste(GOOD_FILE);
    await screen.findByText(/2 rows read/);

    await user.click(screen.getByRole("button", { name: "Add 2 volunteers" }));

    expect(await screen.findByText(/2 volunteers added to the roster/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Or paste the rows")).toHaveValue(""));
    // The check re-runs on the now-empty field, so nothing is left to import.
    expect(screen.getByRole("button", { name: "Add the volunteers" })).toBeDisabled();
  });

  it("has no serious axe violations", async () => {
    const { container } = renderCard();
    await paste(GOOD_FILE);
    await screen.findByRole("table", { name: "Rows read from the file" });

    const results = await axe(container);
    const blocking = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(blocking).toEqual([]);
  });
});
