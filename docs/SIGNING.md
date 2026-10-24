# Code signing and notarization

The release workflow signs and notarizes macOS builds, and signs Windows builds, when the
repository secrets below are present. Without them it still publishes the same installers,
unsigned. The steps live in `.github/workflows/release.yml`.

Unsigned macOS builds are still ad-hoc signed, because
`src-tauri/tauri.conf.json` sets `bundle.macOS.signingIdentity` to `-`. That binds
`Info.plist` and seals the resources, so Gatekeeper reports a normal unverified app that
**Open Anyway** can start. A bundle with no signature at all is instead reported as damaged
and macOS only offers **Move to Trash**. Set `APPLE_SIGNING_IDENTITY` (the workflow does,
when the certificate secret is present) and Tauri signs with the Developer ID identity
instead.

## Secrets

Add these under **Settings → Secrets and variables → Actions → New repository secret**.
Never commit a certificate or password to the repository.

| Secret                         | Required for       | Value                                                  |
| ------------------------------ | ------------------ | ------------------------------------------------------ |
| `APPLE_CERTIFICATE`            | macOS              | Base64 of the exported Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD`   | macOS              | Password chosen when exporting the `.p12`              |
| `APPLE_ID`                     | macOS              | Apple ID email used for notarization                   |
| `APPLE_PASSWORD`               | macOS              | App-specific password for that Apple ID                |
| `APPLE_TEAM_ID`                | macOS              | Ten-character Apple Developer team ID                  |
| `APPLE_API_KEY`                | macOS, alternative | App Store Connect API key ID                           |
| `APPLE_API_ISSUER`             | macOS, alternative | App Store Connect issuer UUID                          |
| `APPLE_API_KEY_CONTENT`        | macOS, alternative | Base64 of the downloaded `AuthKey_*.p8`                |
| `WINDOWS_CERTIFICATE`          | Windows            | Base64 of the code-signing `.pfx`                      |
| `WINDOWS_CERTIFICATE_PASSWORD` | Windows            | Password chosen when exporting the `.pfx`              |
| `WINDOWS_TIMESTAMP_URL`        | Windows, optional  | RFC 3161 timestamp server; defaults to DigiCert        |

Use either the Apple ID trio or the API key trio, not both. The workflow fails early if a
certificate is present but no notarization credentials are.

## macOS

Notarization needs a paid Apple Developer account. A free account can sign for local
testing but cannot notarize, so Gatekeeper will still warn.

1. In **Certificates, Identifiers & Profiles**, create a **Developer ID Application**
   certificate and download it.
2. In Keychain Access, open **My Certificates**, expand the certificate, right-click the
   private key, and export a `.p12` with a password.
3. Base64-encode it and set `APPLE_CERTIFICATE`:

   ```bash
   base64 -i DeveloperID.p12 -o certificate-base64.txt
   ```

4. Create an app-specific password at [appleid.apple.com](https://appleid.apple.com), then
   set `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID`.
5. Delete the local `.p12` and the base64 file after adding the secret.

For the API key path, create a **Developer** key in App Store Connect → Users and Access →
Integrations, download the `.p8` once, and set `APPLE_API_KEY`,
`APPLE_API_ISSUER`, and `APPLE_API_KEY_CONTENT` (the base64 of the `.p8`).

The workflow imports the certificate into a temporary keychain, finds the
`Developer ID Application` identity, and lets Tauri sign, notarize, and staple the app and
DMG. To pin the identity locally, export `APPLE_SIGNING_IDENTITY="Developer ID Application:
Your Name (TEAMID)"` before `pnpm tauri build`; it overrides the ad-hoc default.

## Windows

Buy a code-signing certificate from a public CA. An OV certificate is enough for
Authenticode; an EV certificate no longer bypasses SmartScreen reputation checks.

1. Export the certificate and private key as a password-protected `.pfx`.
2. Base64-encode it and set `WINDOWS_CERTIFICATE`:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.pfx")) |
     Set-Content certificate-base64.txt
   ```

3. Set `WINDOWS_CERTIFICATE_PASSWORD`.
4. Optionally set `WINDOWS_TIMESTAMP_URL` to your CA's timestamp service. The default is
   `http://timestamp.digicert.com`.

The workflow imports the certificate into the Windows certificate store and passes its
thumbprint to Tauri through `TAURI_CONFIG`, so the executable, MSI, and NSIS installer are
all signed with `signtool`.

A newly issued certificate starts without SmartScreen reputation. Signed installers show
the publisher name, but Windows may still show "Windows protected your PC" for the first
downloads until Microsoft has seen enough clean installs. Submitting the installer to
Microsoft for review can speed that up.

## Verify a release

macOS:

```bash
codesign --verify --deep --strict --verbose=2 /Applications/CivicFlow.app
spctl --assess --type execute --verbose=4 /Applications/CivicFlow.app
xcrun stapler validate /Applications/CivicFlow.app
```

Windows, in PowerShell:

```powershell
Get-AuthenticodeSignature .\CivicFlow_0.1.1_x64-setup.exe | Format-List
```

`Status` should be `Valid` and `SignerCertificate.Subject` should name the publisher.

Linux packages are not code-signed. The `.deb` and `.rpm` rely on the distribution's
package-signing and repository trust model; publish checksums in the release.
