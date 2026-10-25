export type Cause = "food" | "education" | "environment" | "health" | "community" | "animals";

export type AccountRole = "coordinator" | "volunteer";

export interface Account {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  volunteerId: string | null;
}

export interface AuthSession {
  token: string;
  user: Account;
  expiresAt: string;
}

type VolunteerStatus = "active" | "onboarding" | "inactive";

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type PeriodKey = "morning" | "afternoon" | "evening";

export interface Organization {
  id: string;
  name: string;
  initials: string;
  mission: string;
  city: string;
  state: string;
  address: string;
  website: string;
  email: string;
  timezone: string;
  /** Cover picture: a bundled sample or a photo the coordinator uploaded. */
  image?: string;
  imageAlt?: string;
}

export interface Person {
  id: string;
  name: string;
  firstName: string;
  initials: string;
  role: string;
  tone: string;
  photo?: string;
}

export interface Coordinator extends Person {
  email: string;
}

export interface AvailabilitySlot {
  day: DayKey;
  period: PeriodKey;
}

export interface Volunteer extends Person {
  birthdate?: string;
  email: string;
  phone: string;
  joinedAt: string;
  status: VolunteerStatus;
  skills: string[];
  languages: string[];
  causes: Cause[];
  hoursVerified: number;
  attendanceRate: number;
  eventsCompleted: number;
  interests: string;
  availability: AvailabilitySlot[];
}

export interface Opportunity {
  id: string;
  slug: string;
  title: string;
  cause: Cause;
  organization: string;
  image: string;
  imageAlt: string;
  description: string;
  address: string;
  distanceMiles: number;
  coordinator: string;
  capacity: number;
  duration: string;
  training: string[];
  requirements: string[];
  impactMetric: string;
}

interface ShiftRole {
  name: string;
  required: number;
  filled: number;
}

export interface Shift {
  id: string;
  opportunityId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  confirmed: number;
  waitlisted: number;
  status: "scheduled" | "completed" | "canceled";
  roles: ShiftRole[];
}

export interface HourEntry {
  id: string;
  volunteerId: string;
  opportunityId: string;
  date: string;
  minutes: number;
  status: "verified" | "pending" | "rejected";
  verificationId: string | null;
}

export interface CoverageDay {
  key: DayKey;
  label: string;
  capacity: number;
  confirmed: number;
  percent: number;
}

export interface ImpactSummary {
  hoursYtd: number;
  hoursThisMonth: number;
  uniqueVolunteersYtd: number;
  activeVolunteers: number;
  mealsPacked: number;
  tutoringSessions: number;
  treesPlanted: number;
  familiesServedThisMonth: number;
  shiftsCompleted: number;
  attendanceRate: number;
}

export interface ActivityItem {
  id: string;
  volunteerId: string;
  name: string;
  action: string;
  detail: string;
  tone: string;
  at: string;
}

export interface NotificationItem {
  id: string;
  kind:
    | "coverage"
    | "waitlist"
    | "hours"
    | "credential"
    | "shift"
    | "WAITLIST_PROMOTED"
    | "SHIFT_CHANGED"
    | "SHIFT_CANCELED"
    | "HOURS_APPROVED"
    | "HOURS_ADJUSTED"
    | "HOURS_SUBMITTED"
    | "CREDENTIAL_EXPIRING"
    | "COVERAGE_REQUEST"
    | string;
  title: string;
  body: string;
  priority: "high" | "normal";
  createdAt: string;
  readAt: string | null;
  href: string;
}

export interface SavedView {
  id: string;
  name: string;
  filters: Record<string, string[] | undefined>;
}

export interface SavedViewRecord {
  id: string;
  scope: string;
  name: string;
  filtersJson: string;
  createdAt: string;
}

export type ApplicationStage = "applied" | "review" | "onboarding" | "active";

export interface Applicant {
  id: string;
  name: string;
  email: string;
  initials: string;
  tone: string;
  stage: ApplicationStage;
  appliedAt: string;
  source: string;
  cause: Cause;
  skills: string[];
  note: string;
}

export type WaitlistStatus = "waiting" | "promoted" | "declined" | "expired" | "removed";

export interface WaitlistEntry {
  id: string;
  shiftId: string;
  volunteerId: string;
  createdAt: string;
  status: WaitlistStatus;
  position: number;
  eligibleRole: string;
}

export type AttendanceStatus = "expected" | "checked_in" | "completed" | "no_show";

export interface AttendanceEntry {
  volunteerId: string;
  shiftId: string;
  role: string;
  status: AttendanceStatus;
  checkedInAt: string | null;
  checkedOutAt: string | null;
}

export type CredentialStatus = "current" | "expiring" | "expired";

export interface Credential {
  id: string;
  volunteerId: string;
  name: string;
  identifier: string;
  issuedAt: string;
  validFrom: string;
  validThrough: string;
  status: CredentialStatus;
  verifiedAt: string | null;
  verifiedBy: string | null;
  notes: string | null;
}

export interface ServiceVerification {
  id: string;
  code: string;
  volunteerId: string;
  organizationId: string;
  dateStart: string;
  dateEnd: string;
  totalMinutes: number;
  issuedAt: string;
  issuedBy: string;
}

export interface ImpactMetric {
  id: string;
  opportunityId: string;
  metricKey: string;
  name: string;
  unit: string;
  value: number;
  recordedAt: string;
}

export interface RetentionCohort {
  label: string;
  eligible: number;
  returned: number;
  rate: number;
}

export interface CheckinCode {
  shiftId: string;
  code: string;
  token: string;
  issuedAt: string;
  expiresAt: string;
  payload: string;
}

export interface ScoreBreakdown {
  skill: number;
  availability: number;
  interest: number;
  preference: number;
  fairness: number;
  reliability: number;
  total: number;
}

export interface PlannedAssignment {
  shiftId: string;
  opportunityId: string;
  shiftTitle: string;
  role: string;
  candidateId: string;
  candidateName: string;
  candidateInitials: string;
  startsAt: string;
  score: number;
  breakdown: ScoreBreakdown;
  reasons: string[];
  promoteWaitlist: boolean;
  eligibleRoles: string[];
}

export interface UnfilledSlot {
  shiftId: string;
  role: string;
  reason: string;
  requiredSkill: string | null;
  requiredCredential: string | null;
}

export interface RosterPlan {
  assignments: PlannedAssignment[];
  unfilled: UnfilledSlot[];
  totalScore: number;
  slotsConsidered: number;
  candidatesConsidered: number;
  deterministicSeed: number;
}

export interface RosterApplyAssignment {
  candidateId: string;
  role: string;
  promoteWaitlist: boolean;
}

export interface RosterOptions {
  preferSpanish: boolean;
  blockConflicts: boolean;
  capWeekly: boolean;
  includeWaitlist: boolean;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  entityType: "volunteer" | "shift" | "opportunity" | "hours" | "settings" | "backup" | "system";
  entityId: string;
  summary: string;
  detail?: string;
}

export interface BackupCounts {
  volunteers: number;
  programs: number;
  shifts: number;
  hours: number;
  notifications: number;
  audit: number;
}

export interface BackupSnapshot {
  id: string;
  createdAt: string;
  kind: "automatic" | "manual";
  bytes: number;
  rows: number;
  note: string;
  counts: BackupCounts;
  sha256: string;
  schemaVersion: number;
  integrity: string;
}

export interface BackupRestoreResult {
  snapshot: SessionSnapshot;
  backups: BackupSnapshot[];
}

export interface ReportRequest {
  template: string;
  fields: string[];
  dateStart?: string | null;
  dateEnd?: string | null;
  cause?: string | null;
  groupBy: "none" | "cause" | "program";
}

export interface ReportSummaryItem {
  label: string;
  value: string;
}

export interface ReportDocument {
  template: string;
  title: string;
  organization: string;
  period: string;
  generatedAt: string;
  headers: string[];
  rows: string[][];
  summary: ReportSummaryItem[];
}

export type ExportFormat = "csv" | "pdf";

export interface ExportReceipt {
  path: string;
  bytes: number;
  format: ExportFormat;
  title: string;
}

export interface WorkspaceSettings {
  organizationName: string;
  contactEmail: string;
  timezone: string;
  weekStartsOn: "monday" | "sunday";
  defaultShiftLength: number;
  autoPromoteWaitlist: boolean;
  hoursRequireApproval: boolean;
  emailDigest: "daily" | "weekly" | "off";
  textScale: "standard" | "large" | "larger";
  highContrast: boolean;
  reducedMotion: boolean;
  underlineLinks: boolean;
  colourIndependent: boolean;
}

export interface HoursDecision {
  status: "verified" | "rejected";
  approvedMinutes: number | null;
  reason: string;
  reviewedAt: string;
}

export interface NewOpportunityInput {
  title: string;
  cause: Cause;
  description: string;
  address: string;
  capacity: number;
  duration: string;
  requirements: string[];
}

export interface RegistrationInput {
  shiftId: string;
  volunteerId: string;
  role: string;
  status: "registered" | "canceled" | "completed" | "no_show";
}

export interface CreateOpportunityResult {
  opportunity: Opportunity;
  snapshot: SessionSnapshot;
}

export interface SessionSnapshot {
  savedOpportunityIds: string[];
  attendance: Record<string, AttendanceEntry[]>;
  hoursDecisions: Record<string, HoursDecision>;
  applications: Applicant[];
  waitlist: WaitlistEntry[];
  settings: WorkspaceSettings;
  createdOpportunities: Opportunity[];
  registrations: RegistrationInput[];
  audit: AuditEvent[];
  volunteerProfile: {
    skills: string[];
    availability: AvailabilitySlot[];
    completedOnboarding: boolean;
    phone?: string;
    interests?: string;
    causes?: Cause[];
    photo?: string;
  };
  credentials: Credential[];
  verifications: ServiceVerification[];
  impactMetrics: ImpactMetric[];
  savedViews: SavedViewRecord[];
  retention: RetentionCohort[];
  checkinCode: CheckinCode | null;
  reportExports?: ExportReceipt[];
}

export interface DemoWorkspace {
  schemaVersion: number;
  demoNow: string;
  organization: Organization;
  coordinator: Coordinator;
  currentVolunteerId: string;
  volunteers: Volunteer[];
  opportunities: Opportunity[];
  shifts: Shift[];
  hourEntries: HourEntry[];
  mayaEntries: HourEntry[];
  credentials: Credential[];
  registrations: RegistrationInput[];
  impactRecords: ImpactMetric[];
  impact: ImpactSummary;
  recentActivity: ActivityItem[];
  notifications: NotificationItem[];
  savedViews: SavedView[];
}

export interface AttentionItem {
  id: string;
  opportunityId: string;
  title: string;
  detail: string;
  cause: Cause;
  severity: "critical" | "warning" | "info";
  href: string;
  sortKey: string;
}

export interface MissionControlSummary {
  coordinatorName: string;
  firstName: string;
  organizationName: string;
  demoNow: string;
  activeVolunteers: number;
  coveragePercent: number;
  hoursThisMonth: number;
  upcomingShifts: number;
  attentionCount: number;
  coverageDays: CoverageDay[];
  attention: AttentionItem[];
  recentActivity: ActivityItem[];
  impact: ImpactSummary;
  unreadNotifications: number;
  photos: string[];
}
