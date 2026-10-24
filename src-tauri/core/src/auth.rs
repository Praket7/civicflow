//! Local account authentication.
//!
//! The workspace is offline and single-device, but it still separates the
//! coordinator from the volunteer. Passwords are stored as Argon2id hashes and
//! sessions are opaque tokens whose SHA-256 hash is kept in SQLite. Tokens are
//! never written to disk in plain text.

use argon2::password_hash::{
    rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
};
use argon2::Argon2;
use chrono::{Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{CoreError, Result};

const DEMO_PASSWORD: &str = "civicflow-demo";
const REMEMBER_DAYS: i64 = 30;
const SHORT_SESSION_HOURS: i64 = 12;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub volunteer_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub token: String,
    pub user: Account,
    pub expires_at: String,
}

fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| CoreError::Data(format!("password hashing failed: {error}")))
}

fn verify_password(hash: &str, password: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

fn token_hash(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

fn validate_password(password: &str) -> Result<()> {
    if password.chars().count() < 8 {
        return Err(CoreError::rule(
            "PASSWORD_TOO_SHORT",
            "Use at least 8 characters for the password.",
            Some("password".into()),
            None,
        ));
    }
    if password.chars().count() > 200 {
        return Err(CoreError::Validation(
            "Passwords must be 200 characters or fewer.".into(),
        ));
    }
    Ok(())
}

fn load_account(conn: &Connection, user_id: &str) -> Result<Option<Account>> {
    Ok(conn
        .query_row(
            "SELECT id, name, email, role, volunteer_id FROM users WHERE id = ?1",
            params![user_id],
            |row| {
                Ok(Account {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    email: row.get(2)?,
                    role: row.get(3)?,
                    volunteer_id: row.get(4)?,
                })
            },
        )
        .optional()?)
}

type SignInRow = (
    String,
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    String,
);

pub fn sign_in(
    conn: &Connection,
    email: &str,
    password: &str,
    remember: bool,
) -> Result<AuthSession> {
    let clean_email = email.trim().to_lowercase();
    let row: Option<SignInRow> = conn
        .query_row(
            "SELECT id, name, email, role, volunteer_id, password_hash, status
             FROM users WHERE lower(email) = ?1",
            params![clean_email],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                ))
            },
        )
        .optional()?;

    let Some((id, name, stored_email, role, volunteer_id, password_hash, status)) = row else {
        return Err(CoreError::rule(
            "INVALID_CREDENTIALS",
            "That email and password do not match an account on this device.",
            Some("email".into()),
            None,
        ));
    };

    if status != "active" {
        return Err(CoreError::rule(
            "ACCOUNT_DISABLED",
            "This account has been disabled by the coordinator.",
            Some("email".into()),
            Some("CONTACT_COORDINATOR".into()),
        ));
    }

    let Some(password_hash) = password_hash else {
        return Err(CoreError::rule(
            "PASSWORD_NOT_SET",
            "This account has not been activated yet. Ask the coordinator to reset its password.",
            Some("email".into()),
            Some("CONTACT_COORDINATOR".into()),
        ));
    };

    if !verify_password(&password_hash, password) {
        return Err(CoreError::rule(
            "INVALID_CREDENTIALS",
            "That email and password do not match an account on this device.",
            Some("password".into()),
            None,
        ));
    }

    let now = Utc::now();
    let lifetime = if remember {
        Duration::days(REMEMBER_DAYS)
    } else {
        Duration::hours(SHORT_SESSION_HOURS)
    };
    let expires_at = (now + lifetime).to_rfc3339();
    let token = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            uuid::Uuid::new_v4().to_string(),
            id,
            token_hash(&token),
            now.to_rfc3339(),
            expires_at,
        ],
    )?;
    conn.execute(
        "UPDATE users SET last_login_at = ?1 WHERE id = ?2",
        params![now.to_rfc3339(), id],
    )?;
    conn.execute(
        "INSERT INTO audit_events
         (id, timestamp, actor_type, actor_id, action, entity_type, entity_id, summary)
         VALUES (?1, ?2, ?3, ?4, 'auth.sign_in', 'user', ?4, ?5)",
        params![
            uuid::Uuid::new_v4().to_string(),
            now.to_rfc3339(),
            role,
            id,
            format!("Signed in {stored_email}"),
        ],
    )?;

    Ok(AuthSession {
        token,
        user: Account {
            id,
            name,
            email: stored_email,
            role,
            volunteer_id,
        },
        expires_at,
    })
}

pub fn current_user(conn: &Connection, token: &str) -> Result<Option<Account>> {
    if token.trim().is_empty() {
        return Ok(None);
    }
    let now = Utc::now().to_rfc3339();
    Ok(conn
        .query_row(
            "SELECT u.id, u.name, u.email, u.role, u.volunteer_id
             FROM auth_sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ?1
               AND s.revoked_at IS NULL
               AND s.expires_at > ?2
               AND u.status = 'active'",
            params![token_hash(token), now],
            |row| {
                Ok(Account {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    email: row.get(2)?,
                    role: row.get(3)?,
                    volunteer_id: row.get(4)?,
                })
            },
        )
        .optional()?)
}

pub fn require_user(conn: &Connection, token: &str) -> Result<Account> {
    current_user(conn, token)?.ok_or_else(|| {
        CoreError::rule(
            "AUTH_REQUIRED",
            "Sign in again to continue.",
            None,
            Some("SIGN_IN".into()),
        )
    })
}

pub fn require_coordinator(conn: &Connection, token: &str) -> Result<Account> {
    let account = require_user(conn, token)?;
    if account.role != "coordinator" {
        return Err(CoreError::rule(
            "FORBIDDEN",
            "Only a coordinator can do that.",
            None,
            Some("RETURN_TO_VOLUNTEER_HOME".into()),
        ));
    }
    Ok(account)
}

pub fn sign_out(conn: &Connection, token: &str, actor: &Account) -> Result<bool> {
    let now = Utc::now().to_rfc3339();
    let changed = conn.execute(
        "UPDATE auth_sessions SET revoked_at = ?1
         WHERE token_hash = ?2 AND revoked_at IS NULL",
        params![now, token_hash(token)],
    )?;
    if changed > 0 {
        conn.execute(
            "INSERT INTO audit_events
             (id, timestamp, actor_type, actor_id, action, entity_type, entity_id, summary)
             VALUES (?1, ?2, ?3, ?4, 'auth.sign_out', 'user', ?4, ?5)",
            params![
                uuid::Uuid::new_v4().to_string(),
                now,
                actor.role,
                actor.id,
                format!("Signed out {}", actor.email),
            ],
        )?;
    }
    Ok(changed > 0)
}

pub fn list_accounts(conn: &Connection, token: &str) -> Result<Vec<Account>> {
    require_coordinator(conn, token)?;
    let mut statement = conn.prepare(
        "SELECT id, name, email, role, volunteer_id
         FROM users ORDER BY role, name",
    )?;
    let mut rows = statement.query([])?;
    let mut accounts = Vec::new();
    while let Some(row) = rows.next()? {
        accounts.push(Account {
            id: row.get(0)?,
            name: row.get(1)?,
            email: row.get(2)?,
            role: row.get(3)?,
            volunteer_id: row.get(4)?,
        });
    }
    Ok(accounts)
}

pub fn reset_password(
    conn: &Connection,
    token: &str,
    user_id: &str,
    new_password: &str,
) -> Result<()> {
    let actor = require_coordinator(conn, token)?;
    validate_password(new_password)?;
    let account = load_account(conn, user_id)?
        .ok_or_else(|| CoreError::NotFound(format!("Account {user_id}")))?;
    let hash = hash_password(new_password)?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE users SET password_hash = ?1, status = 'active' WHERE id = ?2",
        params![hash, account.id],
    )?;
    conn.execute(
        "UPDATE auth_sessions SET revoked_at = ?1
         WHERE user_id = ?2 AND revoked_at IS NULL",
        params![now, account.id],
    )?;
    conn.execute(
        "INSERT INTO audit_events
         (id, timestamp, actor_type, actor_id, action, entity_type, entity_id, summary)
         VALUES (?1, ?2, 'coordinator', ?3, 'auth.password_reset', 'user', ?4, ?5)",
        params![
            uuid::Uuid::new_v4().to_string(),
            now,
            actor.id,
            account.id,
            format!("Reset password for {}", account.email),
        ],
    )?;
    Ok(())
}

fn upsert_account(
    conn: &Connection,
    id: &str,
    name: &str,
    email: &str,
    role: &str,
    volunteer_id: Option<&str>,
    demo_now: &str,
) -> Result<()> {
    let existing: Option<Option<String>> = conn
        .query_row(
            "SELECT password_hash FROM users WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()?;
    let hash = match existing {
        Some(Some(hash)) => hash,
        _ => hash_password(DEMO_PASSWORD)?,
    };
    conn.execute(
        "INSERT INTO users (id, name, email, role, volunteer_id, password_hash, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7)
         ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             email = excluded.email,
             role = excluded.role,
             volunteer_id = excluded.volunteer_id,
             password_hash = COALESCE(users.password_hash, excluded.password_hash)",
        params![id, name, email, role, volunteer_id, hash, demo_now],
    )?;
    Ok(())
}

/// Creates the two demo accounts on first launch and backfills a password for a
/// database that predates account support. A password the coordinator has reset
/// is never overwritten.
pub fn seed_demo_accounts(conn: &Connection, demo_now: &str) -> Result<()> {
    let coordinator_id: Option<String> = conn
        .query_row(
            "SELECT id FROM users WHERE role = 'coordinator' ORDER BY created_at LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(id) = coordinator_id {
        conn.execute(
            "UPDATE users SET email = 'praket@feedmorewny.org',
                              name = COALESCE(NULLIF(name, ''), 'Praket Gauri'),
                              password_hash = COALESCE(password_hash, ?1)
             WHERE id = ?2",
            params![hash_password(DEMO_PASSWORD)?, id],
        )?;
    } else {
        upsert_account(
            conn,
            "user-praket",
            "Praket Gauri",
            "praket@feedmorewny.org",
            "coordinator",
            None,
            demo_now,
        )?;
    }

    let volunteer: Option<(String, String, String)> = conn
        .query_row(
            "SELECT id, name, email FROM volunteers
             WHERE id = (SELECT value FROM app_settings WHERE key = 'current_volunteer_id')
             LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    if let Some((volunteer_id, name, email)) = volunteer {
        upsert_account(
            conn,
            "user-maya",
            &name,
            &email,
            "volunteer",
            Some(&volunteer_id),
            demo_now,
        )?;
    }

    Ok(())
}
