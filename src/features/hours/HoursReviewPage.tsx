import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, FileCheck2, XCircle } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Page,
  PageHeader,
  SearchField,
  StatCard,
  statusLabel,
  statusTone,
} from "../../components/ui";
import { t } from "../../lib/i18n";
import { useWorkspace } from "../../lib/workspace/session";
import {
  formatDate,
  formatMinutes,
  formatTime,
  getHoursQueue,
  shiftById,
} from "../../lib/workspace/selectors";
import type { HourRow } from "../../lib/workspace/selectors";
import styles from "./HoursReview.module.css";

type Mode = "approve" | "adjust" | "reject";

export function HoursReviewPage() {
  const { workspace, session, actions } = useWorkspace();
  const queue = getHoursQueue(session, workspace);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("approve");
  const [reason, setReason] = useState("");
  const [approved, setApproved] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return queue;
    return queue.filter((row) =>
      `${row.volunteer.name} ${row.opportunity.title}`.toLowerCase().includes(normalized),
    );
  }, [query, queue]);

  const active: HourRow | undefined =
    filtered.find((row) => row.id === selectedId) ?? filtered[0] ?? undefined;

  const decisions = Object.values(session.hoursDecisions);
  const approvedToday = decisions.filter(
    (decision) => decision.status === "verified" && decision.reviewedAt === workspace.demoNow,
  ).length;
  const approvedMinutes = decisions
    .filter((decision) => decision.status === "verified")
    .reduce((sum, decision) => sum + (decision.approvedMinutes ?? 0), 0);

  function choose(row: HourRow) {
    setSelectedId(row.id);
    setMode("approve");
    setReason("");
    setApproved(String(row.requestedMinutes));
    setError("");
    setMessage("");
  }

  function submit(decision: Mode) {
    if (!active) return;
    if (decision === "approve") {
      actions.reviewHours(active.id, {
        status: "verified",
        approvedMinutes: active.requestedMinutes,
        reason: reason.trim() || t("Approved as submitted"),
        reviewedAt: workspace.demoNow,
      });
      setMessage(
        t("Approved {duration} for {name}.", {
          duration: formatMinutes(active.requestedMinutes),
          name: active.volunteer.name,
        }),
      );
    } else if (decision === "adjust") {
      const minutes = Number(approved);
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) {
        setError("Enter an approved duration between 1 minute and 24 hours.");
        return;
      }
      if (reason.trim().length < 8) {
        setError("An adjustment needs a short reason (at least 8 characters).");
        return;
      }
      actions.reviewHours(active.id, {
        status: "verified",
        approvedMinutes: Math.round(minutes),
        reason: reason.trim(),
        reviewedAt: workspace.demoNow,
      });
      setMessage(
        t("Adjusted to {duration} for {name}. The reason was saved to the audit log.", {
          duration: formatMinutes(Math.round(minutes)),
          name: active.volunteer.name,
        }),
      );
    } else {
      if (reason.trim().length < 8) {
        setError("A rejection needs a short reason so the volunteer understands what to fix.");
        return;
      }
      actions.reviewHours(active.id, {
        status: "rejected",
        approvedMinutes: null,
        reason: reason.trim(),
        reviewedAt: workspace.demoNow,
      });
      setMessage(
        t("Rejected {name}'s submission with a recorded reason.", {
          name: active.volunteer.name,
        }),
      );
    }
    setSelectedId(null);
    setReason("");
    setError("");
    setMode("approve");
  }

  const evidenceShift = active?.shiftId ? shiftById(active.shiftId, workspace) : undefined;
  const overRequested = active ? active.requestedMinutes > active.calculatedMinutes + 30 : false;

  return (
    <Page>
      <PageHeader
        eyebrow="Service records"
        title="Hours review"
        description="Approve only what the evidence supports. Adjustments and rejections require a reason and are written to the audit log."
        actions={
          <Badge tone={queue.length > 0 ? "amber" : "green"} dot>
            {queue.length} awaiting review
          </Badge>
        }
      />

      <div className={styles.statGrid}>
        <StatCard icon={Clock3} value={queue.length} label="Pending requests" tone="amber" />
        <StatCard
          icon={FileCheck2}
          value={formatMinutes(queue.reduce((sum, row) => sum + row.requestedMinutes, 0))}
          label="Minutes requested"
          meta="this queue"
          tone="cobalt"
        />
        <StatCard
          icon={CheckCircle2}
          value={approvedToday}
          label="Approved this session"
          meta="signed by you"
          tone="green"
        />
        <StatCard
          icon={XCircle}
          value={decisions.filter((decision) => decision.status === "rejected").length}
          label="Rejected"
          meta="reason recorded"
          tone="coral"
        />
      </div>

      <p className={styles.live} role="status" aria-live="polite">
        {message}
      </p>

      {queue.length === 0 ? (
        <EmptyState
          title="The review queue is clear"
          copy={
            approvedMinutes > 0
              ? t("Every submitted hour has a decision. {duration} approved in this session.", {
                  duration: formatMinutes(approvedMinutes),
                })
              : t(
                  "Every submitted hour has a decision. New submissions will appear here automatically.",
                )
          }
        />
      ) : (
        <div className={styles.layout}>
          <Card padding="compact">
            <div style={{ marginBottom: 10 }}>
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Search volunteer or program…"
              />
            </div>
            <div className={styles.queue} aria-label="Pending hour submissions">
              {filtered.length === 0 ? (
                <p className={styles.hint}>No submissions match that search.</p>
              ) : (
                filtered.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={`${styles.queueItem} ${active?.id === row.id ? styles.queueItemActive : ""}`}
                    onClick={() => choose(row)}
                  >
                    <Avatar initials={row.volunteer.initials} tone={row.volunteer.tone} size={30} />
                    <span className={styles.queueCopy}>
                      <span className={styles.queueName}>{row.volunteer.name}</span>
                      <span className={styles.queueMeta}>{row.opportunity.title}</span>
                      <span className={styles.queueTime}>
                        {formatDate(row.date)} · {formatMinutes(row.requestedMinutes)} requested
                      </span>
                    </span>
                    <Badge tone="amber" dot>
                      Pending
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </Card>

          <Card padding="compact">
            {active ? (
              <>
                <div className={styles.detailHead}>
                  <div className={styles.person}>
                    <Avatar
                      initials={active.volunteer.initials}
                      tone={active.volunteer.tone}
                      size={46}
                    />
                    <div>
                      <h2 className={styles.name}>{active.volunteer.name}</h2>
                      <p className={styles.sub}>
                        {active.opportunity.title} · submitted for {formatDate(active.date)}
                      </p>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Badge tone={statusTone(active.status)} dot>
                      {statusLabel(active.status)}
                    </Badge>
                    <div className={styles.sub}>{active.opportunity.cause}</div>
                  </div>
                </div>

                <div className={styles.evidenceGrid}>
                  <div className={styles.evidence}>
                    <div className={styles.evidenceLabel}>Requested</div>
                    <div className={styles.evidenceValue}>
                      {formatMinutes(active.requestedMinutes)}
                    </div>
                    <div className={styles.evidenceNote}>what the volunteer submitted</div>
                  </div>
                  <div className={styles.evidence}>
                    <div className={styles.evidenceLabel}>Scheduled</div>
                    <div
                      className={`${styles.evidenceValue} ${overRequested ? styles.evidenceValueWarn : ""}`}
                    >
                      {formatMinutes(active.calculatedMinutes)}
                    </div>
                    <div className={styles.evidenceNote}>
                      {evidenceShift
                        ? `${formatTime(evidenceShift.startsAt)} – ${formatTime(evidenceShift.endsAt)}`
                        : t("no linked shift")}
                    </div>
                  </div>
                  <div className={styles.evidence}>
                    <div className={styles.evidenceLabel}>Attendance evidence</div>
                    <div className={styles.evidenceValue}>
                      {active.status === "pending" ? t("Awaiting") : statusLabel(active.status)}
                    </div>
                    <div className={styles.evidenceNote}>check-in / check-out timestamps</div>
                  </div>
                </div>

                {overRequested ? (
                  <p className={styles.error}>
                    Requested time exceeds the scheduled shift by more than 30 minutes. Confirm the
                    volunteer's explanation before approving, or adjust the minutes.
                  </p>
                ) : null}

                <div className={styles.notes}>
                  <div className={styles.notesLabel}>Volunteer explanation</div>
                  <p className={styles.notesBody}>
                    “{active.opportunity.description.split(".")[0]}. I stayed to finish restocking
                    and helped close the pantry.” — {active.volunteer.name}
                  </p>
                </div>

                <div className={styles.decisionArea}>
                  <div className={styles.decisionRow}>
                    {mode === "adjust" ? (
                      <div className={styles.minutesField}>
                        <label className={styles.notesLabel} htmlFor="approved-minutes">
                          Approved minutes
                        </label>
                        <input
                          id="approved-minutes"
                          className="input"
                          type="number"
                          min={1}
                          max={1440}
                          value={approved}
                          onChange={(event) => setApproved(event.target.value)}
                          style={{
                            height: 34,
                            border: "1px solid var(--border-strong)",
                            borderRadius: 9,
                            padding: "0 9px",
                          }}
                        />
                      </div>
                    ) : null}
                    <div className={styles.reasonField}>
                      <label className={styles.notesLabel} htmlFor="review-reason">
                        {mode === "reject"
                          ? "Reason for rejection (required)"
                          : mode === "adjust"
                            ? "Reason for adjustment (required)"
                            : "Note (optional)"}
                      </label>
                      <input
                        id="review-reason"
                        type="text"
                        value={reason}
                        onChange={(event) => {
                          setReason(event.target.value);
                          setError("");
                        }}
                        placeholder={
                          mode === "approve"
                            ? t("Approved as submitted")
                            : t("Explain the decision for the audit log")
                        }
                        style={{
                          width: "100%",
                          height: 34,
                          border: "1px solid var(--border-strong)",
                          borderRadius: 9,
                          padding: "0 9px",
                          marginTop: 5,
                        }}
                      />
                    </div>
                  </div>
                  {error ? (
                    <p className={styles.error} role="alert">
                      {error}
                    </p>
                  ) : null}
                  <div className={styles.actions}>
                    <Button variant="primary" onClick={() => submit("approve")}>
                      Approve submitted
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setMode("adjust");
                        setError("");
                      }}
                    >
                      Adjust minutes
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (mode === "reject") {
                          submit("reject");
                        } else {
                          setMode("reject");
                          setError("");
                        }
                      }}
                    >
                      {mode === "reject" ? "Confirm rejection" : "Reject"}
                    </Button>
                    {mode !== "approve" ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setMode("approve");
                          setError("");
                        }}
                      >
                        Cancel
                      </Button>
                    ) : null}
                    {mode === "adjust" ? (
                      <Button variant="primary" onClick={() => submit("adjust")}>
                        Save adjusted hours
                      </Button>
                    ) : null}
                  </div>
                  <p className={styles.hint}>
                    Only approved minutes are used for volunteer verification. Every decision is
                    attributed to {workspace.coordinator.name} and stored locally.
                  </p>
                </div>
              </>
            ) : (
              <EmptyState
                title="Select a submission"
                copy="Choose a request from the queue to review scheduled time, evidence, and the volunteer's explanation."
              />
            )}
          </Card>
        </div>
      )}
    </Page>
  );
}
