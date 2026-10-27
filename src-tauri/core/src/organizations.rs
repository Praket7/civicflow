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
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Membership {
    pub organization_id: String,
    pub user_id: String,
    pub role: String,
    pub status: String,
    pub joined_at: String,
}

impl Membership {
    pub fn is_active(&self) -> bool {
        self.status == "active"
    }

    pub fn is_coordinator(&self) -> bool {
        self.role == "coordinator"
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IssuedInvite {
    pub id: String,
    pub organization_id: String,
    pub role: String,
    /// Returned once, when the invitation is created. Only its hash is stored.
    pub token: String,
    pub expires_at: String,
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
    })
}

const ORGANIZATION_COLUMNS: &str = "id, name, initials, mission, description, city, state, address,
     website, email, timezone, visibility, image, image_alt, created_at, created_by_user_id";

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
        "SELECT {ORGANIZATION_COLUMNS}, m.organization_id, m.user_id, m.role, m.status, m.joined_at
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
                organization_id: row.get(16)?,
                user_id: row.get(17)?,
                role: row.get(18)?,
                status: row.get(19)?,
                joined_at: row.get(20)?,
            },
        ));
    }
    Ok(memberships)
}

pub fn membership(
    conn: &Connection,
    organization_id: &str,
    user_id: &str,
) -> Result<Option<Membership>> {
    Ok(conn
        .query_row(
            "SELECT organization_id, user_id, role, status, joined_at
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
        "INSERT INTO organization_memberships (organization_id, user_id, role, status, joined_at)
         VALUES (?1, ?2, 'coordinator', 'active', ?3)",
        params![id, creator.id, now],
    )?;
    transaction.commit()?;

    require_organization(conn, &id)
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

/// Issues a one-time invitation on behalf of a coordinator.
pub fn create_invite(
    conn: &Connection,
    actor: &Account,
    organization_id: &str,
    role: &str,
) -> Result<IssuedInvite> {
    crate::authorization::require_coordinator(conn, organization_id, &actor.id)?;
    if role != "coordinator" && role != "volunteer" {
        return Err(CoreError::rule(
            "VALIDATION",
            "An invitation is either for a coordinator or for a volunteer.",
            Some("role".into()),
            None,
        ));
    }
    let now = Utc::now();
    let token = random_token();
    let invite = IssuedInvite {
        id: uuid::Uuid::new_v4().to_string(),
        organization_id: organization_id.to_string(),
        role: role.to_string(),
        token,
        expires_at: (now + Duration::days(INVITE_TTL_DAYS)).to_rfc3339(),
    };
    conn.execute(
        "INSERT INTO organization_invites
         (id, organization_id, role, token_hash, created_by_user_id, created_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            invite.id,
            organization_id,
            role,
            token_hash(&invite.token),
            actor.id,
            now.to_rfc3339(),
            invite.expires_at,
        ],
    )?;
    Ok(invite)
}

/// Redeems an invitation for the signed-in account. An invitation is single-use,
/// expires, and cannot revive a membership a coordinator disabled.
pub fn redeem_invite(conn: &Connection, user_id: &str, token: &str) -> Result<Membership> {
    let clean = token.trim();
    if clean.is_empty() {
        return Err(invite_error());
    }
    let now = Utc::now().to_rfc3339();
    let transaction = conn.unchecked_transaction()?;
    let invite: Option<(String, String, String, String)> = transaction
        .query_row(
            "SELECT id, organization_id, role, expires_at
             FROM organization_invites
             WHERE token_hash = ?1 AND redeemed_at IS NULL",
            params![token_hash(clean)],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()?;
    let Some((invite_id, organization_id, role, expires_at)) = invite else {
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
        "INSERT INTO organization_memberships (organization_id, user_id, role, status, joined_at)
         VALUES (?1, ?2, ?3, 'active', ?4)
         ON CONFLICT (organization_id, user_id)
         DO UPDATE SET role = excluded.role, status = 'active'",
        params![organization_id, user_id, role, joined_at],
    )?;
    transaction.execute(
        "UPDATE organization_invites
         SET redeemed_at = ?2, redeemed_by_user_id = ?3
         WHERE id = ?1",
        params![invite_id, now, user_id],
    )?;
    transaction.commit()?;

    membership(conn, &organization_id, user_id)?
        .ok_or_else(|| CoreError::Data("the redeemed membership could not be read back".into()))
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
        return Ok(existing);
    }
    conn.execute(
        "INSERT INTO organization_memberships (organization_id, user_id, role, status, joined_at)
         VALUES (?1, ?2, 'volunteer', 'active', ?3)",
        params![organization_id, user_id, Utc::now().to_rfc3339()],
    )?;
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
    crate::authorization::require_coordinator(conn, organization_id, &actor.id)?;
    if role != "coordinator" && role != "volunteer" {
        return Err(CoreError::rule(
            "VALIDATION",
            "A member is either a coordinator or a volunteer.",
            Some("role".into()),
            None,
        ));
    }
    if actor.id == user_id && role != "coordinator" {
        return Err(CoreError::rule(
            "LAST_COORDINATOR",
            "You cannot remove your own coordinator access.",
            None,
            None,
        ));
    }
    let changed = conn.execute(
        "UPDATE organization_memberships SET role = ?3
         WHERE organization_id = ?1 AND user_id = ?2",
        params![organization_id, user_id, role],
    )?;
    if changed == 0 {
        return Err(CoreError::NotFound("that member".into()));
    }
    membership(conn, organization_id, user_id)?
        .ok_or_else(|| CoreError::Data("the updated membership could not be read back".into()))
}

fn invite_error() -> CoreError {
    CoreError::rule(
        "INVITE_INVALID",
        "That invitation code is not valid. Check it with the coordinator who sent it.",
        None,
        Some("ENTER_CODE".into()),
    )
}

/// Gives accounts that predate memberships — the ones already in the database
/// when the membership tables arrived, and the bundled demo accounts — the role
/// they already hold in the workspace organization. Idempotent, so seeding and
/// upgrading can both call it.
pub fn backfill_memberships(conn: &Connection) -> Result<usize> {
    Ok(conn.execute(
        "INSERT INTO organization_memberships (organization_id, user_id, role, status, joined_at)
         SELECT o.id, u.id, u.role, 'active',
                COALESCE(u.created_at, strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now'))
         FROM organizations o
         CROSS JOIN users u
         WHERE NOT EXISTS (
             SELECT 1 FROM organization_memberships m
             WHERE m.organization_id = o.id AND m.user_id = u.id
         )",
        [],
    )?)
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
