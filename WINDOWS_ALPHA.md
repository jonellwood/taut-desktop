# Windows alpha readiness

Target confirmed November 20, 2026: two Windows 11 ARM64 testers. macOS is second; Linux remains deferred. Candidate version: 1.4.4-alpha.1. This is an internal pilot, not a public release.

## Implemented for the candidate

- OAuth opens the OS default browser through the existing Tauri opener. Existing tenant/client, PKCE, localhost callback, scope set and Rust-only token handling remain unchanged.
- Windows stores refresh tokens in the signed-in Windows user's Credential Manager, under the existing app/tenant/client namespace. Access tokens remain in Rust memory. There is no plaintext fallback. macOS retains the same Keychain service/account names and existing saved sessions.
- Generic Windows credentials have a 2560-byte blob limit. An oversized refresh token fails saving safely, leaves existing stored credentials untouched and displays the existing temporary-session warning. Verify persistence with the tenant's actual tokens before approving this pilot. Do not treat a temporary sign-in as a successful persistence test.
- Mail attachment saving uses a native Windows Save dialog, with sanitized filename suggestions, explicit destination selection and cancel support. macOS keeps its existing Save dialog. No file is opened automatically.
- Session, appearance and notification settings use platform-neutral copy. Notification startup has only the existing read-only permission-check capability; notification sending remains in Rust and user-controlled Settings.
- JavaScript, Cargo and Tauri versions agree. A Windows-only Tauri override selects NSIS, the existing logo converted to ICO, current-user installation and WebView2 bootstrapper download if needed.

## Builds and artifacts

CI checks the Rust backend on macOS, Windows x64 and Windows ARM64. All automated Graph calls use mocks. Tests do not run interactive OAuth, write real credentials, send real messages or open save dialogs.

The **Windows alpha candidate** workflow builds on `windows-11-arm` and explicitly targets `aarch64-pc-windows-msvc`. It tests the backend, builds the UI and NSIS installer, verifies the application's PE machine type is ARM64, and uploads the installer with SHA256SUMS.txt as a 14-day Actions artifact. No GitHub Release is published and no tester receives a message automatically. Artifacts inherit repository access: this repository is public, so these are internal candidates by intended audience, not an invitation-only download channel. It runs on relevant pushes to `feat/message-deletion`; manual dispatch is also declared (GitHub requires the workflow on the default branch for its manual UI).

Tauri's NSIS setup program itself runs under x86 emulation; the installed TAUT application is native ARM64. The candidate is unsigned: signing/IT distribution approval remains a release decision. The WebView2 bootstrapper may require network access if the runtime is absent. Do not bypass organizational installation policies.

On a Windows ARM64 development machine with Node 24, Rust MSVC, Visual Studio C++ build tools and WebView2:

```powershell
npm ci
rustup target add aarch64-pc-windows-msvc
npm run tauri -- build --target aarch64-pc-windows-msvc --bundles nsis --config src-tauri/tauri.windows.conf.json -- --locked
```

Expected output: `src-tauri/target/aarch64-pc-windows-msvc/release/bundle/nsis/*-setup.exe`.

## Acceptance on an actual Windows 11 ARM64 PC

1. Install as an ordinary user; verify the correct app identity/icon and launch without a developer terminal. Record OS version, app version and installer checksum.
2. Sign in through the default browser. Check that existing tenant consent/Conditional Access permits the pilot account. The local loopback callback must return to TAUT. No new Graph scopes are requested by this work.
3. Fully quit and relaunch. Confirm saved sign-in restores, then sign out and relaunch again to confirm it cannot restore. These deliberate checks use the tester's own credentials; automated tests never touch them.
4. Read chats, load older history, switch workspaces, and preserve an unsent draft. Verify core Mail and Calendar reading. Test sends/edits only as deliberate user actions to agreed test recipients/events.
5. Save an attachment; cancel a save; verify Unicode names, an existing-file overwrite prompt and an unwritable destination. Confirm bytes match the original.
6. Opt in to notifications, test a banner and click routing, and verify the installed app's identity and Windows notification settings. Disabled notifications should stay quiet.
7. Test Ctrl+K/Ctrl+Shift+K, keyboard focus, file picker/drop/paste, display scaling and appearance changes.
8. Test an upgrade and uninstall. Local draft/preferences retention and Credential Manager cleanup must be verified/documented before distribution; sign out before uninstalling the pilot. Automatic updates are not configured.

Settings → Feedback now opens a prefilled draft in the existing public GitHub Issues repository, per user preference. Only the app version and empty prompts are included; account/chat/email/log data is not attached. Users review and submit on GitHub. Remaining pilot work: clean-machine acceptance, code-signing/distribution decision, known limitations/release notes, and update/uninstall instructions. Recurring meeting editing, creating Teams meeting links and Linux packaging remain deferred. This document does not assert a successful Windows installer build or native acceptance until the corresponding evidence is recorded.

References: [Tauri Windows installers](https://tauri.app/distribute/windows-installer/), [Credential Manager credential limits](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw), [GitHub ARM64 runners in private repositories](https://github.blog/changelog/2026-01-29-arm64-standard-runners-are-now-available-in-private-repositories/).

The first native Windows test runs uncovered a Unix-only directory sync in the away reservation ledger. Windows now uses a flushed temporary file followed by MoveFileExW with replacement and write-through flags; Unix retains rename plus directory fsync. Tests cover replacing an existing ledger and existing reserve/restart safety. See https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw.
