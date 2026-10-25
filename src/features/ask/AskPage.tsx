import { useMemo, useState } from "react";
import { ArrowRight, MessageCircleQuestion, Send, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, Page, PageHeader, ui } from "../../components/ui";
import { ask, suggestedQuestions } from "../../lib/ask/answers";
import type { AskAnswer } from "../../lib/ask/answers";
import { useAuth } from "../../lib/auth/session";
import { currentVolunteer } from "../../lib/workspace/selectors";
import { useWorkspace } from "../../lib/workspace/session";
import styles from "./Ask.module.css";

/**
 * The visible half of Ask CivicFlow. The answer engine is deterministic and
 * runs in this renderer, so the screen only has to collect a question, show the
 * cited rows, and link to the screen where the work happens.
 */
export function AskPage() {
  const { workspace, session } = useWorkspace();
  const { user } = useAuth();
  const role = user?.role === "volunteer" ? "volunteer" : "coordinator";
  const volunteerId = currentVolunteer(workspace).id;

  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<{ question: string; answer: AskAnswer } | null>(null);

  const suggestions = useMemo(() => suggestedQuestions(role), [role]);

  function run(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    setDraft(trimmed);
    setResult({
      question: trimmed,
      answer: ask({ question: trimmed, role, workspace, session, volunteerId }),
    });
  }

  return (
    <Page width="narrow">
      <PageHeader
        eyebrow="Ask CivicFlow"
        title="Ask about this workspace."
        description="Plain questions, answered from the records on this device. Every answer names the rows it read, so you can check it before you act on it."
        actions={
          <span className={styles.headerNote}>
            <ShieldCheck size={14} aria-hidden="true" />
            Local answers only
          </span>
        }
      />

      <Card className={styles.composerCard} padding="loose">
        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            run(draft);
          }}
        >
          <label className="visually-hidden" htmlFor="ask-question">
            Ask a question about this workspace
          </label>
          <input
            id="ask-question"
            className={`${ui.input} ${styles.input}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="e.g. Which shifts are short this week?"
            autoComplete="off"
            spellCheck
          />
          <Button
            type="submit"
            icon={<Send size={14} aria-hidden="true" />}
            disabled={!draft.trim()}
          >
            Ask
          </Button>
        </form>

        <p className={styles.hint}>
          <MessageCircleQuestion size={13} aria-hidden="true" />
          Ask in a sentence. It understands {suggestions.length} questions in this workspace.
        </p>

        <div className={styles.suggestions}>
          <p className={styles.suggestLabel}>Try one of these</p>
          <div className={styles.chips}>
            {suggestions.map((question) => (
              <button
                key={question}
                type="button"
                className={styles.chip}
                onClick={() => run(question)}
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <p className="visually-hidden" role="status">
        {result ? `Answer ready: ${result.answer.headline}` : ""}
      </p>

      {result ? (
        <article className={styles.answerCard} aria-labelledby="ask-answer-headline">
          <div className={styles.answerMeta}>
            <Badge tone={result.answer.matched ? "green" : "amber"} dot>
              {result.answer.matched
                ? result.answer.recordsRead > 0
                  ? "Answered from records"
                  : "From the guide"
                : "Not in this workspace"}
            </Badge>
            <p className={styles.asked}>{result.question}</p>
          </div>

          <h2 className={styles.headline} id="ask-answer-headline">
            {result.answer.headline}
          </h2>
          <p className={styles.summary}>{result.answer.summary}</p>

          {result.answer.citations.length > 0 ? (
            <ul className={styles.citations}>
              {result.answer.citations.map((citation) => {
                const body = (
                  <>
                    <span className={styles.citationLabel}>{citation.label}</span>
                    <span className={styles.citationDetail}>{citation.detail}</span>
                  </>
                );
                return (
                  <li key={`${citation.id}-${citation.label}`} className={styles.citation}>
                    <span
                      className={styles.citationDot}
                      data-tone={citation.tone ?? "neutral"}
                      aria-hidden="true"
                    />
                    {citation.href ? (
                      <Link className={styles.citationLink} to={citation.href}>
                        {body}
                        <ArrowRight className={styles.citationArrow} size={13} aria-hidden="true" />
                      </Link>
                    ) : citation.ask ? (
                      <button
                        type="button"
                        className={`${styles.citationStatic} ${styles.citationAsk}`}
                        onClick={() => run(citation.label)}
                      >
                        {body}
                      </button>
                    ) : (
                      <span className={styles.citationStatic}>{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div className={styles.answerFoot}>
            <p className={styles.provenance}>
              <ShieldCheck size={13} aria-hidden="true" />
              {result.answer.recordsRead > 0
                ? `Read ${result.answer.recordsRead} records on this device.`
                : "Answered without reading any records."}
            </p>
            {result.answer.action ? (
              <Link className={styles.action} to={result.answer.action.href}>
                {result.answer.action.label}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </article>
      ) : (
        <Card surface="flat" className={styles.intro}>
          <p className={styles.introKicker}>
            <Sparkles size={13} aria-hidden="true" />
            How an answer is built
          </p>
          <ul className={styles.introList}>
            <li>
              <strong>No model.</strong> A fixed rule reads the workspace snapshot and totals the
              rows itself, so the same question always returns the same answer.
            </li>
            <li>
              <strong>No network.</strong> Everything runs in this window. Nothing about a volunteer
              leaves the device.
            </li>
            <li>
              <strong>No guessing.</strong> When the records do not cover a question, it says so and
              offers one it can answer.
            </li>
          </ul>
        </Card>
      )}
    </Page>
  );
}
