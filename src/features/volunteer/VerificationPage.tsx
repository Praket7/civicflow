import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { format, parseISO } from "date-fns";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  Copy,
  FileCheck2,
  Printer,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Page,
  PageHeader,
  SectionHeader,
} from "../../components/ui";
import { useWorkspace } from "../../lib/workspace/session";
import {
  currentVolunteer,
  formatMinutes,
  getVerificationRecords,
} from "../../lib/workspace/selectors";
import type { HourRow } from "../../lib/workspace/selectors";
import styles from "./VerificationPage.module.css";

interface MonthGroup {
  label: string;
  records: HourRow[];
}

export function VerificationPage() {
  const { workspace, session } = useWorkspace();
  const volunteer = currentVolunteer(workspace);
  const records = useMemo(
    () => getVerificationRecords(volunteer.id, session, workspace),
    [session, volunteer.id, workspace],
  );
  const [selectedId, setSelectedId] = useState<string>(() => records[0]?.id ?? "");
  const [copyMessage, setCopyMessage] = useState("");

  // The certificate print stylesheet hides the rest of the app. Gate that on
  // this page being mounted, or every other screen prints blank.
  useEffect(() => {
    document.body.dataset.printView = "verification";
    return () => {
      delete document.body.dataset.printView;
    };
  }, []);
  const [printMessage, setPrintMessage] = useState("");
  const [query, setQuery] = useState("");
  const [verifyResult, setVerifyResult] = useState<
    { status: "valid"; record: HourRow } | { status: "not-found" } | null
  >(null);

  const selected = records.find((record) => record.id === selectedId) ?? records[0];
  const totalMinutes = records.reduce(
    (sum, record) => sum + (record.approvedMinutes ?? record.requestedMinutes),
    0,
  );

  const groups = useMemo<MonthGroup[]>(() => {
    const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
    const map = new Map<string, HourRow[]>();
    for (const record of sorted) {
      const key = format(parseISO(record.date), "MMMM yyyy");
      map.set(key, [...(map.get(key) ?? []), record]);
    }
    return [...map.entries()].map(([label, rows]) => ({ label, records: rows }));
  }, [records]);

  async function copyCode() {
    if (!selected?.verificationId) return;
    try {
      await navigator.clipboard.writeText(selected.verificationId);
      setCopyMessage(`Copied ${selected.verificationId} to your clipboard.`);
    } catch {
      setCopyMessage("Copy failed. Select the verification code and copy it manually.");
    }
  }

  function printRecord() {
    setPrintMessage("Opening the print dialog. Choose “Save as PDF” to keep a copy.");
    window.print();
  }

  function verifyRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = query.trim().toUpperCase();
    if (!code) {
      setVerifyResult(null);
      return;
    }
    const found = records.find((record) => record.verificationId?.toUpperCase() === code);
    setVerifyResult(found ? { status: "valid", record: found } : { status: "not-found" });
  }

  if (!selected) {
    return (
      <Page width="narrow">
        <PageHeader
          title="Service Verification"
          description="Official records are generated from approved hours only."
        />
        <Card>
          <EmptyState
            title="No verified service yet"
            copy="Once a coordinator approves your hours, CivicFlow creates a verification record here. Pending hours never appear on a certificate."
            action={<ButtonLink to="/volunteer/hours">Review my hours</ButtonLink>}
          />
        </Card>
      </Page>
    );
  }

  const recordMinutes = selected.approvedMinutes ?? selected.requestedMinutes;
  const serviceDate = format(parseISO(selected.date), "MMMM d, yyyy");
  const issuedDate = format(parseISO(workspace.demoNow), "MMMM d, yyyy");
  const recordsSummary = `${records.length} approved ${
    records.length === 1 ? "record" : "records"
  } · ${formatMinutes(totalMinutes)}`;
  const certificateLabel = `Service verification certificate for ${volunteer.name}`;

  return (
    <Page width="wide">
      <div className={styles.noPrint}>
        <PageHeader
          title="Service Verification"
          description="Generate and manage official records of your volunteer service."
        />
      </div>

      <div className={styles.layout}>
        <Card className={`${styles.recordsCard} ${styles.noPrint}`} padding="compact">
          <SectionHeader title="Your Records" subtitle={recordsSummary} />
          <div className={styles.recordScroll}>
            {groups.map((group) => (
              <section key={group.label} className={styles.group} aria-label={group.label}>
                <p className={styles.groupLabel}>{group.label}</p>
                <ul className={styles.recordList}>
                  {group.records.map((record) => {
                    const active = record.id === selected.id;
                    return (
                      <li key={record.id}>
                        <button
                          type="button"
                          className={`${styles.recordButton} ${active ? styles.recordActive : ""}`}
                          aria-pressed={active}
                          onClick={() => {
                            setSelectedId(record.id);
                            setCopyMessage("");
                            setPrintMessage("");
                          }}
                        >
                          <span
                            className={styles.recordDot}
                            data-cause={record.opportunity.cause}
                            aria-hidden="true"
                          />
                          <span className={styles.recordCopy}>
                            <span className={styles.recordTitle}>{record.opportunity.title}</span>
                            <span className={styles.recordHours}>
                              {formatMinutes(record.approvedMinutes ?? record.requestedMinutes)}{" "}
                              approved
                            </span>
                            <span className={styles.recordCode}>
                              {record.verificationId ?? "Record pending"}
                            </span>
                          </span>
                          <Badge tone="green" dot>
                            Verified
                          </Badge>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          <p className={styles.recordsNote}>
            <ShieldCheck size={13} aria-hidden="true" />
            Only approved service is issued. Pending and rejected hours are excluded.
          </p>
        </Card>

        <Card className={styles.previewCard} padding="compact">
          <div className={styles.previewHead}>
            <SectionHeader title="Document Preview" subtitle="Official verification certificate" />
            <span className={styles.previewTag}>
              <FileCheck2 size={12} aria-hidden="true" />
              Approved record
            </span>
          </div>

          <article className={styles.paper} aria-label={certificateLabel}>
            <div className={styles.paperBrand}>
              <span className={styles.paperMark} aria-hidden="true">
                CF
              </span>
              <span>CivicFlow</span>
            </div>
            <p className={styles.paperKind}>Volunteer Service Verification</p>
            <p className={styles.paperLead}>This certifies that</p>
            <h2 className={styles.paperName}>{volunteer.name}</h2>
            <p className={styles.paperStatement}>
              completed <strong>{formatMinutes(recordMinutes)}</strong> of verified volunteer
              service
            </p>
            <p className={styles.paperOrg}>{workspace.organization.name}</p>

            <dl className={styles.paperMeta}>
              <div>
                <dt>Service date</dt>
                <dd>{serviceDate}</dd>
              </div>
              <div>
                <dt>Verification ID</dt>
                <dd className={styles.code}>{selected.verificationId}</dd>
              </div>
              <div>
                <dt>Issued</dt>
                <dd>{issuedDate}</dd>
              </div>
            </dl>

            <div className={styles.signature}>
              <span className={styles.signatureName}>{workspace.coordinator.name}</span>
              <span className={styles.signatureLine} aria-hidden="true" />
              <span className={styles.signatureRole}>
                Coordinator · {workspace.organization.name}
              </span>
            </div>

            <div className={styles.waves} aria-hidden="true">
              <svg viewBox="0 0 600 110" preserveAspectRatio="none">
                <path
                  d="M0 46 C 110 8 190 84 300 52 C 410 20 500 86 600 40 L600 110 L0 110 Z"
                  fill="#e9edff"
                />
                <path
                  d="M0 70 C 120 38 210 100 320 70 C 430 40 520 104 600 66 L600 110 L0 110 Z"
                  fill="#e0f7ee"
                  opacity="0.9"
                />
                <path
                  d="M0 88 C 130 62 220 112 330 88 C 450 62 540 110 600 86 L600 110 L0 110 Z"
                  fill="#ffe7dd"
                  opacity="0.85"
                />
              </svg>
            </div>
            <span className={styles.seal} aria-hidden="true">
              <Check size={30} strokeWidth={2.6} />
            </span>
          </article>

          <p className={styles.previewNote}>
            <ShieldCheck size={12} aria-hidden="true" />
            Generated from approved hours. The code can be checked by anyone with this record.
          </p>
        </Card>

        <div className={`${styles.statusRail} ${styles.noPrint}`}>
          <Card padding="compact">
            <h2 className={styles.railTitle}>Verification Status</h2>
            <div className={styles.statusHead}>
              <span className={styles.statusIcon} aria-hidden="true">
                <Check size={24} strokeWidth={2.4} />
              </span>
              <div>
                <h2 className={styles.statusTitle}>Verified</h2>
                <p className={styles.statusCopy}>Record is valid and has not been modified.</p>
              </div>
            </div>

            <dl className={styles.statusMeta}>
              <div>
                <dt>Approved</dt>
                <dd>{formatMinutes(recordMinutes)}</dd>
              </div>
              <div>
                <dt>Issued</dt>
                <dd>{issuedDate}</dd>
              </div>
              <div>
                <dt>Reviewed by</dt>
                <dd>{workspace.coordinator.name}</dd>
              </div>
            </dl>

            <div className={styles.statusActions}>
              <Button
                onClick={printRecord}
                icon={<Printer size={14} aria-hidden="true" />}
                className={styles.fullButton}
              >
                Print / save as PDF
              </Button>
              <Button
                variant="secondary"
                onClick={copyCode}
                icon={<Copy size={14} aria-hidden="true" />}
                className={styles.fullButton}
              >
                Copy verification code
              </Button>
            </div>
            <p className={styles.liveRegion} role="status" aria-live="polite">
              {copyMessage || printMessage}
            </p>
          </Card>

          <Card padding="compact">
            <SectionHeader
              title="Verify a Record"
              subtitle="Check a CivicFlow verification code."
            />
            <form className={styles.verifyForm} onSubmit={verifyRecord} noValidate>
              <label className={styles.verifyLabel} htmlFor="verification-code">
                Verification code
              </label>
              <input
                id="verification-code"
                className={styles.verifyInput}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVerifyResult(null);
                }}
                placeholder="CF-2026-1045"
                autoComplete="off"
                spellCheck={false}
              />
              <Button type="submit" variant="secondary" className={styles.verifyButton}>
                Verify code
              </Button>
            </form>

            <div className={styles.verifyResult} aria-live="polite">
              {verifyResult?.status === "valid" ? (
                <div className={styles.verifyValid}>
                  <BadgeCheck size={18} aria-hidden="true" />
                  <div>
                    <p className={styles.verifyValidTitle}>Record verified</p>
                    <p className={styles.verifyResultCopy}>
                      {verifyResult.record.volunteer.name} ·{" "}
                      {formatMinutes(
                        verifyResult.record.approvedMinutes ?? verifyResult.record.requestedMinutes,
                      )}{" "}
                      · {verifyResult.record.opportunity.title}
                    </p>
                  </div>
                </div>
              ) : null}
              {verifyResult?.status === "not-found" ? (
                <div className={styles.verifyInvalid} role="alert">
                  <CalendarDays size={16} aria-hidden="true" />
                  <div>
                    <p className={styles.verifyValidTitle}>No matching record</p>
                    <p className={styles.verifyResultCopy}>
                      Check the code and try again. Only records issued in this workspace can be
                      verified.
                    </p>
                  </div>
                </div>
              ) : null}
              {!verifyResult ? (
                <p className={styles.verifyHint}>
                  Codes are checked locally against approved records — no network required.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
