import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  clearPendingHostedIdentity,
  finishHostedHandoff,
  hostedHandoffPending,
  hostedProblemRoute,
  hostedTokensInHash,
  identityFromUser,
  parseHostedLink,
  readHostedProblem,
  rememberHostedAnswer,
  rememberPendingSignup,
  rememberedHostedAnswer,
} from "./hosted";

beforeEach(() => {
  clearPendingHostedIdentity();
  localStorage.removeItem("civicflow.hosted.pending-link");
  sessionStorage.clear();
});

describe("desktop email links", () => {
  it("reads the session tokens from a confirmation link", () => {
    const link = parseHostedLink(
      "civicflow://auth/callback#access_token=one&refresh_token=two&type=signup",
    );

    expect(link).toEqual({
      kind: "callback",
      code: null,
      accessToken: "one",
      refreshToken: "two",
      error: null,
    });
  });

  it("reads a recovery link by its host", () => {
    const link = parseHostedLink("civicflow://reset-password?code=abc123");

    expect(link?.kind).toBe("reset");
    expect(link?.code).toBe("abc123");
  });

  it("keeps the provider's error message", () => {
    const link = parseHostedLink(
      "civicflow://auth/callback#error=access_denied&error_description=Link+expired",
    );

    expect(link?.error).toBe("Link expired");
  });

  it("ignores links that do not belong to the app", () => {
    expect(parseHostedLink("https://example.org/auth/callback")).toBeNull();
    expect(parseHostedLink("civicflow://settings")).toBeNull();
    expect(parseHostedLink("not a url")).toBeNull();
  });

  it("splits a fragment the same way the browser callback does", () => {
    expect(hostedTokensInHash("#access_token=one&refresh_token=two")).toEqual({
      accessToken: "one",
      refreshToken: "two",
    });
  });

  it("refuses an absurdly long launch argument", () => {
    const padded = `civicflow://auth/callback#access_token=${"a".repeat(5000)}`;
    expect(parseHostedLink(padded)).toBeNull();
  });
});

describe("callback failures", () => {
  it("reads the reason a desktop link was refused", () => {
    const problem = readHostedProblem(
      "#/auth/callback?error_description=This%20link%20was%20not%20requested%20on%20this%20device",
      "",
    );

    expect(problem).toEqual({
      message: "This link was not requested on this device",
      kind: "other",
    });
  });

  it("reads an error the provider put in the fragment", () => {
    const problem = readHostedProblem("#error=access_denied&error_description=Access+denied", "");

    expect(problem?.kind).toBe("canceled");
  });

  it("tells an expired OAuth request apart from an expired email link", () => {
    expect(
      readHostedProblem(
        "#error=bad_oauth_state&error_description=OAuth+state+parameter+has+expired",
        "",
      )?.kind,
    ).toBe("state");
    expect(
      readHostedProblem(
        "#error=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
        "",
      )?.kind,
    ).toBe("expired");
  });

  it("ignores a callback that carries a session", () => {
    expect(readHostedProblem("#access_token=one&refresh_token=two", "")).toBeNull();
  });

  it("writes a route the callback page reads back", () => {
    const route = hostedProblemRoute("No seat left & no token");

    expect(readHostedProblem(route, "")).toEqual({
      message: "No seat left & no token",
      kind: "other",
    });
  });
});

describe("callback answers that outlive the address", () => {
  it("keeps the tokens a browser return carried", () => {
    const answer = rememberHostedAnswer("", "#access_token=one&refresh_token=two");

    expect(answer).toEqual({ code: null, accessToken: "one", refreshToken: "two" });
    expect(rememberedHostedAnswer()).toEqual(answer);
  });

  it("keeps the code a desktop return carried", () => {
    expect(rememberHostedAnswer("?code=abc123", "")).toEqual({
      code: "abc123",
      accessToken: null,
      refreshToken: null,
    });
  });

  it("has nothing to keep for a bare callback address", () => {
    expect(rememberHostedAnswer("", "")).toBeNull();
    expect(rememberHostedAnswer("", "#/auth/callback")).toBeNull();
    expect(rememberedHostedAnswer()).toBeNull();
  });

  it("drops an answer that sat longer than the provider allows", () => {
    sessionStorage.setItem(
      "civicflow.hosted.answer",
      JSON.stringify({
        code: null,
        accessToken: "one",
        refreshToken: "two",
        at: Date.now() - 11 * 60_000,
      }),
    );

    expect(rememberedHostedAnswer()).toBeNull();
  });

  it("forgets the answer once the hand-off is finished", async () => {
    rememberHostedAnswer("", "#access_token=one&refresh_token=two");

    await finishHostedHandoff();

    expect(rememberedHostedAnswer()).toBeNull();
  });
});

describe("desktop hand-off guard", () => {
  it("reads the mark without spending it", async () => {
    localStorage.setItem(
      "civicflow.hosted.pending-link",
      JSON.stringify({ kind: "callback", at: Date.now() }),
    );

    expect(await hostedHandoffPending("callback")).toBe(true);
    expect(await hostedHandoffPending("callback")).toBe(true);
    await finishHostedHandoff();
    expect(await hostedHandoffPending("callback")).toBe(false);
  });

  it("refuses a link nothing asked for", async () => {
    expect(await hostedHandoffPending("callback")).toBe(false);
  });

  it("refuses a link of the other kind", async () => {
    localStorage.setItem(
      "civicflow.hosted.pending-link",
      JSON.stringify({ kind: "reset", at: Date.now() }),
    );

    expect(await hostedHandoffPending("callback")).toBe(false);
  });

  it("refuses a link that has gone stale", async () => {
    localStorage.setItem(
      "civicflow.hosted.pending-link",
      JSON.stringify({ kind: "callback", at: Date.now() - 2 * 86_400_000 }),
    );

    expect(await hostedHandoffPending("callback")).toBe(false);
  });
});

describe("hosted identity", () => {
  it("uses only the name and email from the provider", () => {
    const user = {
      email: "jordan@example.org",
      user_metadata: { name: "Jordan Reyes", role: "coordinator" },
    } as unknown as User;

    expect(identityFromUser(user)).toEqual({
      name: "Jordan Reyes",
      email: "jordan@example.org",
    });
  });

  it("never reads a role from user metadata", () => {
    const user = {
      email: "jordan@example.org",
      user_metadata: { full_name: "Jordan Reyes", role: "coordinator" },
    } as unknown as User;

    expect(identityFromUser(user)).not.toHaveProperty("role");
  });

  it("recovers the name from a pending sign-up when metadata is missing", () => {
    rememberPendingSignup({
      name: "Alicia Moreno",
      email: "alicia@example.org",
    });

    const inferred = identityFromUser({
      email: "alicia@example.org",
      user_metadata: {},
    } as unknown as User);

    expect(inferred).toEqual({
      name: "Alicia Moreno",
      email: "alicia@example.org",
    });
  });

  it("falls back to the address when no name exists", () => {
    const identity = identityFromUser({
      email: "sam@example.org",
      user_metadata: {},
    } as unknown as User);

    expect(identity?.name).toBe("sam");
  });

  it("uses the name Google puts on the profile", () => {
    const identity = identityFromUser({
      email: "jordan@example.org",
      user_metadata: { full_name: "Jordan Reyes", avatar_url: "https://example.org/a.png" },
    } as unknown as User);

    expect(identity?.name).toBe("Jordan Reyes");
  });

  it("forgets a role left by an older build", () => {
    localStorage.setItem("civicflow.hosted.pending-role", "coordinator");
    clearPendingHostedIdentity();

    const identity = identityFromUser({
      email: "sam@example.org",
      user_metadata: { full_name: "Sam Ortiz" },
    } as unknown as User);

    expect(identity).not.toHaveProperty("role");
  });
});
