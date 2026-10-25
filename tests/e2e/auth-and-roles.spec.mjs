import { browser, $, expect } from "@wdio/globals";

async function signIn(email, password, role = "coordinator") {
  // Selecting a role only re-renders the form. Dispatching it avoids waiting on
  // a navigation that never happens.
  await browser.execute((wanted) => {
    const button = document.querySelector(`button[data-role="${wanted}"]`);
    if (!(button instanceof HTMLElement)) throw new Error(`role button ${wanted} missing`);
    button.click();
  }, role);
  const emailField = await $('input[name="email"]');
  await emailField.waitForDisplayed();
  await emailField.setValue(email);
  const passwordField = await $('input[name="password"]');
  await passwordField.setValue(password);
  await $('button[type="submit"]').click();
}

/**
 * Click a rendered button by its visible text. Setup is a sequence of
 * re-rendered steps, and a real click would wait on the embedded driver's
 * window probe, so the click is dispatched straight to the React handler.
 */
async function clickButton(label, groupLabel) {
  await browser.execute(
    (wanted, group) => {
      const scope = group ? document.querySelector(`[aria-label="${group}"]`) : document.body;
      const button = [...(scope ?? document.body).querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === wanted,
      );
      if (!(button instanceof HTMLElement)) throw new Error(`button ${wanted} missing`);
      button.click();
    },
    label,
    groupLabel,
  );
}

/** Press the first unpressed toggle in a group, leaving a worked example alone. */
async function pressOne(groupLabel) {
  await browser.execute((group) => {
    const scope = document.querySelector(`[aria-label="${group}"]`);
    const buttons = [...(scope?.querySelectorAll("button") ?? [])];
    if (buttons.length === 0) throw new Error(`toggle group ${group} missing`);
    if (buttons.some((button) => button.getAttribute("aria-pressed") === "true")) return;
    if (!(buttons[0] instanceof HTMLElement)) throw new Error(`toggle group ${group} empty`);
    buttons[0].click();
  }, groupLabel);
}

async function waitForHeading(pattern, message) {
  await browser.waitUntil(
    async () =>
      (await $("h1"))
        .getText()
        .then((text) => pattern.test(text))
        .catch(() => false),
    { timeout: 20_000, timeoutMsg: message },
  );
}

describe("CivicFlow native window", () => {
  it("opens on the sign-in screen when no session exists", async () => {
    await browser.waitUntil(
      async () => (await $('input[name="email"]')).isDisplayed().catch(() => false),
      { timeout: 20_000, timeoutMsg: "sign-in form never appeared" },
    );
    await expect(await $("h1")).toHaveText(/Welcome back/);
  });

  it("signs a coordinator in and reaches Mission Control", async () => {
    await signIn("praket@feedmorewny.org", "civicflow-demo");
    const greeting = await $("#mc-greeting");
    await greeting.waitForDisplayed({ timeout: 20_000 });
    await expect(greeting).toHaveText(/Praket/);
  });

  it("blocks the volunteer workspace for a coordinator", async () => {
    await browser.execute(() => {
      window.location.hash = "#/volunteer/home";
    });
    await browser.waitUntil(
      async () => (await $("#mc-greeting")).isDisplayed().catch(() => false),
      { timeout: 15_000, timeoutMsg: "coordinator was not returned to Mission Control" },
    );
    await expect(await $("#mc-greeting")).toHaveText(/Praket/);
  });

  it("signs out and lets the volunteer account in", async () => {
    // A WebDriver click that triggers a route change can wait on the navigation
    // in the embedded server. Dispatching the click keeps the same React
    // handler and returns as soon as the event is delivered.
    await browser.execute(() => {
      const button = document.querySelector('button[aria-label="Sign out"]');
      if (!(button instanceof HTMLElement)) throw new Error("Sign out button missing");
      button.click();
    });

    const emailField = await $('input[name="email"]');
    await emailField.waitForDisplayed({ timeout: 20_000 });

    await signIn("maya.chen@gmail.com", "civicflow-demo", "volunteer");
    await waitForHeading(/Maya/, "volunteer home did not render");
  });

  it("blocks coordinator routes for a volunteer", async () => {
    await browser.execute(() => {
      window.location.hash = "#/coordinator/coverage";
    });
    await waitForHeading(/Maya/, "volunteer was not returned to volunteer home");
  });

  it("creates a volunteer account and signs it in again", async () => {
    await browser.execute(() => {
      const button = document.querySelector('button[aria-label="Sign out"]');
      if (!(button instanceof HTMLElement)) throw new Error("Sign out button missing");
      button.click();
    });
    const emailField = await $('input[name="email"]');
    await emailField.waitForDisplayed({ timeout: 20_000 });

    await browser.execute(() => {
      window.location.hash = "#/create-account";
    });
    const nameField = await $('input[name="name"]');
    await nameField.waitForDisplayed({ timeout: 20_000 });
    await nameField.setValue("Alicia Moreno");
    await $('input[name="email"]').setValue("alicia.moreno@example.org");
    await $('input[name="new-password"]').setValue("second-saturday");
    await $('input[name="confirm-password"]').setValue("second-saturday");
    await $('button[type="submit"]').click();

    const code = await browser.execute(() => {
      const output = document.querySelector('output[aria-label="Verification code"]');
      return output?.textContent?.trim() ?? "";
    });
    expect(code).toMatch(/^\d{6}$/);
    await $('input[name="verification-code"]').setValue(code);
    await $('button[type="submit"]').click();

    // Setup is a one-time gate: a new account answers four short steps before
    // it can reach a workspace.
    await waitForHeading(/Tell us how you can help/, "the new volunteer did not reach setup");
    const phoneField = await $('input[type="tel"]');
    await phoneField.setValue("716-555-0142");
    await clickButton("Continue");
    await pressOne("Your skills");
    await clickButton("Continue");
    await pressOne("Weekly availability");
    await clickButton("Continue");
    await pressOne("Causes you care about");
    await clickButton("Finish setup");

    // Setup gives the account a profile but no team, so it joins an
    // organization before its own home exists.
    await waitForHeading(/Find a place to serve/, "the new volunteer did not reach discovery");
    await browser.execute(() => {
      const join = [...document.querySelectorAll("li button")].find(
        (button) => button.textContent?.trim() === "Join",
      );
      if (!(join instanceof HTMLElement)) throw new Error("join button missing");
      join.click();
    });
    await waitForHeading(/Alicia/, "the new volunteer did not reach their own home");

    // The account is a real row: it survives a sign-out and a fresh sign-in.
    await browser.execute(() => {
      const button = document.querySelector('button[aria-label="Sign out"]');
      if (!(button instanceof HTMLElement)) throw new Error("Sign out button missing");
      button.click();
    });
    const fields = await $('input[name="email"]');
    await fields.waitForDisplayed({ timeout: 20_000 });
    await signIn("alicia.moreno@example.org", "second-saturday", "volunteer");
    await waitForHeading(/Alicia/, "the new account could not sign in again");
  });
});
