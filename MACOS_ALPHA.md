# macOS internal alpha

Candidate: **1.4.4-alpha.3**, Apple Silicon (arm64), macOS 11 or later. Requested November 23, 2026. This package is for a small internal pilot.

## Installation

1. Download the DMG and compare its SHA-256 with the supplied checksum file if desired.
2. Open the DMG and drag **TAUT** into **Applications**.
3. Eject the DMG, then launch TAUT from Applications. Do not run it directly from the disk image.
4. Connect Microsoft 365 in the system browser using your own organization account.

This candidate is **ad-hoc signed, without Developer ID signing or Apple notarization**. macOS may prevent first launch after downloading it. On an authorized personal/test Mac, use macOS's documented **Privacy & Security → Open Anyway** flow only after verifying the source. Follow your organization's installation policy; a managed Mac may require IT approval. Do not disable Gatekeeper or remove quarantine recursively.

## What to test

- Sign in, fully quit, reopen, and confirm sign-in is restored.
- Navigate between Chats, Mail, Calendar and People; open existing conversations.
- Save a received attachment to a chosen folder.
- Use Settings → Notifications → Send test notification and confirm system permission/banner behavior.
- Create a deliberate test meeting with Outlook's reminder set to 15 minutes; confirm the reminder card, Open meeting, Snooze and Dismiss. TAUT must be running. Snooze/Dismiss are local to TAUT.
- Check an intentional calendar overlap: warning appears during composition/review and creation remains available.
- Change accent in Settings → Appearance and confirm the running Dock icon follows it; quit/reopen and confirm restoration. The installed Finder icon stays amber.
- Submit feedback through Settings → Feedback. Review the GitHub issue draft before submitting; do not include tokens or private message data.

Live sending, meetings and file uploads in these manual tests use real Microsoft 365 data; choose appropriate test recipients and events. Automated checks use mocks only.

## Updates and removal

Quit TAUT before replacing it in Applications with a newer package. The app identifier remains `app.taut.desktop` to preserve existing preferences and Keychain identity. There is no automatic updater in this pilot. To uninstall, quit and remove TAUT from Applications; local preferences/drafts and Keychain credentials are retained unless separately removed. Sign out first if you want to clear the saved session.

## Packaging

```sh
npm ci
npm run tauri -- build --bundles app,dmg --config src-tauri/tauri.macos.conf.json -- --locked
```

Output: `src-tauri/target/release/bundle/dmg/` and `src-tauri/target/release/bundle/macos/TAUT.app`. The macOS override supplies the Finder icon and ad-hoc signing identity; Windows packaging remains separate. Do not distribute debug builds or include local data, credentials, logs, or source caches in the installer.

## Verification

Build, architecture, signature, disk-image integrity and SHA-256 results are recorded with the delivered artifact. Clean-machine Apple Silicon installation and native Microsoft 365 acceptance remain tester checks.

### November 23 build result

- Built Apple Silicon DMG successfully: `TAUT_1.4.4-alpha.3_aarch64.dmg` (5.66 MiB).
- `hdiutil verify` passed; mounted read-only and checked the packaged app.
- Mach-O arm64, identifier `app.taut.desktop`, minimum macOS 11.0, version `1.4.4-alpha.3`, Finder icon `icon.icns`.
- `codesign --verify --deep --strict` passed. Ad-hoc signing only; not notarized. No app launch or live Microsoft 365 testing performed by automation.
- SHA-256: `b9c9e11c86032770c37d63e35c87cf8068450f1530a6c154e71b96dc8ad210bb`.
- Durable local copy, install notes and checksum: `release-artifacts/macos-alpha.3/` (Git-ignored). Build used current local source, including changes not yet committed. No GitHub release/upload or Windows build was triggered.
