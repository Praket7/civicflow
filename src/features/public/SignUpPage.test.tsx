import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../../lib/auth/session";
import { SignUpPage } from "./SignUpPage";

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/create-account"]}>
        <Routes>
          <Route path="/create-account" element={<SignUpPage />} />
          <Route path="/volunteer/start" element={<p>Find a place to serve.</p>} />
          <Route path="/coordinator/start" element={<p>Put your organization on the map.</p>} />
          <Route path="/volunteer/onboarding" element={<p>Tell us what moves you.</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function verify(user: ReturnType<typeof userEvent.setup>) {
  const code = screen.getByLabelText("Verification code").textContent?.trim() ?? "";
  await user.type(screen.getByLabelText("Six-digit code"), code);
  await user.click(screen.getByRole("button", { name: "Verify and create account" }));
}

describe("Create account", () => {
  it("explains what is missing before it creates anything", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Enter the name to show on this account.")).toBeInTheDocument();
    expect(screen.getByText("Enter the email address for this account.")).toBeInTheDocument();
    expect(screen.getByText("Use at least 8 characters for the password.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
  });

  it("creates an identity, then asks which organization to join", async () => {
    // Signing up no longer chooses a role. The first workspace step does.
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Full name"), "Alicia Moreno");
    await user.type(screen.getByLabelText("Email"), "alicia.moreno@example.org");
    await user.type(screen.getByLabelText("Password"), "second-saturday");
    await user.type(screen.getByLabelText("Confirm password"), "second-saturday");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    await verify(user);

    expect(await screen.findByText("Put your organization on the map.")).toBeInTheDocument();
  });

  it("holds the account back when the code is wrong", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Full name"), "Devon Park");
    await user.type(screen.getByLabelText("Email"), "devon.park@example.org");
    await user.type(screen.getByLabelText("Password"), "saturday-morning");
    await user.type(screen.getByLabelText("Confirm password"), "saturday-morning");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("Six-digit code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify and create account" }));

    expect(
      await screen.findByText("That code does not match. Check the six digits and try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Put your organization on the map.")).not.toBeInTheDocument();
  });

  it("stops when the two passwords differ", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Full name"), "Alicia Moreno");
    await user.type(screen.getByLabelText("Email"), "alicia.two@example.org");
    await user.type(screen.getByLabelText("Password"), "second-saturday");
    await user.type(screen.getByLabelText("Confirm password"), "second-sunday");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("The two passwords do not match.")).toBeInTheDocument();
    expect(screen.queryByText("Tell us what moves you.")).not.toBeInTheDocument();
  });

  it("has no serious axe violations", async () => {
    const { container } = renderPage();
    // The provider resolves its stored session on a timer; flush it before the audit.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const results = await axe(container);
    const blocking = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(blocking).toEqual([]);
  });
});
