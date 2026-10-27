//! Who may act on which organization.
//!
//! Every protected operation resolves the session to an account here and then
//! asks for the membership it needs, so a caller cannot skip authorization by
//! passing a different organization identifier. The frontend may hide a screen,
//! but it cannot grant access.

use rusqlite::Connection;

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
