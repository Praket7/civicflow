import { useMemo, useState } from "react";
import { ArrowRight, Mail, Search, UserPlus, Users } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Page,
  PageHeader,
  SearchField,
  StatCard,
} from "../../components/ui";
import { useWorkspace } from "../../lib/workspace/session";
import {
  PIPELINE_STAGES,
  getApplications,
  getApplicationsByStage,
} from "../../lib/workspace/selectors";
import type { Applicant, ApplicationStage } from "../../types/domain";
import styles from "./Recruitment.module.css";

const NEXT_STAGE: Record<ApplicationStage, ApplicationStage | null> = {
  applied: "review",
  review: "onboarding",
  onboarding: "active",
  active: null,
};

export function ApplicationsPage() {
  const { session, actions, workspace } = useWorkspace();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const applicants = getApplications(session);
  const stages = getApplicationsByStage(session);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return applicants;
    return applicants.filter((applicant) =>
      [applicant.name, applicant.email, applicant.source, ...applicant.skills]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [applicants, query]);

  const selected =
    applicants.find((applicant) => applicant.id === selectedId) ?? filtered[0] ?? null;

  const counts = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    count: applicants.filter((applicant) => applicant.stage === stage.id).length,
  }));

  function advance(applicant: Applicant) {
    const next = NEXT_STAGE[applicant.stage];
    if (!next) return;
    actions.setApplicationStage(applicant.id, next);
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Recruitment"
        title="Recruitment pipeline"
        description="Move applicants from first interest to active service. Activation requires a completed orientation and background check."
        actions={
          <>
            <ButtonLink to="/coordinator/volunteers" variant="secondary" icon={<Users size={14} />}>
              Active volunteers
            </ButtonLink>
            <a
              className="button"
              href={`mailto:${workspace.organization.email}?subject=${encodeURIComponent("Volunteer interest")}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 34,
                padding: "0 13px",
                borderRadius: 9,
                background: "var(--color-cobalt)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 590,
                textDecoration: "none",
              }}
            >
              <UserPlus size={14} aria-hidden="true" /> Invite applicant
            </a>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <StatCard
          icon={Users}
          value={applicants.length}
          label="In pipeline"
          meta="all applicants"
          tone="cobalt"
        />
        <StatCard
          icon={Search}
          value={applicants.filter((applicant) => applicant.stage === "review").length}
          label="In review"
          meta="screening calls"
          tone="amber"
        />
        <StatCard
          icon={UserPlus}
          value={applicants.filter((applicant) => applicant.stage === "onboarding").length}
          label="Onboarding"
          meta="orientation booked"
          tone="violet"
        />
        <StatCard
          icon={ArrowRight}
          value={counts.find((stage) => stage.id === "active")?.count ?? 0}
          label="Activated"
          meta="this cycle"
          tone="green"
        />
      </div>

      <div className={styles.split}>
        <div>
          <div style={{ display: "flex", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Search name, skill, or source…"
              label="Search applicants"
            />
            <Badge tone="neutral">{filtered.length} shown</Badge>
          </div>

          <div className={styles.pipeline}>
            {stages.map((stage) => {
              const stageApplicants = filtered.filter((applicant) => applicant.stage === stage.id);
              return (
                <section className={styles.column} key={stage.id} aria-label={stage.label}>
                  <div className={styles.columnHeader}>
                    <div>
                      <h2 className={styles.columnTitle}>{stage.label}</h2>
                      <p className={styles.columnSub}>{stage.description}</p>
                    </div>
                    <span className={styles.columnCount}>{stageApplicants.length}</span>
                  </div>
                  <div className={styles.cardStack}>
                    {stageApplicants.length === 0 ? (
                      <p className={styles.emptyCopy}>No applicants at this stage.</p>
                    ) : (
                      stageApplicants.map((applicant) => (
                        <article
                          key={applicant.id}
                          className={styles.applicantCard}
                          style={
                            selected?.id === applicant.id
                              ? {
                                  borderColor: "var(--color-cobalt)",
                                  boxShadow: "var(--shadow-card)",
                                }
                              : undefined
                          }
                        >
                          <div className={styles.applicantTop}>
                            <Avatar initials={applicant.initials} tone={applicant.tone} size={30} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <button
                                type="button"
                                onClick={() => setSelectedId(applicant.id)}
                                style={{
                                  border: 0,
                                  padding: 0,
                                  background: "none",
                                  textAlign: "left",
                                }}
                              >
                                <span className={styles.applicantName}>{applicant.name}</span>
                                <span className={styles.applicantMeta} style={{ display: "block" }}>
                                  {applicant.source} · applied {applicant.appliedAt.slice(5, 10)}
                                </span>
                              </button>
                            </div>
                          </div>
                          <p className={styles.applicantNote}>{applicant.note}</p>
                          <div className={styles.applicantFoot}>
                            <Badge tone="neutral">{applicant.skills[0] ?? "General"}</Badge>
                            {NEXT_STAGE[applicant.stage] ? (
                              <button
                                type="button"
                                onClick={() => advance(applicant)}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  height: 25,
                                  padding: "0 8px",
                                  border: "1px solid var(--border-soft)",
                                  borderRadius: 7,
                                  background: "var(--surface-raised)",
                                  fontSize: 12,
                                  fontWeight: 570,
                                }}
                              >
                                Move to{" "}
                                {
                                  PIPELINE_STAGES.find((s) => s.id === NEXT_STAGE[applicant.stage])
                                    ?.label
                                }
                                <ArrowRight size={10} aria-hidden="true" />
                              </button>
                            ) : (
                              <Badge tone="green" dot>
                                Active
                              </Badge>
                            )}
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <aside className={styles.detailPanel} aria-label="Applicant detail">
          <Card padding="compact">
            {selected ? (
              <>
                <div className={styles.detailHead}>
                  <Avatar initials={selected.initials} tone={selected.tone} size={44} />
                  <div>
                    <h2 className={styles.detailName}>{selected.name}</h2>
                    <p className={styles.detailEmail}>{selected.email}</p>
                  </div>
                </div>
                <div className={styles.stageButtons}>
                  <Badge tone={selected.stage === "active" ? "green" : "cobalt"} dot>
                    {PIPELINE_STAGES.find((stage) => stage.id === selected.stage)?.label}
                  </Badge>
                  <Badge tone="neutral">{selected.cause}</Badge>
                </div>
                <dl className={styles.detailRows}>
                  <div className={styles.detailRow}>
                    <dt>Applied</dt>
                    <dd>{selected.appliedAt.slice(0, 10)}</dd>
                  </div>
                  <div className={styles.detailRow}>
                    <dt>Source</dt>
                    <dd>{selected.source}</dd>
                  </div>
                  <div className={styles.detailRow}>
                    <dt>Skills</dt>
                    <dd>{selected.skills.join(", ")}</dd>
                  </div>
                </dl>
                <p className={styles.detailNote}>{selected.note}</p>
                <div className={styles.stageButtons}>
                  <a
                    className={styles.actionButton}
                    href={`mailto:${selected.email}?subject=${encodeURIComponent("Your CivicFlow volunteer application")}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      height: 28,
                      padding: "0 9px",
                      border: "1px solid var(--border-soft)",
                      borderRadius: 7,
                      fontSize: 12.5,
                      textDecoration: "none",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <Mail size={11} aria-hidden="true" /> Email
                  </a>
                  {NEXT_STAGE[selected.stage] ? (
                    <Button size="small" variant="primary" onClick={() => advance(selected)}>
                      Move to{" "}
                      {PIPELINE_STAGES.find((s) => s.id === NEXT_STAGE[selected.stage])?.label}
                    </Button>
                  ) : (
                    <Badge tone="green">Ready to schedule</Badge>
                  )}
                </div>
              </>
            ) : (
              <EmptyState
                title="No applicant selected"
                copy="Choose a card to see contact details, skills, and the next step."
              />
            )}
          </Card>
        </aside>
      </div>
    </Page>
  );
}
