import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth/session";
import { WorkspaceSessionProvider } from "../../lib/workspace/session";
import { VolunteerProfilePage } from "./VolunteerProfilePage";

vi.mock("../../lib/images", () => ({
  profilePhoto: vi.fn(async () => "data:image/jpeg;base64,UPLOADED"),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WorkspaceSessionProvider>
          <MemoryRouter initialEntries={["/volunteer/profile"]}>
            <VolunteerProfilePage />
          </MemoryRouter>
        </WorkspaceSessionProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("volunteer profile photo", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uploads a photo the volunteer chose and shows it on the profile", async () => {
    const { container } = renderPage();

    const upload = await screen.findByRole("button", { name: "Upload photo" });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    if (!input) return;

    const file = new File(["photo"], "me.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        "data:image/jpeg;base64,UPLOADED",
      );
    });
    expect(upload).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Remove" })).toBeInTheDocument();
  });
});
