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
});
