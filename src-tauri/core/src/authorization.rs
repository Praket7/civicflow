//! Who may act on which organization.
//!
//! Every protected operation resolves the session to an account here and then
//! asks for the membership it needs, so a caller cannot skip authorization by
//! passing a different organization identifier. The frontend may hide a screen,
//! but it cannot grant access.

use rusqlite::Connection;

use crate::auth::{require_user, Account};
use crate::error::{CoreError, Result};
use crate::organizations::{self, Membership};

/// The membership an account holds in an organization, or a failure the UI can
/// act on: no membership at all, a disabled one, or an unknown organization.
pub fn require_membership(
    conn: &Connection,
    organization_id: &str,
    user_id: &str,
) -> Result<Membership> {
    organizations::require_organization(conn, organization_id)?;
    let membership = organizations::membership(conn, organization_id, user_id)?;
    let Some(membership) = membership else {
        return Err(CoreError::rule(
            "FORBIDDEN",
            "You do not have access to that organization.",
            None,
            Some("CHOOSE_ORGANIZATION".into()),
        ));
    };
    if !membership.is_active() {
        return Err(CoreError::rule(
            "FORBIDDEN",
            "Your access to that organization is disabled.",
            None,
            Some("CONTACT_COORDINATOR".into()),
        ));
    }
    Ok(membership)
}

pub fn require_coordinator(
    conn: &Connection,
    organization_id: &str,
    user_id: &str,
) -> Result<Membership> {
    let membership = require_membership(conn, organization_id, user_id)?;
    if !membership.is_coordinator() {
        return Err(CoreError::rule(
            "FORBIDDEN",
            "Only a coordinator can do that.",
            None,
            Some("RETURN_TO_VOLUNTEER_HOME".into()),
        ));
    }
    Ok(membership)
}

/// Resolves the session token and the organization in one step. Commands that
/// act on an organization take this pair rather than a token alone.
pub fn require_member_session(
    conn: &Connection,
    token: &str,
    organization_id: &str,
) -> Result<(Account, Membership)> {
    let account = require_user(conn, token)?;
    let membership = require_membership(conn, organization_id, &account.id)?;
    Ok((account, membership))
}

pub fn require_coordinator_session(
    conn: &Connection,
    token: &str,
    organization_id: &str,
) -> Result<(Account, Membership)> {
    let account = require_user(conn, token)?;
    let membership = require_coordinator(conn, organization_id, &account.id)?;
    Ok((account, membership))
}
