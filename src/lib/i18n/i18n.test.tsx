import { format, parseISO } from "date-fns";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleFrame, LocaleProvider, t, useLocale } from "./index";

function StandaloneCopy() {
  return <span data-testid="standalone-copy">{t("Open workspace")}</span>;
}

function Harness() {
  const { locale, meta, setLocale } = useLocale();
  return (
    <>
      <button type="button" onClick={() => setLocale("de")}>
        Deutsch
      </button>
      <button type="button" onClick={() => setLocale("ar")}>
        العربية
      </button>
      <span data-testid="schedule">{t("Schedule")}</span>
      <span data-testid="locale">{locale}</span>
      <span data-testid="direction">{meta.dir}</span>
    </>
  );
}

afterEach(() => {
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
});

describe("locale switching", () => {
  it("translates visible copy, dates, and direction without reloading", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <Harness />
        <LocaleFrame>
          <StandaloneCopy />
        </LocaleFrame>
      </LocaleProvider>,
    );

    expect(screen.getByTestId("schedule")).toHaveTextContent("Schedule");

    await user.click(screen.getByRole("button", { name: "Deutsch" }));
    await waitFor(() => {
      expect(screen.getByTestId("schedule")).toHaveTextContent("Zeitplan");
    });
    expect(screen.getByTestId("locale")).toHaveTextContent("de");
    expect(screen.getByTestId("standalone-copy")).toHaveTextContent("Arbeitsbereich öffnen");
    expect(document.documentElement.lang).toBe("de");
    expect(document.documentElement.dir).toBe("ltr");
    expect(format(parseISO("2026-10-12"), "EEEE")).toBe("Montag");

    await user.click(screen.getByRole("button", { name: "العربية" }));
    await waitFor(
      () => {
        expect(document.documentElement.dir).toBe("rtl");
      },
      { timeout: 5000 },
    );
    expect(screen.getByTestId("schedule")).not.toHaveTextContent("Schedule");
    expect(format(parseISO("2026-10-12"), "EEEE")).not.toBe("Monday");
  });
});
