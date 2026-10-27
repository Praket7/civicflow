# Accounts and hosted auth

CivicFlow is still a local-first desktop app. The workspace, roster, hours, and
reports live in SQLite on the device. Accounts now have two possible homes:

- **Local accounts** are stored in the same database, with Argon2id hashes. They
  work offline and are what the demo workspace uses.
- **Hosted accounts** live in Supabase Auth. They add email confirmation,
  password reset by email, and Google sign-in.

Hosted auth is optional. If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
are both empty, the app behaves exactly as it did before and makes no network
requests for accounts.

## How the two fit together

`src/lib/auth/hosted.ts` wraps the Supabase client and hides the configuration
switch. `AuthProvider` tries the hosted provider first, then falls back to the
local repository:

```text
email + password
  → Supabase signInWithPassword
  → success: resume the local account with sign_in_with_hosted
  → failure: try the local database (demo accounts, coordinator resets)
```

When a hosted identity signs in for the first time, the Rust command
`sign_in_with_hosted` creates a local user with `password_hash = NULL`. That
account can read and write the workspace offline, and the coordinator can still
see it under Settings → Accounts. A coordinator can set a local password for it
there; until then, the local password form reports that the account has not been
activated.

Sign-up with a hosted provider works like this:

1. Supabase creates the user and emails a confirmation link.
2. The link returns to `/auth/callback` in the browser build, or to
   `civicflow://auth/callback` in the installed app.
3. The app stores the session and creates the local workspace account using the
   name and role chosen on the sign-up form.

Email links use the implicit flow, so the tokens arrive in the URL fragment.
That matters on desktop: the link works after the app has been closed, and it
does not depend on a PKCE verifier stored in a different browser. Fragments are
not sent to servers or included in referrers.

## The project that is wired now

| Setting             | Value                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project             | `civicflow-auth` (`imzdblvljdcbnxtwbmbw`, us-east-2)                                                                                                              |
| Site URL            | `http://localhost:5173`                                                                                                                                           |
| Redirect allow list | `http://localhost:5173`, `http://localhost:5173/auth/callback`, `http://localhost:5173/reset-password`, `civicflow://auth/callback`, `civicflow://reset-password` |
| Google provider     | Enabled, client holds the Supabase callback                                                                                                                       |
| Email provider      | Supabase built-in SMTP (development only)                                                                                                                         |
| Confirmation        | Required                                                                                                                                                          |
| Password minimum    | 8 characters                                                                                                                                                      |

The publishable key lives in `.env.local`, which is ignored by git. It is meant
to ship in a client. The service-role key is not used anywhere in the app and
must never be added to an environment file in this repository.

The browser build asks the provider to return to `window.location.origin`, so
the Site URL and the allow list have to name the port the dev server actually
uses (`pnpm dev` runs on 5173, fixed in `vite.config.ts`). The older 5199
entries belong to the print-audit server in `scripts/audit-print.mjs` and do not
cover the app. A return to an origin that is not on the list is silently
replaced with the Site URL, which looks like a dead link rather than a
configuration mistake.

The built-in mailer allows a couple of messages per hour. Before a real
deployment, set custom SMTP under Authentication → Emails. The default sender
also tends to land in spam.

## Local development

```bash
cp .env.example .env.local     # fill in the project URL and publishable key
pnpm dev                       # web build at http://localhost:5173
pnpm tauri dev                 # desktop build, uses the same env values
```

The desktop build registers the `civicflow://` scheme through
`tauri-plugin-deep-link`; the scheme is declared in `src-tauri/tauri.conf.json`
and appears in the app's `Info.plist` after a build. Email links only reach the
installed app after that build has run once.

Run `pnpm typecheck`, `pnpm test`, and `cargo test --manifest-path
src-tauri/core/Cargo.toml` before shipping changes to this area.

## Google sign-in

Google is enabled on the project above. The client ID and secret live in
Supabase under Authentication → Providers → Google, never in this repository.
The desktop app keeps no copy: it asks Supabase for an authorization URL and
lets Supabase hold the secret.

How a Google sign-in travels:

1. The sign-in or create-account screen calls `startHostedOAuth`, which returns
   the provider URL without navigating.
2. The desktop build hands that URL to the system browser through the
   `open_external_url` command. Google refuses to render its consent screen
   inside a webview, so accounts.google.com never loads in the app window.
3. Google returns to `https://imzdblvljdcbnxtwbmbw.supabase.co/auth/v1/callback`.
4. Supabase returns to `civicflow://auth/callback#access_token=…`. The deep-link
   handler resumes the session and creates the local workspace account.

macOS can hand the same launch URL to the app twice — once through
`getCurrent()` and once through the open-url event. The handler keeps the first
answer and ignores the repeat. It also reads the hand-off mark without spending
it and clears it only after a local session has been adopted, so a repeated
delivery or a transient exchange error cannot turn a valid link into "this was
not requested". When a link is refused, the app opens the callback page with the
reason instead of dropping back to the sign-in screen; an expired OAuth request
("the state has expired") is reported separately from an expired email link,
because the two need different next steps.

The native side records every scheme URL the operating system delivers, before
any page has a chance to read it. That matters because the callback page keeps
its route in the fragment and rewrites the address as soon as it reads the
tokens: a reload, a second window, or a delivery that arrives after the page has
already rendered used to look exactly like an expired link. The callback page now
looks for the answer in the address, then in the answer this tab kept, then in
the address the app recorded — and while a hand-off this device started is still
outstanding it waits for the browser instead of showing an error. Only when none
of those exist does it say the window has no answer, and the panel offers the
sign-in screen rather than asking for a new email.

The native test suite runs against the same webview store as the installed app.
It used to delete that store before every run, which signed the real app out and
could erase a hand-off that was in flight, so it no longer does; the throwaway
SQLite database is enough to make the signed-out assertions hold.

The role picked on the form before the hand-off decides the access level of the
new local account, because Google knows nothing about CivicFlow roles. In the
browser build the same flow returns to `/auth/callback` instead.

### Adding test users to the consent screen

While the OAuth consent screen is in **Testing**, Google only lets listed
accounts through. Everything else stops with `Error 403: access_denied` after
the account is chosen.

1. Open the [Google Cloud console](https://console.cloud.google.com/) and pick
   the CivicFlow project.
2. Go to **APIs & Services → OAuth consent screen**. Newer consoles show this as
   **Google Auth Platform → Audience**.
3. Find **Test users**, click **Add users**, and enter the address
   (for example `praketg1@gmail.com`). Add every address you plan to demo with.
4. **Save**. Google applies the change within a few minutes; reload the consent
   screen if the list still looks stale.

To demo with anyone at all, click **Publish app**. That removes the test-user
limit but puts the app in front of Google's verification for the `email` and
`profile` scopes, so keep it in Testing until the demo is over.

The OAuth client's authorized redirect URI must stay exactly:

```text
https://imzdblvljdcbnxtwbmbw.supabase.co/auth/v1/callback
```

## What was verified

- Hosted sign-up with confirmation temporarily disabled: the Supabase user was
  created, the local account was resumed, and the app routed to the selected
  role's setup screen.
- Hosted sign-in with the same account, including the local fallback when the
  address only exists in SQLite.
- A password reset request reaches Supabase and returns 200 for the web
  redirect.
- Compact unit and integration coverage for the Rust account linking, plus the
  full Vitest and accessibility suites.
- Google is enabled on the project: `GET /auth/v1/authorize?provider=google`
  answers `302` to `accounts.google.com` with this client ID and the Supabase
  callback as its redirect URI, and Google accepts that redirect URI instead of
  failing with `redirect_uri_mismatch`.
- Both buttons in the web build reach Google's account screen for this client,
  and the chosen role is still in local storage when the browser comes back.
- A canceled consent screen (`access_denied`) lands on the callback page with
  "Google sign-in was canceled", not the expired-link wording.

Not verified end to end: delivery to a real inbox, clicking a confirmation or
recovery link from a mail client, and choosing a Google account in the browser.
Those need a mailbox and a signed-in Google session.
