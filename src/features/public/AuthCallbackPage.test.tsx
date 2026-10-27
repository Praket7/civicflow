import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth/session";
import { AuthCallbackPage } from "./AuthCallbackPage";

// This suite is about what the page says, not about reaching the provider, so
// hosted sign-in counts as configured while every helper stays real.
vi.mock("../../lib/auth/hosted", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/auth/hosted")>();
  return { ...actual, hostedAuthConfigured: true };
});

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/auth/callback"]}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/sign-in" element={<p>Sign in</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  // The page reads the address itself, not the router location.
  window.history.replaceState({}, "", "/auth/callback");
  sessionStorage.clear();
});

describe("Auth callback", () => {
  it("offers a fresh start instead of calling a Google return an expired link", async () => {
    renderPage();

    expect(
      await screen.findByText(
        "This link was not requested on this device. Start again from the sign-in screen.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Expired or already used")).not.toBeInTheDocument();
  });

  it("shows the provider's own reason when the address carries one", async () => {
    window.history.replaceState(
      {},
      "",
      "/auth/callback#error=access_denied&error_description=Access+denied",
    );

    renderPage();

    expect(await screen.findByText("You closed the browser")).toBeInTheDocument();
    expect(
      screen.getByText("Google sign-in was canceled. Nothing changed on this device."),
    ).toBeInTheDocument();
  });
});
