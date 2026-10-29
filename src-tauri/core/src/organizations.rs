//! Organizations, memberships and invitations.
//!
//! These tables are the system of record for who belongs to an organization, so
//! other modules ask this one instead of trusting an identifier supplied by the
//! calling screen. Policy lives in `crate::authorization`; this module owns the
//! SQL and the invitation lifecycle.

use chrono::{Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::auth::{initials_for, random_token, token_hash, Account};

use crate::db::slug_id;
use crate::error::{CoreError, Result};

/// An invitation is meant to be sent by email and redeemed later, so it outlives
/// a session but not indefinitely.
const INVITE_TTL_DAYS: i64 = 14;
const MAX_CONTACT_EMAILS: usize = 5;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationRecord {
    pub id: String,
    pub name: String,
    pub initials: String,
    pub mission: String,
    pub description: String,
    pub city: String,
    pub state: String,
    pub address: String,
    pub website: String,
    pub email: String,
    pub timezone: String,
    pub visibility: String,
    pub image: Option<String>,
    pub image_alt: Option<String>,
    pub created_at: String,
    pub created_by_user_id: Option<String>,
    /// The bundled sample organization. A demo flag is explicit so production
    /// startup never has to guess from a name or an empty table.
    pub is_demo: bool,
    pub sync_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Membership {
    pub organization_id: String,
    pub user_id: String,
    pub role: String,
    pub status: String,
    pub joined_at: String,
    pub membership_epoch: i64,
}

impl Membership {
    pub fn is_active(&self) -> bool {
        self.status == "active"
    }

    pub fn is_owner(&self) -> bool {
        self.role == "owner"
    }

    /// An owner and a coordinator both run the workspace; only an owner may
    /// change who else runs it.
    pub fn is_coordinator(&self) -> bool {
        self.role == "owner" || self.role == "coordinator"
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IssuedInvite {
    pub id: String,
    pub organization_id: String,
    pub role: String,
    pub email: String,
    /// Returned once, when the invitation is created. Only its hash is stored.
    pub token: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PendingInvite {
    pub id: String,
    pub organization_id: String,
    pub role: String,
    pub email: Option<String>,
    pub created_at: String,
    pub expires_at: String,
    pub redeemed_at: Option<String>,
    pub revoked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewOrganization {
    pub name: String,
    pub description: String,
    pub website: String,
    pub address: String,
    pub city: String,
    pub state: String,
    pub contact_emails: Vec<String>,
    pub image: Option<String>,
    pub image_alt: Option<String>,
    pub visibility: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationAccess {
    pub organization: OrganizationRecord,
    pub membership: Membership,
    pub members: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationDetailsPatch {
    pub name: Option<String>,
    pub description: Option<String>,
    pub website: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub image: Option<String>,
    pub image_alt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationMember {
    pub user_id: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub status: String,
    pub joined_at: String,
}

fn normalize_required(value: &str, field: &str, message: &str) -> Result<String> {
    let clean = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.is_empty() {
        return Err(CoreError::rule(
            "VALIDATION",
            message,
            Some(field.into()),
            None,
        ));
    }
    Ok(clean)
}

fn normalize_name(name: &str) -> Result<String> {
    let clean = normalize_required(name, "name", "Enter the organization's name.")?;
    if clean.chars().count() > 80 {
        return Err(CoreError::rule(
            "NAME_TOO_LONG",
            "Keep the organization name under 80 characters.",
            Some("name".into()),
            None,
        ));
    }
    Ok(clean)
}

fn normalize_visibility(visibility: &str) -> Result<String> {
    match visibility {
        "public" | "private" => Ok(visibility.to_string()),
        _ => Err(CoreError::rule(
            "VALIDATION",
            "Choose whether the organization is public or private.",
            Some("visibility".into()),
            None,
        )),
    }
}

fn normalize_contacts(emails: &[String], fallback: &str) -> Result<Vec<String>> {
    let mut contacts = Vec::new();
    for email in emails {
        let clean = email.trim().to_lowercase();
        if clean.is_empty() {
            continue;
        }
        if !clean.contains('@') || clean.chars().count() > 120 {
            return Err(CoreError::rule(
                "EMAIL_INVALID",
                "Enter a contact email like name@example.org.",
                Some("contactEmails".into()),
                None,
            ));
        }
        if !contacts.contains(&clean) {
            contacts.push(clean);
        }
    }
    if contacts.len() > MAX_CONTACT_EMAILS {
        return Err(CoreError::rule(
            "VALIDATION",
            format!("Keep up to {MAX_CONTACT_EMAILS} contact emails."),
            Some("contactEmails".into()),
            None,
        ));
    }
    if contacts.is_empty() {
        contacts.push(fallback.trim().to_lowercase());
    }
    Ok(contacts)
}

fn row_to_organization(row: &rusqlite::Row<'_>) -> rusqlite::Result<OrganizationRecord> {
    Ok(OrganizationRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        initials: row.get(2)?,
        mission: row.get(3)?,
        description: row.get(4)?,
        city: row.get(5)?,
        state: row.get(6)?,
        address: row.get(7)?,
        website: row.get(8)?,
        email: row.get(9)?,
        timezone: row.get(10)?,
        visibility: row.get(11)?,
        image: row.get(12)?,
        image_alt: row.get(13)?,
        created_at: row.get(14)?,
        created_by_user_id: row.get(15)?,
        is_demo: row.get::<_, i64>(16)? != 0,
        sync_mode: row.get(17)?,
    })
}

const ORGANIZATION_COLUMNS: &str = "id, name, initials, mission, description, city, state, address,
     website, email, timezone, visibility, image, image_alt, created_at, created_by_user_id,
     is_demo, sync_mode";

pub fn load_organization(conn: &Connection, id: &str) -> Result<Option<OrganizationRecord>> {
    Ok(conn
        .query_row(
            &format!("SELECT {ORGANIZATION_COLUMNS} FROM organizations WHERE id = ?1"),
            params![id],
            row_to_organization,
        )
        .optional()?)
}

pub fn require_organization(conn: &Connection, id: &str) -> Result<OrganizationRecord> {
    load_organization(conn, id)?.ok_or_else(|| {
        CoreError::rule(
            "ORGANIZATION_NOT_FOUND",
            "That organization is no longer available on this device.",
            None,
            Some("CHOOSE_ORGANIZATION".into()),
        )
    })
}

/// Every organization, newest first. Discovery screens filter this list; they do
/// not decide access.
pub fn list_organizations(conn: &Connection) -> Result<Vec<OrganizationRecord>> {
    let mut statement = conn.prepare(&format!(
        "SELECT {ORGANIZATION_COLUMNS} FROM organizations ORDER BY created_at, name"
    ))?;
    let mut rows = statement.query([])?;
    let mut organizations = Vec::new();
    while let Some(row) = rows.next()? {
        organizations.push(row_to_organization(row)?);
    }
    Ok(organizations)
}

pub fn contact_emails(conn: &Connection, organization_id: &str) -> Result<Vec<String>> {
    let mut statement = conn.prepare(
        "SELECT email FROM organization_contacts
         WHERE organization_id = ?1 ORDER BY position, email",
    )?;
    let mut rows = statement.query(params![organization_id])?;
    let mut emails = Vec::new();
    while let Some(row) = rows.next()? {
        emails.push(row.get(0)?);
    }
    Ok(emails)
}

/// The organizations one account belongs to, with the membership that grants the
/// access. A disabled membership is returned so screens can explain it.
pub fn organizations_for_user(
    conn: &Connection,
    user_id: &str,
) -> Result<Vec<(OrganizationRecord, Membership)>> {
    let mut statement = conn.prepare(&format!(
        "SELECT {ORGANIZATION_COLUMNS}, m.organization_id, m.user_id, m.role, m.status, m.joined_at, m.membership_epoch
         FROM organization_memberships m
         JOIN organizations o ON o.id = m.organization_id
         WHERE m.user_id = ?1
         ORDER BY m.joined_at, o.name"
    ))?;
    let mut rows = statement.query(params![user_id])?;
    let mut memberships = Vec::new();
    while let Some(row) = rows.next()? {
        let organization = row_to_organization(row)?;
        memberships.push((
            organization,
            Membership {
                organization_id: row.get(18)?,
                user_id: row.get(19)?,
                role: row.get(20)?,
                status: row.get(21)?,
                joined_at: row.get(22)?,
                membership_epoch: row.get(23)?,
            },
        ));
    }
    Ok(memberships)
}

/// The organizations this identity belongs to, with the member count the
/// switcher shows. Folded into one query so the UI never needs to infer access.
pub fn organizations_for_account(
    conn: &Connection,
    user_id: &str,
) -> Result<Vec<OrganizationAccess>> {
    let mut statement = conn.prepare(&format!(
        "SELECT {ORGANIZATION_COLUMNS},
                m.organization_id, m.user_id, m.role, m.status, m.joined_at, m.membership_epoch,
                (SELECT COUNT(*) FROM organization_memberships c
                 WHERE c.organization_id = o.id AND c.status = 'active')
         FROM organization_memberships m
         JOIN organizations o ON o.id = m.organization_id
         WHERE m.user_id = ?1
         ORDER BY m.joined_at, o.name"
    ))?;
    let mut rows = statement.query(params![user_id])?;
    let mut access = Vec::new();
    while let Some(row) = rows.next()? {
        let organization = row_to_organization(row)?;
        access.push(OrganizationAccess {
            organization,
            membership: Membership {
                organization_id: row.get(18)?,
                user_id: row.get(19)?,
                role: row.get(20)?,
                status: row.get(21)?,
                joined_at: row.get(22)?,
                membership_epoch: row.get(23)?,
            },
            members: row.get(24)?,
        });
    }
    Ok(access)
}

pub fn organization_access(
    conn: &Connection,
    organization_id: &str,
    user_id: &str,
) -> Result<OrganizationAccess> {
    let organization = require_organization(conn, organization_id)?;
    let membership = membership(conn, organization_id, user_id)?.ok_or_else(|| {
        CoreError::rule(
            "FORBIDDEN",
            "You do not have access to that organization.",
            None,
            Some("CHOOSE_ORGANIZATION".into()),
        )
    })?;
    let members: i64 = conn.query_row(
        "SELECT COUNT(*) FROM organization_memberships
         WHERE organization_id = ?1 AND status = 'active'",
        params![organization_id],
        |row| row.get(0),
    )?;
    Ok(OrganizationAccess {
        organization,
        membership,
        members,
    })
}

pub fn membership(
    conn: &Connection,
    organization_id: &str,
    user_id: &str,
) -> Result<Option<Membership>> {
    Ok(conn
        .query_row(
            "SELECT organization_id, user_id, role, status, joined_at, membership_epoch
             FROM organization_memberships
             WHERE organization_id = ?1 AND user_id = ?2",
            params![organization_id, user_id],
            |row| {
                Ok(Membership {
                    organization_id: row.get(0)?,
                    user_id: row.get(1)?,
                    role: row.get(2)?,
                    status: row.get(3)?,
                    joined_at: row.get(4)?,
                    membership_epoch: row.get(5)?,
                })
            },
        )
        .optional()?)
}

/// Creates an organization and makes its creator the first coordinator. Anyone
/// may start a new organization; what an account cannot do is award itself a
/// coordinator role inside an organization that already exists.
pub fn create_organization(
    conn: &Connection,
    creator: &Account,
    input: &NewOrganization,
) -> Result<OrganizationRecord> {
    let name = normalize_name(&input.name)?;
    let visibility = normalize_visibility(&input.visibility)?;
    let contacts = normalize_contacts(&input.contact_emails, &creator.email)?;
    let city = input.city.trim().to_string();
    let state = input.state.trim().to_string();
    let description = input.description.trim().to_string();
    let address = input.address.trim().to_string();
    let website = input.website.trim().to_string();
    let id = unique_organization_id(conn, &name)?;
    let now = Utc::now().to_rfc3339();
    let timezone = "America/New_York".to_string();

    let transaction = conn.unchecked_transaction()?;
    transaction.execute(
        "INSERT INTO organizations
         (id, name, initials, mission, description, city, state, address, website, email,
          timezone, visibility, image, image_alt, created_at, created_by_user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            id,
            name,
            initials_for(&name),
            description,
            description,
            city,
            state,
            address,
            website,
            contacts.first().cloned().unwrap_or_default(),
            timezone,
            visibility,
            input.image,
            input.image_alt,
            now,
            creator.id,
        ],
    )?;
    for (position, email) in contacts.iter().enumerate() {
        transaction.execute(
            "INSERT INTO organization_contacts (organization_id, email, position)
             VALUES (?1, ?2, ?3)",
            params![id, email, position as i64],
        )?;
    }
    transaction.execute(
        "INSERT INTO organization_memberships
         (organization_id, user_id, role, status, joined_at, membership_epoch)
         VALUES (?1, ?2, 'owner', 'active', ?3, 1)",
        params![id, creator.id, now],
    )?;
    transaction.commit()?;

    require_organization(conn, &id)
}

/// Updates the public profile a coordinator edits. The organization row is the
/// single record the switcher, public page, and reports read.
pub fn update_organization(
    conn: &Connection,
    actor: &Account,
    organization_id: &str,
    patch: &OrganizationDetailsPatch,
) -> Result<OrganizationRecord> {
    crate::authorization::require_coordinator(conn, organization_id, &actor.id)?;
    let current = require_organization(conn, organization_id)?;
    let name = match patch.name.as_deref() {
        Some(value) => normalize_name(value)?,
        None => current.name.clone(),
    };
    let description = patch
        .description
        .as_deref()
        .map(str::trim)
        .unwrap_or(&current.description)
        .to_string();
    let website = patch
        .website
        .as_deref()
        .map(str::trim)
        .unwrap_or(&current.website)
        .to_string();
    let address = patch
        .address
        .as_deref()
        .map(str::trim)
        .unwrap_or(&current.address)
        .to_string();
    let city = patch
        .city
        .as_deref()
        .map(str::trim)
        .unwrap_or(&current.city)
        .to_string();
    let state = patch
        .state
        .as_deref()
        .map(str::trim)
        .unwrap_or(&current.state)
        .to_string();
    let image = patch.image.clone().or(current.image.clone());
    let image_alt = patch.image_alt.clone().or(current.image_alt.clone());

    conn.execute(
        "UPDATE organizations
         SET name = ?2, initials = ?3, mission = ?4, description = ?4, website = ?5,
             address = ?6, city = ?7, state = ?8, image = ?9, image_alt = ?10
         WHERE id = ?1",
        params![
            organization_id,
            name,
            initials_for(&name),
            description,
            website,
            address,
            city,
            state,
            image,
            image_alt,
        ],
    )?;
    append_invite_audit(
        conn,
        actor,
        organization_id,
        "organization.profile_updated",
        organization_id,
        "Updated the organization profile".into(),
    )?;
    require_organization(conn, organization_id)
}

/// The member list is coordinator-only: a volunteer has no reason to read every
/// colleague's email address.
pub fn list_members(
    conn: &Connection,
    actor: &Account,
    organization_id: &str,
) -> Result<Vec<OrganizationMember>> {
    crate::authorization::require_coordinator(conn, organization_id, &actor.id)?;
    let mut statement = conn.prepare(
        "SELECT m.user_id, u.name, u.email, m.role, m.status, m.joined_at
         FROM organization_memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = ?1
         ORDER BY m.role, u.name",
    )?;
    let mut rows = statement.query(params![organization_id])?;
    let mut members = Vec::new();
    while let Some(row) = rows.next()? {
        members.push(OrganizationMember {
            user_id: row.get(0)?,
            name: row.get(1)?,
            email: row.get(2)?,
            role: row.get(3)?,
            status: row.get(4)?,
            joined_at: row.get(5)?,
        });
    }
    Ok(members)
}

/// Issues a one-time invitation. A coordinator may invite volunteers; only an
/// owner may invite another coordinator. The invitation names the address it is
/// for, so a forwarded link cannot quietly grant access to somebody else.
pub fn create_invite(
    conn: &Connection,
    actor: &Account,
    organization_id: &str,
    role: &str,
    email: &str,
) -> Result<IssuedInvite> {
    let membership = crate::authorization::require_coordinator(conn, organization_id, &actor.id)?;
    if role != "coordinator" && role != "volunteer" {
        return Err(CoreError::rule(
            "VALIDATION",
            "An invitation is either for a coordinator or for a volunteer.",
            Some("role".into()),
            None,
        ));
    }
    if role == "coordinator" && !membership.is_owner() {
        return Err(CoreError::rule(
            "FORBIDDEN",
            "Only an organization owner can invite another coordinator.",
            None,
            Some("ASK_OWNER".into()),
        ));
    }
    let email = crate::auth::normalize_email(email)?;
    let now = Utc::now();
    let token = random_token();
    let invite = IssuedInvite {
        id: uuid::Uuid::new_v4().to_string(),
        organization_id: organization_id.to_string(),
        role: role.to_string(),
        email: email.clone(),
        token,
        expires_at: (now + Duration::days(INVITE_TTL_DAYS)).to_rfc3339(),
    };
    // Re-inviting an address replaces its unused invitation rather than leaving
    // two live links for one person.
    conn.execute(
        "UPDATE organization_invites SET revoked_at = ?2
         WHERE organization_id = ?1 AND email = ?3
           AND redeemed_at IS NULL AND revoked_at IS NULL",
        params![organization_id, now.to_rfc3339(), email],
    )?;
    conn.execute(
        "INSERT INTO organization_invites
         (id, organization_id, role, email, token_hash, created_by_user_id, created_at,
          expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            invite.id,
            organization_id,
            invite.role,
            invite.email,
            token_hash(&invite.token),
            actor.id,
            now.to_rfc3339(),
            invite.expires_at,
        ],
    )?;
    append_invite_audit(
        conn,
        actor,
        organization_id,
        "organization.invite_created",
        &invite.id,
        format!("Invited {} as a {}", email, invite.role),
    )?;
    Ok(invite)
}

/// The invitations still waiting for somebody to accept them.
pub fn list_invites(
    conn: &Connection,
    actor: &Account,
    organization_id: &str,
) -> Result<Vec<PendingInvite>> {
    crate::authorization::require_coordinator(conn, organization_id, &actor.id)?;
    let mut statement = conn.prepare(
        "SELECT id, organization_id, role, email, created_at, expires_at, redeemed_at, revoked_at
         FROM organization_invites
         WHERE organization_id = ?1
         ORDER BY created_at DESC",
    )?;
    let mut rows = statement.query(params![organization_id])?;
    let mut invites = Vec::new();
    while let Some(row) = rows.next()? {
        invites.push(PendingInvite {
            id: row.get(0)?,
            organization_id: row.get(1)?,
            role: row.get(2)?,
            email: row.get(3)?,
            created_at: row.get(4)?,
            expires_at: row.get(5)?,
            redeemed_at: row.get(6)?,
            revoked_at: row.get(7)?,
        });
    }
    Ok(invites)
}

pub fn revoke_invite(
    conn: &Connection,
    actor: &Account,
    organization_id: &str,
    invite_id: &str,
) -> Result<()> {
    crate::authorization::require_coordinator(conn, organization_id, &actor.id)?;
    let changed = conn.execute(
        "UPDATE organization_invites SET revoked_at = ?3
         WHERE id = ?1 AND organization_id = ?2
           AND redeemed_at IS NULL AND revoked_at IS NULL",
        params![invite_id, organization_id, Utc::now().to_rfc3339()],
    )?;
    if changed == 0 {
        return Err(CoreError::NotFound("that invitation".into()));
    }
    append_invite_audit(
        conn,
        actor,
        organization_id,
        "organization.invite_revoked",
        invite_id,
        "Revoked an organization invitation".into(),
    )?;
    Ok(())
}

fn append_invite_audit(
    conn: &Connection,
    actor: &Account,
    _organization_id: &str,
    action: &str,
    invite_id: &str,
    summary: String,
) -> Result<()> {
    conn.execute(
        "INSERT INTO audit_events
         (id, timestamp, actor_type, actor_id, action, entity_type, entity_id, summary)
         VALUES (?1, ?2, ?3, ?4, ?5, 'organization_invite', ?6, ?7)",
        params![
            uuid::Uuid::new_v4().to_string(),
            Utc::now().to_rfc3339(),
            actor.role,
            actor.id,
            action,
            invite_id,
            summary,
        ],
    )?;
    Ok(())
}

/// Redeems an invitation for the signed-in account. An invitation is single-use,
/// expires, is addressed to one email address, and cannot revive a membership a
/// coordinator disabled.
pub fn redeem_invite(conn: &Connection, user_id: &str, token: &str) -> Result<Membership> {
    let clean = token.trim();
    if clean.is_empty() {
        return Err(invite_error());
    }
    let now = Utc::now().to_rfc3339();
    let account: Option<(String, String)> = conn
        .query_row(
            "SELECT name, email FROM users WHERE id = ?1 AND status = 'active'",
            params![user_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let Some((name, email)) = account else {
        return Err(CoreError::NotFound("that account".into()));
    };
    let transaction = conn.unchecked_transaction()?;
    let invite: Option<(String, String, String, String, Option<String>)> = transaction
        .query_row(
            "SELECT id, organization_id, role, expires_at, email
             FROM organization_invites
             WHERE token_hash = ?1 AND redeemed_at IS NULL AND revoked_at IS NULL",
            params![token_hash(clean)],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .optional()?;
    let Some((invite_id, organization_id, role, expires_at, invite_email)) = invite else {
        return Err(invite_error());
    };
    if expires_at <= now {
        return Err(CoreError::rule(
            "INVITE_EXPIRED",
            "That invitation has expired. Ask for a new one.",
            None,
            Some("REQUEST_INVITE".into()),
        ));
    }
    if let Some(expected) = invite_email {
        if expected.to_lowercase() != email.to_lowercase() {
            return Err(CoreError::rule(
                "INVITE_EMAIL_MISMATCH",
                "That invitation was sent to a different email address.",
                None,
                Some("SIGN_IN_AS_INVITED".into()),
            ));
        }
    }

    let existing = membership(&transaction, &organization_id, user_id)?;
    if existing
        .as_ref()
        .is_some_and(|current| current.status == "disabled")
    {
        return Err(CoreError::rule(
            "FORBIDDEN",
            "Your access to that organization is disabled.",
            None,
            Some("CONTACT_COORDINATOR".into()),
        ));
    }

    let joined_at = existing
        .as_ref()
        .map(|current| current.joined_at.clone())
        .unwrap_or_else(|| now.clone());
    transaction.execute(
        "INSERT INTO organization_memberships
         (organization_id, user_id, role, status, joined_at, membership_epoch)
         VALUES (?1, ?2, ?3, 'active', ?4, 1)
         ON CONFLICT (organization_id, user_id)
         DO UPDATE SET role = excluded.role, status = 'active',
                       membership_epoch = organization_memberships.membership_epoch + 1",
        params![organization_id, user_id, role, joined_at],
    )?;
    if role == "volunteer" {
        ensure_volunteer_profile(&transaction, user_id, &name, &email, &now)?;
    }
    transaction.execute(
        "UPDATE organization_invites
         SET redeemed_at = ?2, redeemed_by_user_id = ?3
         WHERE id = ?1",
        params![invite_id, now, user_id],
    )?;
    append_invite_audit(
        &transaction,
        &Account {
            id: user_id.to_string(),
            name: name.clone(),
            email: email.clone(),
            role: role.clone(),
            volunteer_id: None,
        },
        &organization_id,
        "organization.invite_redeemed",
        &invite_id,
        format!("{email} joined as a {role}"),
    )?;
    transaction.commit()?;

    membership(conn, &organization_id, user_id)?
        .ok_or_else(|| CoreError::Data("the redeemed membership could not be read back".into()))
}

/// Gives a member the roster row their volunteer screens read. Linking an
/// existing roster profile by email is preferred, so a person who was imported
/// by a coordinator does not appear twice.
fn ensure_volunteer_profile(
    conn: &Connection,
    user_id: &str,
    name: &str,
    email: &str,
    now: &str,
) -> Result<String> {
    let linked: Option<Option<String>> = conn
        .query_row(
            "SELECT volunteer_id FROM users WHERE id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(Some(volunteer_id)) = linked {
        return Ok(volunteer_id);
    }
    let volunteer_id = crate::auth::link_or_create_volunteer(conn, name, email, now)?;
    conn.execute(
        "UPDATE users SET volunteer_id = ?1 WHERE id = ?2",
        params![volunteer_id, user_id],
    )?;
    Ok(volunteer_id)
}

/// Joins a public organization as a volunteer. Private organizations require an
/// invitation, so the caller checks visibility before calling this.
pub fn join_as_volunteer(
    conn: &Connection,
    user_id: &str,
    organization_id: &str,
) -> Result<Membership> {
    let organization = require_organization(conn, organization_id)?;
    if organization.visibility != "public" {
        return Err(CoreError::rule(
            "INVITE_REQUIRED",
            "That organization is private. A coordinator has to invite you.",
            None,
            Some("ENTER_CODE".into()),
        ));
    }
    if let Some(existing) = membership(conn, organization_id, user_id)? {
        if existing.status == "disabled" {
            return Err(CoreError::rule(
                "FORBIDDEN",
                "Your access to that organization is disabled.",
                None,
                Some("CONTACT_COORDINATOR".into()),
            ));
        }
        if existing.status == "active" {
            return Ok(existing);
        }
    }
    let now = Utc::now().to_rfc3339();
    let account: (String, String) = conn.query_row(
        "SELECT name, email FROM users WHERE id = ?1 AND status = 'active'",
        params![user_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let transaction = conn.unchecked_transaction()?;
    transaction.execute(
        "INSERT INTO organization_memberships
         (organization_id, user_id, role, status, joined_at, membership_epoch)
         VALUES (?1, ?2, 'volunteer', 'active', ?3, 1)
         ON CONFLICT (organization_id, user_id)
         DO UPDATE SET role = 'volunteer', status = 'active',
                       membership_epoch = organization_memberships.membership_epoch + 1",
        params![organization_id, user_id, now],
    )?;
    ensure_volunteer_profile(&transaction, user_id, &account.0, &account.1, &now)?;
    transaction.commit()?;
    membership(conn, organization_id, user_id)?
        .ok_or_else(|| CoreError::Data("the new membership could not be read back".into()))
}

pub fn set_membership_role(
    conn: &Connection,
    actor: &Account,
    organization_id: &str,
    user_id: &str,
    role: &str,
) -> Result<Membership> {
    let actor_membership =
        crate::authorization::require_membership(conn, organization_id, &actor.id)?;
    if !actor_membership.is_owner() {
        return Err(CoreError::rule(
            "FORBIDDEN",
            "Only an organization owner can change a member's role.",
            None,
            Some("ASK_OWNER".into()),
        ));
    }
    if role != "coordinator" && role != "volunteer" {
        return Err(CoreError::rule(
            "VALIDATION",
            "A member is either a coordinator or a volunteer.",
            Some("role".into()),
            None,
        ));
    }
    if actor.id == user_id {
        return Err(CoreError::rule(
            "CANNOT_CHANGE_OWN_ROLE",
            "You cannot change your own role. Transfer ownership first.",
            None,
            None,
        ));
    }
    let target = membership(conn, organization_id, user_id)?
        .ok_or_else(|| CoreError::NotFound("that member".into()))?;
    if target.role == "owner" {
        return Err(CoreError::rule(
            "LAST_OWNER",
            "Transfer ownership before changing the owner's role.",
            None,
            None,
        ));
    }
    conn.execute(
        "UPDATE organization_memberships
         SET role = ?3, membership_epoch = membership_epoch + 1
         WHERE organization_id = ?1 AND user_id = ?2",
        params![organization_id, user_id, role],
    )?;
    if role == "volunteer" {
        let account: (String, String) = conn.query_row(
            "SELECT name, email FROM users WHERE id = ?1",
            params![user_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        ensure_volunteer_profile(
            conn,
            user_id,
            &account.0,
            &account.1,
            &Utc::now().to_rfc3339(),
        )?;
    }
    append_invite_audit(
        conn,
        actor,
        organization_id,
        "organization.member_role_changed",
        user_id,
        format!("Changed a member's role to {role}"),
    )?;
    membership(conn, organization_id, user_id)?
        .ok_or_else(|| CoreError::Data("the updated membership could not be read back".into()))
}

/// Enables or disables a member without deleting their history. A disabled
/// membership is refused by `require_membership`, so a device that still holds a
/// session loses workspace access on its next command.
pub fn set_membership_status(
    conn: &Connection,
    actor: &Account,
    organization_id: &str,
    user_id: &str,
    status: &str,
) -> Result<Membership> {
    let actor_membership =
        crate::authorization::require_membership(conn, organization_id, &actor.id)?;
    if !actor_membership.is_owner() {
        return Err(CoreError::rule(
            "FORBIDDEN",
            "Only an organization owner can change a member's access.",
            None,
            Some("ASK_OWNER".into()),
        ));
    }
    if status != "active" && status != "disabled" {
        return Err(CoreError::rule(
            "VALIDATION",
            "A membership is either active or disabled.",
            Some("status".into()),
            None,
        ));
    }
    if actor.id == user_id && status == "disabled" {
        return Err(CoreError::rule(
            "CANNOT_DISABLE_SELF",
            "You cannot disable your own access.",
            None,
            None,
        ));
    }
    let target = membership(conn, organization_id, user_id)?
        .ok_or_else(|| CoreError::NotFound("that member".into()))?;
    if target.role == "owner" && status == "disabled" {
        return Err(CoreError::rule(
            "LAST_OWNER",
            "An organization cannot lose its owner. Transfer ownership first.",
            None,
            None,
        ));
    }
    conn.execute(
        "UPDATE organization_memberships
         SET status = ?3, membership_epoch = membership_epoch + 1
         WHERE organization_id = ?1 AND user_id = ?2",
        params![organization_id, user_id, status],
    )?;
    append_invite_audit(
        conn,
        actor,
        organization_id,
        "organization.member_status_changed",
        user_id,
        format!("Set a member's access to {status}"),
    )?;
    membership(conn, organization_id, user_id)?
        .ok_or_else(|| CoreError::Data("the updated membership could not be read back".into()))
}

/// Moves the owner role in one transaction. The previous owner stays on as a
/// coordinator, so an organization is never left without somebody who can run it.
pub fn transfer_ownership(
    conn: &Connection,
    actor: &Account,
    organization_id: &str,
    user_id: &str,
) -> Result<Membership> {
    let actor_membership =
        crate::authorization::require_membership(conn, organization_id, &actor.id)?;
    if !actor_membership.is_owner() {
        return Err(CoreError::rule(
            "FORBIDDEN",
            "Only the current owner can transfer ownership.",
            None,
            Some("ASK_OWNER".into()),
        ));
    }
    if actor.id == user_id {
        return Ok(actor_membership);
    }
    let target = membership(conn, organization_id, user_id)?
        .ok_or_else(|| CoreError::NotFound("that member".into()))?;
    if !target.is_active() {
        return Err(CoreError::rule(
            "MEMBER_INACTIVE",
            "Only an active member can become the owner.",
            None,
            None,
        ));
    }
    let transaction = conn.unchecked_transaction()?;
    transaction.execute(
        "UPDATE organization_memberships
         SET role = 'owner', membership_epoch = membership_epoch + 1
         WHERE organization_id = ?1 AND user_id = ?2",
        params![organization_id, user_id],
    )?;
    transaction.execute(
        "UPDATE organization_memberships
         SET role = 'coordinator', membership_epoch = membership_epoch + 1
         WHERE organization_id = ?1 AND user_id = ?2",
        params![organization_id, actor.id],
    )?;
    append_invite_audit(
        &transaction,
        actor,
        organization_id,
        "organization.ownership_transferred",
        user_id,
        format!("Transferred ownership to {}", target.user_id),
    )?;
    transaction.commit()?;
    membership(conn, organization_id, user_id)?
        .ok_or_else(|| CoreError::Data("the new owner could not be read back".into()))
}

fn invite_error() -> CoreError {
    CoreError::rule(
        "INVITE_INVALID",
        "That invitation code is not valid. Check it with the coordinator who sent it.",
        None,
        Some("ENTER_CODE".into()),
    )
}

/// Reinstalls the ownership invariant after a full workspace reset drops every
/// table row. Normal migrations create these once; resetting the demo database
/// removes memberships wholesale, which the delete guard would otherwise refuse.
pub fn install_ownership_guards(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TRIGGER IF NOT EXISTS organization_memberships_keep_owner_on_update
         BEFORE UPDATE OF role, status ON organization_memberships
         WHEN OLD.role = 'owner'
          AND (NEW.role <> 'owner' OR NEW.status <> 'active')
          AND NOT EXISTS (
              SELECT 1 FROM organization_memberships
              WHERE organization_id = OLD.organization_id
                AND user_id <> OLD.user_id
                AND role = 'owner'
                AND status = 'active'
          )
         BEGIN SELECT RAISE(ABORT, 'an organization must keep an active owner'); END;

         CREATE TRIGGER IF NOT EXISTS organization_memberships_keep_owner_on_delete
         BEFORE DELETE ON organization_memberships
         WHEN OLD.role = 'owner' AND OLD.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM organization_memberships
              WHERE organization_id = OLD.organization_id
                AND user_id <> OLD.user_id
                AND role = 'owner'
                AND status = 'active'
          )
         BEGIN SELECT RAISE(ABORT, 'an organization must keep an active owner'); END;",
    )?;
    Ok(())
}

/// Gives accounts that predate memberships — the ones already in the database
/// when the membership tables arrived, and the bundled demo accounts — the role
/// they already hold in the workspace organization. Idempotent, so seeding and
/// upgrading can both call it.
pub fn backfill_memberships(conn: &Connection) -> Result<usize> {
    let affected = conn.execute(
        "INSERT INTO organization_memberships
         (organization_id, user_id, role, status, joined_at, membership_epoch)
         SELECT o.id, u.id,
                CASE WHEN u.role = 'coordinator' THEN 'coordinator' ELSE 'volunteer' END,
                'active',
                COALESCE(u.created_at, strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')),
                1
         FROM organizations o
         CROSS JOIN users u
         WHERE NOT EXISTS (
             SELECT 1 FROM organization_memberships m
             WHERE m.organization_id = o.id AND m.user_id = u.id
         )",
        [],
    )?;
    // A workspace upgraded from v11 already had membership rows and therefore
    // no owner. Promote the earliest active coordinator in each such
    // organization; the bundle then always satisfies the ownership invariant.
    conn.execute(
        "UPDATE organization_memberships
         SET role = 'owner'
         WHERE rowid IN (
             SELECT MIN(m.rowid) FROM organization_memberships m
             WHERE m.status = 'active' AND m.role = 'coordinator'
               AND NOT EXISTS (
                   SELECT 1 FROM organization_memberships o
                   WHERE o.organization_id = m.organization_id
                     AND o.role = 'owner' AND o.status = 'active'
               )
             GROUP BY m.organization_id
         )",
        [],
    )?;
    Ok(affected)
}

/// Names are not unique, so a new organization takes the next free slug. The
/// identifier is stable once assigned; only display names change later.
fn unique_organization_id(conn: &Connection, name: &str) -> Result<String> {
    let base = slug_id("org", name);
    let mut candidate = base.clone();
    let mut suffix = 2;
    while load_organization(conn, &candidate)?.is_some() {
        candidate = format!("{base}-{suffix}");
        suffix += 1;
    }
    Ok(candidate)
}
