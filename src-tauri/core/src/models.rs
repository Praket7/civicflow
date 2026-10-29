use serde::{Deserialize, Serialize};

/* ------------------------------------------------------------------ */
/* UI DTOs — field names are camelCase to match the TypeScript client. */
/* ------------------------------------------------------------------ */

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CoverageDay {
    pub key: String,
    pub label: String,
    pub capacity: i64,
    pub confirmed: i64,
    pub percent: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AttentionItem {
    pub id: String,
    pub opportunity_id: String,
    pub title: String,
    pub detail: String,
    pub cause: String,
    pub severity: String,
    pub href: String,
    pub sort_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActivityItem {
    pub id: String,
    pub volunteer_id: String,
    pub name: String,
    pub action: String,
    pub detail: String,
    pub tone: String,
    pub at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImpactSummary {
    pub hours_ytd: i64,
    pub hours_this_month: i64,
    pub unique_volunteers_ytd: i64,
    pub active_volunteers: i64,
    pub meals_packed: i64,
    pub tutoring_sessions: i64,
    pub trees_planted: i64,
    pub families_served_this_month: i64,
    pub shifts_completed: i64,
    pub attendance_rate: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionControlSummary {
    pub coordinator_name: String,
    pub first_name: String,
    pub organization_name: String,
    pub now: String,
    pub active_volunteers: i64,
    pub coverage_percent: u8,
    pub hours_this_month: i64,
    pub upcoming_shifts: i64,
    pub attention_count: usize,
    pub coverage_days: Vec<CoverageDay>,
    pub attention: Vec<AttentionItem>,
    pub recent_activity: Vec<ActivityItem>,
    pub impact: ImpactSummary,
    pub unread_notifications: usize,
    pub photos: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationItem {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub priority: String,
    pub created_at: String,
    pub read_at: Option<String>,
    pub href: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceHealth {
    pub schema_version: i64,
    pub integrity: String,
    pub volunteer_count: i64,
    pub opportunity_count: i64,
    pub shift_count: i64,
    pub now: String,
    pub timezone: String,
}

/* ------------------------------------------------------------------ */
/* Seed models                                                        */
/* ------------------------------------------------------------------ */

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedWorkspace {
    pub schema_version: i64,
    pub now: String,
    pub current_volunteer_id: String,
    pub organization: SeedOrganization,
    pub coordinator: SeedCoordinator,
    pub volunteers: Vec<SeedVolunteer>,
    pub opportunities: Vec<SeedOpportunity>,
    pub shifts: Vec<SeedShift>,
    pub hour_entries: Vec<SeedHourEntry>,
    pub maya_entries: Vec<SeedHourEntry>,
    pub impact: SeedImpact,
    pub recent_activity: Vec<SeedActivity>,
    pub notifications: Vec<SeedNotification>,
    #[serde(default)]
    pub credentials: Vec<SeedCredential>,
    #[serde(default)]
    pub registrations: Vec<SeedRegistration>,
    #[serde(default)]
    pub impact_records: Vec<SeedImpactRecord>,
    #[serde(default)]
    pub saved_views: Vec<SeedSavedView>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedOrganization {
    pub id: String,
    pub name: String,
    pub initials: String,
    pub mission: String,
    pub city: String,
    pub state: String,
    pub address: String,
    pub website: String,
    pub email: String,
    pub timezone: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SeedCoordinator {
    pub id: String,
    pub name: String,
    #[serde(rename = "firstName")]
    pub first_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedVolunteer {
    pub id: String,
    pub name: String,
    pub first_name: String,
    pub initials: String,
    pub role: String,
    pub email: String,
    pub phone: String,
    pub joined_at: String,
    pub status: String,
    pub tone: String,
    #[serde(default)]
    pub birthdate: Option<String>,
    pub skills: Vec<String>,
    pub languages: Vec<String>,
    pub causes: Vec<String>,
    pub hours_verified: f64,
    pub attendance_rate: i64,
    pub events_completed: i64,
    pub interests: String,
    pub availability: Vec<SeedAvailability>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SeedAvailability {
    pub day: String,
    pub period: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedOpportunity {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub cause: String,
    pub organization: String,
    pub image: String,
    pub image_alt: String,
    pub description: String,
    pub address: String,
    pub distance_miles: f64,
    pub coordinator: String,
    pub capacity: i64,
    pub duration: String,
    pub training: Vec<String>,
    pub requirements: Vec<String>,
    pub impact_metric: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedShift {
    pub id: String,
    pub opportunity_id: String,
    pub starts_at: String,
    pub ends_at: String,
    pub capacity: i64,
    pub confirmed: i64,
    pub waitlisted: i64,
    pub status: String,
    pub roles: Vec<SeedRole>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SeedRole {
    pub name: String,
    pub required: i64,
    pub filled: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedHourEntry {
    pub id: String,
    pub volunteer_id: String,
    pub opportunity_id: String,
    pub date: String,
    pub minutes: i64,
    pub status: String,
    pub verification_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedImpact {
    pub hours_ytd: i64,
    pub unique_volunteers_ytd: i64,
    pub meals_packed: i64,
    pub tutoring_sessions: i64,
    pub trees_planted: i64,
    pub families_served_this_month: i64,
    pub shifts_completed: i64,
    pub attendance_rate: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedCredential {
    pub id: String,
    pub volunteer_id: String,
    pub name: String,
    pub identifier: String,
    pub issued_at: String,
    pub valid_from: String,
    pub valid_through: String,
    pub verified_at: Option<String>,
    pub verified_by: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedRegistration {
    pub shift_id: String,
    pub volunteer_id: String,
    pub role: String,
    #[serde(default = "default_registration_status")]
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedImpactRecord {
    pub id: String,
    pub opportunity_id: String,
    pub metric_key: String,
    pub name: String,
    pub unit: String,
    pub value: f64,
    pub recorded_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedSavedView {
    pub id: String,
    pub name: String,
    pub filters: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SeedActivity {
    pub id: String,
    #[serde(rename = "volunteerId")]
    pub volunteer_id: String,
    pub name: String,
    pub action: String,
    pub detail: String,
    pub tone: String,
    pub at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedNotification {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub priority: String,
    pub created_at: String,
    pub read_at: Option<String>,
    pub href: String,
}

impl SeedWorkspace {
    pub fn parse(raw: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(raw)
    }
}

impl SeedWorkspace {
    /// The demo clock plus the coordinator identity live in app_settings so the
    /// read models never depend on compile-time constants.
    pub fn settings(&self) -> Vec<(String, String)> {
        vec![
            (crate::clock::CLOCK_SETTING.into(), self.now.clone()),
            ("coordinator_name".into(), self.coordinator.name.clone()),
            (
                "coordinator_first_name".into(),
                self.coordinator.first_name.clone(),
            ),
            ("schema_version".into(), self.schema_version.to_string()),
            (
                "current_volunteer_id".into(),
                self.current_volunteer_id.clone(),
            ),
        ]
    }
}

/* ------------------------------------------------------------------ */
/* Workflow DTOs — the single snapshot the screens read and mutate.   */
/* ------------------------------------------------------------------ */

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSettings {
    pub organization_name: String,
    pub contact_email: String,
    pub timezone: String,
    pub week_starts_on: String,
    pub default_shift_length: i64,
    pub auto_promote_waitlist: bool,
    pub hours_require_approval: bool,
    pub email_digest: String,
    pub text_scale: String,
    pub high_contrast: bool,
    pub reduced_motion: bool,
    pub underline_links: bool,
    pub colour_independent: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub organization_name: Option<String>,
    pub contact_email: Option<String>,
    pub timezone: Option<String>,
    pub week_starts_on: Option<String>,
    pub default_shift_length: Option<i64>,
    pub auto_promote_waitlist: Option<bool>,
    pub hours_require_approval: Option<bool>,
    pub email_digest: Option<String>,
    pub text_scale: Option<String>,
    pub high_contrast: Option<bool>,
    pub reduced_motion: Option<bool>,
    pub underline_links: Option<bool>,
    pub colour_independent: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Applicant {
    pub id: String,
    pub name: String,
    pub email: String,
    pub initials: String,
    pub tone: String,
    pub stage: String,
    pub applied_at: String,
    pub source: String,
    pub cause: String,
    pub skills: Vec<String>,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WaitlistEntry {
    pub id: String,
    pub shift_id: String,
    pub volunteer_id: String,
    pub created_at: String,
    pub status: String,
    pub position: i64,
    pub eligible_role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Registration {
    pub shift_id: String,
    pub volunteer_id: String,
    pub role: String,
    #[serde(default = "default_registration_status")]
    pub status: String,
}

fn default_registration_status() -> String {
    "registered".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceEntry {
    pub volunteer_id: String,
    pub shift_id: String,
    pub role: String,
    pub status: String,
    pub checked_in_at: Option<String>,
    pub checked_out_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HoursDecision {
    pub status: String,
    pub approved_minutes: Option<i64>,
    pub reason: String,
    pub reviewed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub id: String,
    pub at: String,
    pub actor: String,
    pub action: String,
    pub entity_type: String,
    pub entity_id: String,
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CredentialRecord {
    pub id: String,
    pub volunteer_id: String,
    pub name: String,
    pub identifier: String,
    pub issued_at: String,
    pub valid_from: String,
    pub valid_through: String,
    pub status: String,
    pub verified_at: Option<String>,
    pub verified_by: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServiceVerification {
    pub id: String,
    pub code: String,
    pub volunteer_id: String,
    pub organization_id: String,
    pub date_start: String,
    pub date_end: String,
    pub total_minutes: i64,
    pub issued_at: String,
    pub issued_by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImpactMetric {
    pub id: String,
    pub opportunity_id: String,
    pub metric_key: String,
    pub name: String,
    pub unit: String,
    pub value: f64,
    pub recorded_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavedView {
    pub id: String,
    pub scope: String,
    pub name: String,
    pub filters_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RetentionCohort {
    pub label: String,
    pub eligible: i64,
    pub returned: i64,
    pub rate: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CheckinCode {
    pub shift_id: String,
    pub code: String,
    pub token: String,
    pub issued_at: String,
    pub expires_at: String,
    pub payload: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AvailabilitySlot {
    pub day: String,
    pub period: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VolunteerProfile {
    pub skills: Vec<String>,
    pub availability: Vec<AvailabilitySlot>,
    pub completed_onboarding: bool,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub interests: String,
    #[serde(default)]
    pub causes: Vec<String>,
    #[serde(default)]
    pub photo: String,
}

/// Everything the setup flow can write in one pass.
#[derive(Debug, Clone, Default)]
pub struct VolunteerProfilePatch {
    pub skills: Vec<String>,
    pub availability: Vec<AvailabilitySlot>,
    pub completed_onboarding: bool,
    pub phone: String,
    pub interests: String,
    pub causes: Vec<String>,
    pub photo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpportunityRecord {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub cause: String,
    pub organization: String,
    pub image: String,
    pub image_alt: String,
    pub description: String,
    pub address: String,
    pub distance_miles: f64,
    pub coordinator: String,
    pub capacity: i64,
    pub duration: String,
    pub training: Vec<String>,
    pub requirements: Vec<String>,
    pub impact_metric: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewOpportunityInput {
    pub title: String,
    pub cause: String,
    pub description: String,
    pub address: String,
    pub capacity: i64,
    pub duration: String,
    pub requirements: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOpportunityResult {
    pub opportunity: OpportunityRecord,
    pub snapshot: WorkspaceSnapshot,
}

/// One roster record as the database holds it. The bundled seed authors its own
/// display fields, so this carries what SQLite owns: identity, contact, status,
/// and the lists the matching engine reads. A screen turns it into the shape it
/// renders, and a coordinator sees the whole roster while a volunteer sees only
/// their own row.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RosterVolunteer {
    pub id: String,
    pub name: String,
    pub email: String,
    pub phone: String,
    pub status: String,
    pub joined_at: String,
    pub skills: Vec<String>,
    pub availability: Vec<String>,
    pub causes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub saved_opportunity_ids: Vec<String>,
    pub attendance: std::collections::BTreeMap<String, Vec<AttendanceEntry>>,
    pub hours_decisions: std::collections::BTreeMap<String, HoursDecision>,
    pub applications: Vec<Applicant>,
    pub waitlist: Vec<WaitlistEntry>,
    pub settings: WorkspaceSettings,
    pub created_opportunities: Vec<OpportunityRecord>,
    pub registrations: Vec<Registration>,
    pub audit: Vec<AuditEvent>,
    pub volunteer_profile: VolunteerProfile,
    pub credentials: Vec<CredentialRecord>,
    pub verifications: Vec<ServiceVerification>,
    pub impact_metrics: Vec<ImpactMetric>,
    pub saved_views: Vec<SavedView>,
    pub retention: Vec<RetentionCohort>,
    pub checkin_code: Option<CheckinCode>,
    pub roster: Vec<RosterVolunteer>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupCounts {
    pub volunteers: i64,
    pub programs: i64,
    pub shifts: i64,
    pub hours: i64,
    pub notifications: i64,
    pub audit: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupSnapshot {
    pub id: String,
    pub created_at: String,
    pub kind: String,
    pub bytes: i64,
    pub rows: i64,
    pub note: String,
    pub counts: BackupCounts,
    pub sha256: String,
    pub schema_version: i64,
    pub integrity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRestoreResult {
    pub snapshot: WorkspaceSnapshot,
    pub backups: Vec<BackupSnapshot>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedWorkflow {
    pub saved_opportunity_ids: Vec<String>,
    pub waitlist: Vec<WaitlistEntry>,
    pub applications: Vec<Applicant>,
    pub audit: Vec<AuditEvent>,
    pub settings: WorkspaceSettings,
}

impl SeedWorkflow {
    pub fn parse(raw: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(raw)
    }
}
