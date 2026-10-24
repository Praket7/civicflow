use std::path::PathBuf;
use std::sync::Mutex;

use civicflow_core::auth::{Account, AuthSession};
use civicflow_core::error::{AppError, CoreError};
use civicflow_core::matching::{RosterOptions, RosterPlan};
use civicflow_core::models::{
    AvailabilitySlot, BackupRestoreResult, BackupSnapshot, CheckinCode, CreateOpportunityResult,
    MissionControlSummary, NewOpportunityInput, NotificationItem, SettingsPatch, WorkspaceHealth,
    WorkspaceSnapshot,
};
use civicflow_core::reports::{self, ExportFormat, ReportDocument, ReportRequest};
use civicflow_core::Database;
use civicflow_core::{auth, backups, roster, services, workflows};
use serde::Serialize;
use tauri::{Manager, State};

struct AppState {
    database: Mutex<Database>,
    backup_dir: PathBuf,
}

fn lock_error() -> AppError {
    AppError {
        code: "WORKSPACE_BUSY".into(),
        message: "The workspace database is busy. Close any open dialog and try again.".into(),
        field: None,
        action: Some("RETRY".into()),
    }
}

/// Resolves the session token that the WebView presented. Every command that
/// touches workspace data calls this first, so hiding a screen is never the
/// only thing standing between a role and a record.
fn require_account(database: &Database, token: &str) -> Result<Account, AppError> {
    auth::require_user(database.connection(), token).map_err(AppError::from)
}

fn require_coordinator(database: &Database, token: &str) -> Result<Account, AppError> {
    auth::require_coordinator(database.connection(), token).map_err(AppError::from)
}

/// A volunteer may only act on their own volunteer record; a coordinator may
/// act on anyone's.
fn require_self_or_coordinator(account: &Account, volunteer_id: &str) -> Result<(), AppError> {
    if account.role == "coordinator" {
        return Ok(());
    }
    if account.volunteer_id.as_deref() != Some(volunteer_id) {
        return Err(AppError::from(CoreError::rule(
            "FORBIDDEN",
            "You can only change your own volunteer record.",
            None,
            Some("RETURN_TO_VOLUNTEER_HOME".into()),
        )));
    }
    Ok(())
}

/// The snapshot is redacted for volunteers before it crosses the IPC bridge.
fn snapshot_for(database: &Database, account: &Account) -> Result<WorkspaceSnapshot, AppError> {
    let volunteer_id = if account.role == "volunteer" {
        account.volunteer_id.as_deref()
    } else {
        None
    };
    workflows::snapshot_for(database.connection(), volunteer_id).map_err(AppError::from)
}

fn volunteer_audience(account: &Account) -> (&str, Option<&str>) {
    if account.role == "volunteer" {
        ("volunteer", account.volunteer_id.as_deref())
    } else {
        ("coordinator", None)
    }
}

fn only_display_settings(patch: &SettingsPatch) -> bool {
    patch.organization_name.is_none()
        && patch.contact_email.is_none()
        && patch.timezone.is_none()
        && patch.week_starts_on.is_none()
        && patch.default_shift_length.is_none()
        && patch.auto_promote_waitlist.is_none()
        && patch.hours_require_approval.is_none()
        && patch.email_digest.is_none()
}

#[tauri::command]
fn sign_in(
    state: State<'_, AppState>,
    email: String,
    password: String,
    remember: bool,
) -> Result<AuthSession, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    auth::sign_in(database.connection(), &email, &password, remember).map_err(AppError::from)
}

#[tauri::command]
fn sign_out(state: State<'_, AppState>, token: String) -> Result<bool, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = auth::current_user(database.connection(), &token).map_err(AppError::from)?;
    let Some(account) = account else {
        return Ok(false);
    };
    auth::sign_out(database.connection(), &token, &account).map_err(AppError::from)
}

#[tauri::command]
fn current_user(state: State<'_, AppState>, token: String) -> Result<Option<Account>, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    auth::current_user(database.connection(), &token).map_err(AppError::from)
}

#[tauri::command]
fn list_accounts(state: State<'_, AppState>, token: String) -> Result<Vec<Account>, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    auth::list_accounts(database.connection(), &token).map_err(AppError::from)
}

#[tauri::command]
fn reset_password(
    state: State<'_, AppState>,
    token: String,
    user_id: String,
    new_password: String,
) -> Result<(), AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    auth::reset_password(database.connection(), &token, &user_id, &new_password)
        .map_err(AppError::from)
}

#[tauri::command]
fn get_mission_control(
    state: State<'_, AppState>,
    token: String,
) -> Result<MissionControlSummary, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_coordinator(&database, &token)?;
    services::get_mission_control(database.connection(), &account.role).map_err(AppError::from)
}

#[tauri::command]
fn list_notifications(
    state: State<'_, AppState>,
    token: String,
) -> Result<Vec<NotificationItem>, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_account(&database, &token)?;
    let (audience, volunteer_id) = volunteer_audience(&account);
    services::list_notifications(database.connection(), audience, volunteer_id)
        .map_err(AppError::from)
}

#[tauri::command]
fn mark_notification_read(
    state: State<'_, AppState>,
    token: String,
    id: String,
) -> Result<bool, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_account(&database, &token)?;
    let (audience, volunteer_id) = volunteer_audience(&account);
    services::mark_notification_read(
        database.connection(),
        &id,
        audience,
        volunteer_id,
        &account.role,
        &account.name,
    )
    .map_err(AppError::from)
}

#[tauri::command]
fn workspace_health(
    state: State<'_, AppState>,
    token: String,
) -> Result<WorkspaceHealth, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    require_coordinator(&database, &token)?;
    database.health().map_err(AppError::from)
}

#[tauri::command]
fn get_workspace_snapshot(
    state: State<'_, AppState>,
    token: String,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_account(&database, &token)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn auto_roster(
    state: State<'_, AppState>,
    token: String,
    shift_ids: Vec<String>,
    options: RosterOptions,
) -> Result<RosterPlan, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    require_coordinator(&database, &token)?;
    roster::plan_roster(database.connection(), &shift_ids, &options).map_err(AppError::from)
}

#[tauri::command]
fn apply_roster_plan(
    state: State<'_, AppState>,
    token: String,
    shift_id: String,
    assignments: Vec<roster::RosterApplyAssignment>,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_coordinator(&database, &token)?;
    roster::apply_roster_plan(database.connection(), &shift_id, &assignments)
        .map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn save_report_view(
    state: State<'_, AppState>,
    token: String,
    name: String,
    scope: String,
    filters_json: String,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_coordinator(&database, &token)?;
    workflows::save_report_view(database.connection(), &name, &scope, &filters_json)
        .map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn set_saved_opportunity(
    state: State<'_, AppState>,
    token: String,
    opportunity_id: String,
    saved: bool,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_account(&database, &token)?;
    workflows::set_saved_opportunity(database.connection(), &opportunity_id, saved)
        .map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn set_application_stage(
    state: State<'_, AppState>,
    token: String,
    application_id: String,
    stage: String,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_coordinator(&database, &token)?;
    workflows::set_application_stage(database.connection(), &application_id, &stage)
        .map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn get_checkin_code(
    state: State<'_, AppState>,
    token: String,
    shift_id: String,
) -> Result<CheckinCode, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    require_account(&database, &token)?;
    workflows::get_checkin_code(database.connection(), &shift_id).map_err(AppError::from)
}

#[tauri::command]
fn check_in_volunteer(
    state: State<'_, AppState>,
    token: String,
    shift_id: String,
    volunteer_id: String,
    code: Option<String>,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_account(&database, &token)?;
    require_self_or_coordinator(&account, &volunteer_id)?;
    workflows::check_in(
        database.connection(),
        &shift_id,
        &volunteer_id,
        code.as_deref(),
    )
    .map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn check_out_volunteer(
    state: State<'_, AppState>,
    token: String,
    shift_id: String,
    volunteer_id: String,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_account(&database, &token)?;
    require_self_or_coordinator(&account, &volunteer_id)?;
    workflows::check_out(database.connection(), &shift_id, &volunteer_id)
        .map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn mark_volunteer_no_show(
    state: State<'_, AppState>,
    token: String,
    shift_id: String,
    volunteer_id: String,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_coordinator(&database, &token)?;
    workflows::mark_no_show(database.connection(), &shift_id, &volunteer_id)
        .map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn cancel_registration(
    state: State<'_, AppState>,
    token: String,
    shift_id: String,
    volunteer_id: String,
    reason: Option<String>,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_account(&database, &token)?;
    require_self_or_coordinator(&account, &volunteer_id)?;
    workflows::cancel_registration(
        database.connection(),
        &shift_id,
        &volunteer_id,
        reason.as_deref().unwrap_or_default(),
    )
    .map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn join_waitlist(
    state: State<'_, AppState>,
    token: String,
    shift_id: String,
    volunteer_id: String,
    role: String,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_account(&database, &token)?;
    require_self_or_coordinator(&account, &volunteer_id)?;
    workflows::join_waitlist(database.connection(), &shift_id, &volunteer_id, &role)
        .map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn promote_waitlist(
    state: State<'_, AppState>,
    token: String,
    shift_id: String,
    volunteer_id: String,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_coordinator(&database, &token)?;
    workflows::promote_waitlist(database.connection(), &shift_id, &volunteer_id)
        .map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn review_hours(
    state: State<'_, AppState>,
    token: String,
    entry_id: String,
    status: String,
    approved_minutes: Option<i64>,
    reason: String,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_coordinator(&database, &token)?;
    workflows::review_hours(
        database.connection(),
        &entry_id,
        &status,
        approved_minutes,
        &reason,
    )
    .map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn update_workspace_settings(
    state: State<'_, AppState>,
    token: String,
    patch: SettingsPatch,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_account(&database, &token)?;
    if account.role != "coordinator" && !only_display_settings(&patch) {
        return Err(AppError::from(CoreError::rule(
            "FORBIDDEN",
            "Only a coordinator can change workspace settings.",
            None,
            Some("RETURN_TO_VOLUNTEER_HOME".into()),
        )));
    }
    workflows::update_settings(database.connection(), patch).map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn create_opportunity(
    state: State<'_, AppState>,
    token: String,
    input: NewOpportunityInput,
) -> Result<CreateOpportunityResult, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    require_coordinator(&database, &token)?;
    workflows::create_opportunity(database.connection(), input).map_err(AppError::from)
}

#[tauri::command]
fn register_for_shift(
    state: State<'_, AppState>,
    token: String,
    shift_id: String,
    volunteer_id: String,
    role: String,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_account(&database, &token)?;
    require_self_or_coordinator(&account, &volunteer_id)?;
    workflows::register_for_shift(database.connection(), &shift_id, &volunteer_id, &role)
        .map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn save_volunteer_profile(
    state: State<'_, AppState>,
    token: String,
    skills: Vec<String>,
    availability: Vec<AvailabilitySlot>,
    completed_onboarding: bool,
) -> Result<WorkspaceSnapshot, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_account(&database, &token)?;
    if account.role != "volunteer" {
        return Err(AppError::from(CoreError::rule(
            "FORBIDDEN",
            "Only the signed-in volunteer can change a volunteer profile.",
            None,
            None,
        )));
    }
    workflows::save_volunteer_profile(
        database.connection(),
        skills,
        availability,
        completed_onboarding,
    )
    .map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[tauri::command]
fn reset_demo(state: State<'_, AppState>, token: String) -> Result<WorkspaceSnapshot, AppError> {
    let mut database = state.database.lock().map_err(|_| lock_error())?;
    let account = require_coordinator(&database, &token)?;
    database.reset_demo().map_err(AppError::from)?;
    snapshot_for(&database, &account)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportReceipt {
    path: String,
    bytes: usize,
    format: String,
    title: String,
}

#[tauri::command]
fn generate_report(
    state: State<'_, AppState>,
    token: String,
    request: ReportRequest,
) -> Result<ReportDocument, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    require_coordinator(&database, &token)?;
    reports::generate(database.connection(), &request).map_err(AppError::from)
}

#[tauri::command]
fn export_report(
    state: State<'_, AppState>,
    token: String,
    request: ReportRequest,
    format: String,
    path: String,
) -> Result<ExportReceipt, AppError> {
    let format = ExportFormat::parse(&format).map_err(AppError::from)?;
    let target = PathBuf::from(&path);
    if target.file_name().is_none() || !target.is_absolute() {
        return Err(AppError::from(CoreError::Validation(
            "Choose a file name and folder for the export.".into(),
        )));
    }
    let expected = match format {
        ExportFormat::Csv => "csv",
        ExportFormat::Pdf => "pdf",
    };
    if target.extension().and_then(|value| value.to_str()) != Some(expected) {
        return Err(AppError::from(CoreError::Validation(format!(
            "That report must be saved as a .{expected} file."
        ))));
    }
    if let Some(parent) = target.parent() {
        if !parent.is_dir() {
            return Err(AppError::from(CoreError::Validation(
                "That folder no longer exists.".into(),
            )));
        }
    }
    let database = state.database.lock().map_err(|_| lock_error())?;
    require_coordinator(&database, &token)?;
    let document = reports::generate(database.connection(), &request).map_err(AppError::from)?;
    reports::export(&document, format, &target).map_err(AppError::from)?;
    let bytes = std::fs::metadata(&target)
        .map(|metadata| metadata.len() as usize)
        .unwrap_or(0);
    Ok(ExportReceipt {
        path,
        bytes,
        format: expected.to_string(),
        title: document.title,
    })
}

#[tauri::command]
fn list_backups(
    state: State<'_, AppState>,
    token: String,
) -> Result<Vec<BackupSnapshot>, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    require_coordinator(&database, &token)?;
    backups::list(&state.backup_dir).map_err(AppError::from)
}

#[tauri::command]
fn create_backup(
    state: State<'_, AppState>,
    token: String,
    note: Option<String>,
) -> Result<Vec<BackupSnapshot>, AppError> {
    let database = state.database.lock().map_err(|_| lock_error())?;
    require_coordinator(&database, &token)?;
    backups::create(
        database.connection(),
        &state.backup_dir,
        "manual",
        note.as_deref().unwrap_or("Manual snapshot"),
    )
    .map_err(AppError::from)?;
    backups::list(&state.backup_dir).map_err(AppError::from)
}

#[tauri::command]
fn restore_backup(
    state: State<'_, AppState>,
    token: String,
    id: String,
) -> Result<BackupRestoreResult, AppError> {
    let mut database = state.database.lock().map_err(|_| lock_error())?;
    require_coordinator(&database, &token)?;
    backups::restore(database.connection_mut(), &state.backup_dir, &id).map_err(AppError::from)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

    // The embedded WebDriver server exists only in debug builds. The plugin is
    // linked in release builds so the capability stays valid, but its server is
    // never started there.
    #[cfg(debug_assertions)]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .setup(|app| {
            // The end-to-end suite points this at a throwaway directory so a
            // test run never opens (or resets) the real workspace.
            let data_dir = match std::env::var_os("CIVICFLOW_DATA_DIR") {
                Some(dir) => PathBuf::from(dir),
                None => app.path().app_data_dir()?,
            };
            std::fs::create_dir_all(&data_dir)?;
            let mut database = Database::open(data_dir.join("civicflow.db"))?;
            database.seed_demo_if_empty()?;
            let backup_dir = data_dir.join("backups");
            if backups::list(&backup_dir)?.is_empty() {
                backups::create(
                    database.connection(),
                    &backup_dir,
                    "automatic",
                    "Initial workspace snapshot",
                )?;
            }
            app.manage(AppState {
                database: Mutex::new(database),
                backup_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sign_in,
            sign_out,
            current_user,
            list_accounts,
            reset_password,
            get_mission_control,
            list_notifications,
            mark_notification_read,
            workspace_health,
            get_workspace_snapshot,
            auto_roster,
            apply_roster_plan,
            save_report_view,
            set_saved_opportunity,
            set_application_stage,
            get_checkin_code,
            check_in_volunteer,
            check_out_volunteer,
            mark_volunteer_no_show,
            cancel_registration,
            join_waitlist,
            promote_waitlist,
            review_hours,
            update_workspace_settings,
            create_opportunity,
            register_for_shift,
            save_volunteer_profile,
            reset_demo,
            generate_report,
            export_report,
            list_backups,
            create_backup,
            restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("CivicFlow failed to launch");
}
