# Windows alpha readiness

Target confirmed November 20, 2026: two Windows 11 ARM64 testers. macOS is second; Linux remains deferred. Current source candidate version: 1.4.4-alpha.2 (Workflow card preview follow-up; earlier download links below are alpha.1). This is an internal pilot, not a public release.

## Implemented for the candidate

- OAuth opens the OS default browser through the existing Tauri opener. Existing tenant/client, PKCE, localhost callback, scope set and Rust-only token handling remain unchanged.
- Windows stores refresh tokens in the signed-in Windows user's Credential Manager, under the existing app/tenant/client namespace. Access tokens remain in Rust memory. There is no plaintext fallback. macOS retains the same Keychain service/account names and existing saved sessions.
- Generic Windows credentials have a 2560-byte blob limit. An oversized refresh token fails saving safely, leaves existing stored credentials untouched and displays the existing temporary-session warning. Verify persistence with the tenant's actual tokens before approving this pilot. Do not treat a temporary sign-in as a successful persistence test.
- Mail attachment saving uses a native Windows Save dialog, with sanitized filename suggestions, explicit destination selection and cancel support. macOS keeps its existing Save dialog. No file is opened automatically.
- Session, appearance and notification settings use platform-neutral copy. Notification startup has only the existing read-only permission-check capability; notification sending remains in Rust and user-controlled Settings.
- JavaScript, Cargo and Tauri versions agree. A Windows-only Tauri override selects NSIS, the existing logo converted to ICO, current-user installation and WebView2 bootstrapper download if needed.

## Builds and artifacts

CI checks the Rust backend on macOS, Windows x64 and Windows ARM64. All automated Graph calls use mocks. Tests do not run interactive OAuth, write real credentials, send real messages or open save dialogs.

The **Windows alpha candidate** workflow builds ARM64 on `windows-11-arm` targeting `aarch64-pc-windows-msvc`, and x64 on `windows-latest` targeting `x86_64-pc-windows-msvc`. Each job verifies the matching PE machine type and uploads a separately named artifact. It tests the backend, builds the UI and NSIS installer, verifies the application's PE machine type matches its architecture, and uploads the installer with SHA256SUMS.txt as a 14-day Actions artifact. No GitHub Release is published and no tester receives a message automatically. Artifacts inherit repository access: this repository is public, so these are internal candidates by intended audience, not an invitation-only download channel. Installer builds are manual only, after the user explicitly agrees to a release. Push triggers have been removed. Manual dispatch requires the release-approved checkbox; an unapproved dispatch skips the installer jobs. Ordinary CI still runs on pushes. GitHub requires the workflow on the default branch for its manual UI.

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

Settings → Feedback now opens a prefilled draft in the existing public GitHub Issues repository, per user preference. Only the app version and empty prompts are included; account/chat/email/log data is not attached. Users review and submit on GitHub. Remaining pilot work: clean-machine acceptance, code-signing/distribution decision, known limitations/release notes, and update/uninstall instructions. Recurring meeting editing, creating Teams meeting links and Linux packaging remain deferred. The native build result is recorded below; clean-machine acceptance is still pending.

References: [Tauri Windows installers](https://tauri.app/distribute/windows-installer/), [Credential Manager credential limits](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw), [GitHub ARM64 runners in private repositories](https://github.blog/changelog/2026-01-29-arm64-standard-runners-are-now-available-in-private-repositories/).

The first native Windows test runs uncovered a Unix-only directory sync in the away reservation ledger. Windows now uses a flushed temporary file followed by MoveFileExW with replacement and write-through flags; Unix retains rename plus directory fsync. Tests cover replacing an existing ledger and existing reserve/restart safety. See https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw.


## First candidate built — November 20, 2026

[Download the ARM64 candidate artifact](https://github.com/jonellwood/taut-desktop/actions/runs/44772991818/artifacts/14648298989) from the successful [Windows alpha workflow](https://github.com/jonellwood/taut-desktop/actions/runs/44772991818). Source commit: 1f8a91d46617183c89915170e027585237e7b086. The artifact expires after 14 days.

- Installer: `TAUT_1.4.4-alpha.1_arm64-setup.exe` (3,443,545 bytes), plus SHA256SUMS.txt.
- SHA-256: `0860653e20b25a7f30bee3d0b9776fcc26d804c9a1389f58c2c6ee5964e5ab85`.
- Build, ARM64 PE verification, checksum generation and artifact upload all succeeded. Artifact contents and installer checksum were independently verified after download without executing it.
- Native backend CI passed 206 tests on ARM64 and 206 on x64; macOS backend CI passed too. Local 98 Node tests, production build/type checks and focused mocked UI checks passed.
- The full remote browser run passed 620 cases; four room-status cases used contradictory organizer/attendee fixture identity. The fixture was corrected (no application change), and all four cases passed again in Chromium/WebKit.

This unsigned artifact is ready for a deliberate clean-PC acceptance test, not an assertion that installation, OAuth persistence, native notification identity or upgrade/uninstall have been verified. No installer was executed during this work.


## Intel/AMD x64 test machine

The user's own Windows PC has an 11th-generation Intel Core i7 and needs the **x64** installer. The candidate workflow now builds separate ARM64 and x64 artifacts on matching Windows runners, verifies the expected PE architecture for each, and generates independent checksums. App source/version remains the same; no ARM64 installer should be used on the Intel machine. Both installer jobs succeeded in [Windows alpha candidate #3](https://github.com/jonellwood/taut-desktop/actions/runs/44781436701), source commit 35f59e4481005da8ab6e1a2daf1a8142b1eda70b. Under Artifacts choose `TAUT-windows-x64-alpha-35f59e4…` for the Intel PC; choose `TAUT-windows-arm64-alpha-35f59e4…` for ARM devices.

The x64 ZIP contains `TAUT_1.4.4-alpha.1_x64-setup.exe` (3,859,730 bytes) and SHA256SUMS.txt. Installer SHA-256 independently verified after download: `b7b0e0c69dc47f89d7070e17b2304c3279322047c9fe4743fb15d17f41991849`. Native x64 PE verification, backend tests, packaging and checksum/upload steps all passed. The ARM64 job also passed. No installer was executed; clean-device acceptance is still required. The earlier downloaded ARM64 candidate remains valid for Hannah because application code is unchanged.

User accepted x64 installation, Office 365 sign-in and restart restoration, Mail attachment saving, test notification and feature navigation on November 20. ARM native-device feedback remains pending. The next alpha.2 build adds read-only Workflow card previews; no new Graph permissions.


## Alpha.2 Workflow card preview update

Both architecture jobs succeeded in [Windows alpha candidate run 44788954286](https://github.com/jonellwood/taut-desktop/actions/runs/44788954286), source commit e02a507a4974f5818c3e701f85e5505ba63fb48f. Under Artifacts select `TAUT-windows-x64-alpha-e02a507…` for Intel/AMD, or `TAUT-windows-arm64-alpha-e02a507…` for ARM64.

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| TAUT_1.4.4-alpha.2_x64-setup.exe | 3,855,070 | 8f9c93730a878239bf3b85feb227da6e5c6e0443a1edb968eb0685568aef8c87 |
| TAUT_1.4.4-alpha.2_arm64-setup.exe | 3,441,633 | d5c0753c443b400a6973934376804f79f14e063ffcf66ca5ccbe6891705c283d |

Both ZIP contents/checksums were independently verified after download without execution. Architecture verification and installer build steps passed. Full CI is green on macOS, Windows x64/ARM64 and mocked browser tests. These remain unsigned alpha candidates; the user's supplied Workflow card shape is covered and its appearance was approved, but new-version native-device validation remains a user test. Earlier x64 alpha.1 acceptance is recorded above.

Pilot update November 20: approximately nine people are testing on Windows and feedback has been positive. Future installer builds wait for an explicitly agreed release; feature work accumulates between releases.
