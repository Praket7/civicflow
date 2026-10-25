import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  clearPendingHostedIdentity,
  hostedTokensInHash,
  identityFromUser,
  parseHostedLink,
  rememberPendingRole,
  rememberPendingSignup,
} from "./hosted";

beforeEach(() => {
  clearPendingHostedIdentity();
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
});

describe("hosted identity", () => {
  const user = {
    email: "jordan@example.org",
    user_metadata: { name: "Jordan Reyes", role: "coordinator" },
  } as unknown as User;

  it("uses the name and role stored at sign-up", () => {
    expect(identityFromUser(user)).toEqual({
      name: "Jordan Reyes",
      email: "jordan@example.org",
      role: "coordinator",
    });
  });

  it("recovers the role from a pending sign-up when metadata is missing", () => {
    rememberPendingSignup({
      name: "Alicia Moreno",
      email: "alicia@example.org",
      role: "volunteer",
    });

    const inferred = identityFromUser(
      { email: "alicia@example.org", user_metadata: {} } as unknown as User,
      "coordinator",
    );

    expect(inferred).toEqual({
      name: "Alicia Moreno",
      email: "alicia@example.org",
      role: "volunteer",
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
    const identity = identityFromUser(
      {
        email: "jordan@example.org",
        user_metadata: { full_name: "Jordan Reyes", avatar_url: "https://example.org/a.png" },
      } as unknown as User,
      "volunteer",
    );

    expect(identity?.name).toBe("Jordan Reyes");
  });

  it("keeps the role chosen before the Google hand-off", () => {
    rememberPendingRole("coordinator");

    const identity = identityFromUser(
      {
        email: "jordan@example.org",
        user_metadata: { full_name: "Jordan Reyes" },
      } as unknown as User,
      "volunteer",
    );

    expect(identity?.role).toBe("coordinator");
  });

  it("forgets the hand-off role once the account is adopted", () => {
    rememberPendingRole("coordinator");
    clearPendingHostedIdentity();

    const identity = identityFromUser({
      email: "sam@example.org",
      user_metadata: { full_name: "Sam Ortiz" },
    } as unknown as User);

    expect(identity?.role).toBe("volunteer");
  });
});
