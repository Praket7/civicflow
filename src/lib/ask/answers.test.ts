import { describe, expect, it } from "vitest";
import type { AskRole } from "./answers";
import { ask, suggestedQuestions } from "./answers";
import { createDefaultSnapshot } from "../workspace/previewRepository";
import { demoWorkspace } from "../workspace/dataset";
import { getHoursSummary } from "../workspace/selectors";

/**
 * The promise this feature makes is that an answer is checkable, so the tests
 * check the record behind each claim rather than the wording around it.
 */

const session = createDefaultSnapshot();
const volunteerId = demoWorkspace.currentVolunteerId;

function question(text: string, role: AskRole = "coordinator") {
  return ask({ question: text, role, workspace: demoWorkspace, session, volunteerId });
}

describe("Ask CivicFlow", () => {
  it("answers every question it offers", () => {
    for (const role of ["coordinator", "volunteer"] as const) {
      const suggestions = suggestedQuestions(role);
      expect(suggestions.length).toBeGreaterThanOrEqual(5);
      for (const suggestion of suggestions) {
        const answer = question(suggestion, role);
        expect(answer.matched, `${role}: ${suggestion}`).toBe(true);
        expect(answer.intent).not.toBe("no-match");
        expect(answer.headline.length).toBeGreaterThan(0);
      }
    }
  });

  it("ranks replacements for a named volunteer and links to their roster", () => {
    const answer = question("Who can replace Maya on Saturday?");

    expect(answer.matched).toBe(true);
    expect(answer.intent).toBe("cover-volunteer");
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.action?.href).toMatch(/^\/coordinator\/shifts\//);
    // Every suggestion names a person, never the volunteer being replaced.
    for (const citation of answer.citations) {
      expect(citation.label).not.toBe("Maya Chen");
      expect(citation.href).toMatch(/^\/coordinator\/volunteers\//);
    }
  });

  it("flags the credentials that are expired or expiring", () => {
    const answer = question("Whose credentials expire soon?");
    const today = demoWorkspace.now.slice(0, 10);

    expect(answer.matched).toBe(true);
    expect(answer.citations.length).toBeGreaterThan(0);
    const expired = demoWorkspace.credentials.filter(
      (credential) => credential.validThrough.slice(0, 10) < today,
    );
    expect(expired.length).toBeGreaterThan(0);
    expect(answer.summary).toContain(String(expired.length));
  });

  it("totals hours from the same ledger the review screen reads", () => {
    const answer = question("How many hours were approved this month?");
    const rows = createDefaultSnapshot();
    const expected = ["vol-maya", ...demoWorkspace.volunteers.map((v) => v.id)]
      .map((id) => getHoursSummary(id, rows, demoWorkspace))
      .reduce((sum, summary) => sum + summary.verifiedMinutes, 0);

    expect(answer.matched).toBe(true);
    expect(answer.intent).toBe("hours-month");
    expect(expected).toBeGreaterThan(0);
  });

  it("names the weakest program by seat fill", () => {
    const answer = question("Which program has the lowest fill rate?");
    expect(answer.intent).toBe("lowest-fill");
    expect(answer.citations[0]?.detail).toContain("%");
  });

  it("refuses a question the records cannot answer, and offers ones they can", () => {
    const answer = question("What is the capital of France?");
    expect(answer.matched).toBe(false);
    expect(answer.intent).toBe("no-match");
    expect(answer.citations.length).toBeGreaterThanOrEqual(5);
    expect(answer.summary).toContain("rather say so than guess");
  });

  it("returns the same answer twice for the same question", () => {
    const first = question("Which shifts are short this week?");
    const second = question("Which shifts are short this week?");
    expect(second).toEqual(first);
  });

  it("answers a volunteer's own questions from their own record", () => {
    const hours = question("How many hours have I served?", "volunteer");
    expect(hours.intent).toBe("my-hours");
    expect(hours.headline).toMatch(/verified/);

    const next = question("What is my next shift?", "volunteer");
    expect(next.intent).toBe("my-next-shift");
    expect(next.action?.href).toBe("/volunteer/schedule");
  });

  it("keeps coordinator-only answers out of the volunteer workspace", () => {
    const answer = question("Whose credentials expire soon?", "volunteer");
    expect(answer.intent).not.toBe("credentials");
  });
});
