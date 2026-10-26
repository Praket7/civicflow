use civicflow_core::auth::{create_account, Account};
use civicflow_core::authorization::{require_coordinator, require_membership};
use civicflow_core::error::CoreError;
use civicflow_core::organizations::{self, list_members, membership, NewOrganization};
use civicflow_core::Database;

fn seeded() -> Database {
    let mut database = Database::in_memory().expect("in-memory database");
    assert!(database.seed_demo_if_empty().expect("seed"));
    database
}

fn rule_code(error: CoreError) -> String {
    match error {
        CoreError::Rule { code, .. } => code,
        other => panic!("expected a rule error, got {other:?}"),
    }
}

fn account(conn: &rusqlite::Connection, email: &str, role: &str) -> Account {
    create_account(conn, "Alex Rivera", email, "kitchen-table-2026", role)
        .expect("account is created")
        .user
}

fn new_organization(name: &str) -> NewOrganization {
    NewOrganization {
        name: name.into(),
        description: "Neighbours cooking for neighbours.".into(),
        website: "example.org".into(),
        address: "12 Main Street".into(),
        city: "Buffalo".into(),
        state: "NY".into(),
        contact_emails: vec!["Hello@Example.org".into()],
        image: None,
        image_alt: None,
        visibility: "public".into(),
    }
}

#[test]
fn the_organization_tables_exist_after_migration() {
    let database = seeded();
    let conn = database.connection();
    let mut statement = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .unwrap();
    let names: Vec<String> = statement
        .query_map([], |row| row.get(0))
        .unwrap()
        .map(|row| row.unwrap())
        .collect();

    for table in [
        "organizations",
        "organization_contacts",
        "organization_memberships",
        "organization_invites",
        "organization_updates",
        "organization_update_reads",
    ] {
        assert!(
            names.iter().any(|name| name == table),
            "missing table {table}"
        );
    }

    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, civicflow_core::db::SCHEMA_VERSION);
}

#[test]
fn the_creator_of_an_organization_is_its_first_coordinator() {
    let database = seeded();
    let conn = database.connection();
    let creator = account(conn, "creator@example.org", "coordinator");

    let organization =
        organizations::create_organization(conn, &creator, &new_organization("Riverside Pantry"))
            .expect("organization is created");

    assert_eq!(organization.name, "Riverside Pantry");
    assert_eq!(organization.initials, "RP");
    assert_eq!(organization.visibility, "public");
    assert_eq!(organization.created_by_user_id, Some(creator.id.clone()));
    assert_eq!(
        organizations::contact_emails(conn, &organization.id).unwrap(),
        vec!["hello@example.org".to_string()]
    );

    let membership = require_coordinator(conn, &organization.id, &creator.id)
        .expect("the creator coordinates what they created");
    assert_eq!(membership.role, "coordinator");
    assert_eq!(membership.status, "active");
}

#[test]
fn an_organization_created_twice_takes_a_distinct_identifier() {
    let database = seeded();
    let conn = database.connection();
    let creator = account(conn, "creator@example.org", "coordinator");

    let first =
        organizations::create_organization(conn, &creator, &new_organization("Riverside Pantry"))
            .unwrap();
    let second =
        organizations::create_organization(conn, &creator, &new_organization("Riverside Pantry"))
            .unwrap();

    assert_ne!(first.id, second.id);
    assert_eq!(organizations::list_organizations(conn).unwrap().len(), 3);
}

#[test]
fn an_account_without_a_membership_cannot_reach_an_organization() {
    let database = seeded();
    let conn = database.connection();
    let owner = account(conn, "owner@example.org", "coordinator");
    let outsider = account(conn, "outsider@example.org", "volunteer");
    let organization =
        organizations::create_organization(conn, &owner, &new_organization("Riverside Pantry"))
            .unwrap();

    let denied = require_membership(conn, &organization.id, &outsider.id).unwrap_err();
    assert_eq!(rule_code(denied), "FORBIDDEN");
    let denied = require_coordinator(conn, &organization.id, &outsider.id).unwrap_err();
    assert_eq!(rule_code(denied), "FORBIDDEN");
}

#[test]
fn a_unknown_organization_is_not_confused_with_forbidden_access() {
    let database = seeded();
    let conn = database.connection();
    let account = account(conn, "someone@example.org", "volunteer");

    let denied = require_membership(conn, "org-does-not-exist", &account.id).unwrap_err();
    assert_eq!(rule_code(denied), "ORGANIZATION_NOT_FOUND");
}

#[test]
fn a_volunteer_membership_is_not_coordinator_access() {
    let database = seeded();
    let conn = database.connection();
    let owner = account(conn, "owner@example.org", "coordinator");
    let volunteer = account(conn, "volunteer@example.org", "volunteer");
    let organization =
        organizations::create_organization(conn, &owner, &new_organization("Riverside Pantry"))
            .unwrap();

    organizations::join_as_volunteer(conn, &volunteer.id, &organization.id).unwrap();

    assert!(require_membership(conn, &organization.id, &volunteer.id).is_ok());
    let denied = require_coordinator(conn, &organization.id, &volunteer.id).unwrap_err();
    assert_eq!(rule_code(denied), "FORBIDDEN");
}

#[test]
fn a_volunteer_in_another_organization_cannot_read_its_members() {
    let database = seeded();
    let conn = database.connection();
    let owner = account(conn, "owner@example.org", "coordinator");
    let volunteer = account(conn, "volunteer@example.org", "volunteer");
    let organization =
        organizations::create_organization(conn, &owner, &new_organization("Riverside Pantry"))
            .unwrap();
    organizations::join_as_volunteer(conn, &volunteer.id, &organization.id).unwrap();

    let denied = list_members(conn, &volunteer, &organization.id).unwrap_err();
    assert_eq!(rule_code(denied), "FORBIDDEN");
    let members = list_members(conn, &owner, &organization.id).unwrap();
    assert_eq!(members.len(), 2);
    assert!(members
        .iter()
        .any(|member| member.email == "owner@example.org"));
}

#[test]
fn a_disabled_membership_loses_access() {
    let database = seeded();
    let conn = database.connection();
    let owner = account(conn, "owner@example.org", "coordinator");
    let volunteer = account(conn, "volunteer@example.org", "volunteer");
    let organization =
        organizations::create_organization(conn, &owner, &new_organization("Riverside Pantry"))
            .unwrap();
    organizations::join_as_volunteer(conn, &volunteer.id, &organization.id).unwrap();

    conn.execute(
        "UPDATE organization_memberships SET status = 'disabled'
         WHERE organization_id = ?1 AND user_id = ?2",
        rusqlite::params![organization.id, volunteer.id],
    )
    .unwrap();

    let denied = require_membership(conn, &organization.id, &volunteer.id).unwrap_err();
    assert_eq!(rule_code(denied), "FORBIDDEN");
}

#[test]
fn a_volunteer_cannot_issue_an_invitation() {
    let database = seeded();
    let conn = database.connection();
    let owner = account(conn, "owner@example.org", "coordinator");
    let volunteer = account(conn, "volunteer@example.org", "volunteer");
    let organization =
        organizations::create_organization(conn, &owner, &new_organization("Riverside Pantry"))
            .unwrap();
    organizations::join_as_volunteer(conn, &volunteer.id, &organization.id).unwrap();

    let denied = organizations::create_invite(conn, &volunteer, &organization.id, "coordinator")
        .unwrap_err();
    assert_eq!(rule_code(denied), "FORBIDDEN");

    let invite =
        organizations::create_invite(conn, &owner, &organization.id, "coordinator").unwrap();
    assert_eq!(invite.role, "coordinator");
    assert_eq!(invite.token.len(), 64);
    let stored: String = conn
        .query_row(
            "SELECT token_hash FROM organization_invites WHERE id = ?1",
            rusqlite::params![invite.id],
            |row| row.get(0),
        )
        .unwrap();
    assert_ne!(stored, invite.token, "the token itself is never stored");
}

#[test]
fn a_coordinator_invitation_cannot_be_redeemed_twice() {
    let database = seeded();
    let conn = database.connection();
    let owner = account(conn, "owner@example.org", "coordinator");
    let invited = account(conn, "invited@example.org", "volunteer");
    let organization =
        organizations::create_organization(conn, &owner, &new_organization("Riverside Pantry"))
            .unwrap();
    let invite =
        organizations::create_invite(conn, &owner, &organization.id, "coordinator").unwrap();

    let redeemed = organizations::redeem_invite(conn, &invited.id, &invite.token).unwrap();
    assert_eq!(redeemed.role, "coordinator");
    assert!(require_coordinator(conn, &organization.id, &invited.id).is_ok());

    let denied = organizations::redeem_invite(conn, &invited.id, &invite.token).unwrap_err();
    assert_eq!(rule_code(denied), "INVITE_INVALID");
}

#[test]
fn an_expired_invitation_is_refused() {
    let database = seeded();
    let conn = database.connection();
    let owner = account(conn, "owner@example.org", "coordinator");
    let invited = account(conn, "invited@example.org", "volunteer");
    let organization =
        organizations::create_organization(conn, &owner, &new_organization("Riverside Pantry"))
            .unwrap();
    let invite = organizations::create_invite(conn, &owner, &organization.id, "volunteer").unwrap();

    conn.execute(
        "UPDATE organization_invites SET expires_at = '2020-01-01T00:00:00+00:00' WHERE id = ?1",
        rusqlite::params![invite.id],
    )
    .unwrap();

    let denied = organizations::redeem_invite(conn, &invited.id, &invite.token).unwrap_err();
    assert_eq!(rule_code(denied), "INVITE_EXPIRED");
    assert!(membership(conn, &organization.id, &invited.id)
        .unwrap()
        .is_none());
}

#[test]
fn an_unknown_invitation_code_is_refused() {
    let database = seeded();
    let conn = database.connection();
    let invited = account(conn, "invited@example.org", "volunteer");

    let denied = organizations::redeem_invite(conn, &invited.id, "not-a-real-code").unwrap_err();
    assert_eq!(rule_code(denied), "INVITE_INVALID");
}

#[test]
fn a_disabled_membership_is_not_revived_by_an_invitation() {
    let database = seeded();
    let conn = database.connection();
    let owner = account(conn, "owner@example.org", "coordinator");
    let volunteer = account(conn, "volunteer@example.org", "volunteer");
    let organization =
        organizations::create_organization(conn, &owner, &new_organization("Riverside Pantry"))
            .unwrap();
    organizations::join_as_volunteer(conn, &volunteer.id, &organization.id).unwrap();
    let invite =
        organizations::create_invite(conn, &owner, &organization.id, "coordinator").unwrap();

    conn.execute(
        "UPDATE organization_memberships SET status = 'disabled'
         WHERE organization_id = ?1 AND user_id = ?2",
        rusqlite::params![organization.id, volunteer.id],
    )
    .unwrap();

    let denied = organizations::redeem_invite(conn, &volunteer.id, &invite.token).unwrap_err();
    assert_eq!(rule_code(denied), "FORBIDDEN");
}

#[test]
fn a_private_organization_requires_an_invitation_to_join() {
    let database = seeded();
    let conn = database.connection();
    let owner = account(conn, "owner@example.org", "coordinator");
    let volunteer = account(conn, "volunteer@example.org", "volunteer");
    let mut input = new_organization("Riverside Pantry");
    input.visibility = "private".into();
    let organization = organizations::create_organization(conn, &owner, &input).unwrap();

    let denied =
        organizations::join_as_volunteer(conn, &volunteer.id, &organization.id).unwrap_err();
    assert_eq!(rule_code(denied), "INVITE_REQUIRED");

    let invite = organizations::create_invite(conn, &owner, &organization.id, "volunteer").unwrap();
    organizations::redeem_invite(conn, &volunteer.id, &invite.token).unwrap();
    assert!(membership(conn, &organization.id, &volunteer.id)
        .unwrap()
        .is_some());
}

#[test]
fn a_coordinator_cannot_downgrade_themselves_out_of_the_organization() {
    let database = seeded();
    let conn = database.connection();
    let owner = account(conn, "owner@example.org", "coordinator");
    let volunteer = account(conn, "volunteer@example.org", "volunteer");
    let organization =
        organizations::create_organization(conn, &owner, &new_organization("Riverside Pantry"))
            .unwrap();
    organizations::join_as_volunteer(conn, &volunteer.id, &organization.id).unwrap();

    let denied = organizations::set_membership_role(
        conn,
        &volunteer,
        &organization.id,
        &owner.id,
        "volunteer",
    )
    .unwrap_err();
    assert_eq!(rule_code(denied), "FORBIDDEN");

    let denied =
        organizations::set_membership_role(conn, &owner, &organization.id, &owner.id, "volunteer")
            .unwrap_err();
    assert_eq!(rule_code(denied), "LAST_COORDINATOR");

    let promoted = organizations::set_membership_role(
        conn,
        &owner,
        &organization.id,
        &volunteer.id,
        "coordinator",
    )
    .unwrap();
    assert_eq!(promoted.role, "coordinator");
}

#[test]
fn the_bundled_accounts_belong_to_the_workspace_organization() {
    let database = seeded();
    let conn = database.connection();

    let organizations = organizations::list_organizations(conn).unwrap();
    assert_eq!(
        organizations.len(),
        1,
        "a fresh workspace holds one organization"
    );
    let workspace = &organizations[0];

    let members: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM organization_memberships WHERE organization_id = ?1",
            rusqlite::params![workspace.id],
            |row| row.get(0),
        )
        .unwrap();
    let accounts: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .unwrap();
    assert_eq!(members, accounts);

    let coordinators: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM organization_memberships
             WHERE organization_id = ?1 AND role = 'coordinator' AND status = 'active'",
            rusqlite::params![workspace.id],
            |row| row.get(0),
        )
        .unwrap();
    assert!(coordinators >= 1);

    // Seeding twice must not duplicate memberships.
    let inserted = organizations::backfill_memberships(conn).unwrap();
    assert_eq!(inserted, 0);
}

#[test]
fn a_member_sees_only_the_organizations_they_joined() {
    let database = seeded();
    let conn = database.connection();
    let owner = account(conn, "owner@example.org", "coordinator");
    let volunteer = account(conn, "volunteer@example.org", "volunteer");
    let first =
        organizations::create_organization(conn, &owner, &new_organization("Riverside Pantry"))
            .unwrap();
    let second =
        organizations::create_organization(conn, &owner, &new_organization("Lakeview Kitchen"))
            .unwrap();
    organizations::join_as_volunteer(conn, &volunteer.id, &first.id).unwrap();

    let for_owner = organizations::organizations_for_user(conn, &owner.id).unwrap();
    let for_volunteer = organizations::organizations_for_user(conn, &volunteer.id).unwrap();

    let owner_ids: Vec<String> = for_owner.iter().map(|(org, _)| org.id.clone()).collect();
    assert!(owner_ids.contains(&first.id) && owner_ids.contains(&second.id));
    let volunteer_ids: Vec<String> = for_volunteer
        .iter()
        .map(|(org, _)| org.id.clone())
        .collect();
    assert_eq!(volunteer_ids, vec![first.id]);
}
