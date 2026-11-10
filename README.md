# TAUT Desktop

A native macOS Microsoft Teams and Mail client built with Tauri 2, Rust, Svelte 5 and Microsoft Graph. Current features include chats and channels, People directory, presence, unified search, Mail reading/composing/replies/forwards, local drafts and signatures, attachments, and individually approved inline images. See [TODO.md](TODO.md) for the roadmap and [TAUT_HANDOFF.md](TAUT_HANDOFF.md) for development context; current source is authoritative.

## Set up on another Mac

Install Xcode Command Line Tools (`xcode-select --install`), Node.js 24 with npm, and stable Rust with Cargo through rustup. Git and access to this GitHub repository are required. Full native development requires macOS.

```bash
git clone --branch feat/message-deletion https://github.com/jonellwood/taut-desktop.git
cd taut-desktop
npm ci
npm run tauri dev
```

The first native build compiles Rust dependencies and can take several minutes. Click **Sign in** in TAUT and complete Microsoft sign-in in your system browser. The Entra application identifiers are configured in Rust; no `.env` file or client secret is needed. Tenant consent and device/Conditional Access policies still apply on the laptop.

For subsequent updates, stop the app, run `git pull --ff-only` and `npm ci`, then restart `npm run tauri dev`. Commit or preserve any local changes before pulling.

Your laptop starts with its own local state. Keychain sign-in credentials, local drafts and their attachment copies, signatures, appearance preferences, image approvals and People caches do not transfer through Git. Sign in again; existing Teams conversations and mail load from Microsoft 365. Check Settings → Mail on the laptop for signature and automatic read-marking preferences.

`npm run dev` starts only the browser frontend; Microsoft sign-in and Graph access require the native Tauri runtime. Automated browser tests provide their own mocked IPC.

## Authentication and safety

- OAuth uses the system browser, PKCE and a loopback callback. Access tokens stay in Rust; persistent credentials use macOS Keychain, never frontend storage or URLs.
- This is a tenant-specific public desktop application with no client secret. Requested delegated scopes are defined by `SCOPES` in `src-tauri/src/lib.rs`; feature permission rationale is documented in [MAIL.md](MAIL.md), [PEOPLE.md](PEOPLE.md), and related feature documents.
- Selecting a new contact stages a local conversation. Chat creation and sending require explicit Send with nonempty content. Mail sends require review and explicit confirmation; uncertain sends must be checked in Outlook before retrying.
- Mail read/unread controls update Microsoft 365. Optional timed read marking is off by default. Mail refresh currently picks up external Outlook changes when returning to Mail or using Refresh.
- Received remote images remain blocked. Inline/CID images require individual preview approval; approval can be revoked with Block again.
- Never mutate real Microsoft 365 data during automated testing. All Graph tests use mocks. Manual sends and other mailbox changes require explicit user authorization.
- Local drafts and caches can contain communication data. Do not commit exported messages, credentials, personal cache files or sensitive screenshots.

## Automated regression checks

```bash
npm ci
npm test
npm run check:ui
npm run build
npx playwright install chromium webkit
npm run test:ui
cd src-tauri
cargo check --locked
cargo test --locked
```

The UI suite runs the real Svelte app in Chromium and WebKit with a mocked Tauri
IPC boundary. It never starts the native app, signs into Microsoft 365, opens an
external browser, or contacts Graph. External browser HTTP requests are blocked;
unexpected IPC commands fail the suite. Fake chat creation and sending must be
explicitly enabled by each relevant test. All identities and messages are fixtures.

Coverage includes pending selection/cancellation, blank sends, duplicate submit
protection, existing-chat reuse, creation and delivery failures, explicit retries,
per-conversation drafts during sync and navigation, attachment link validation,
and click-to-load images with the lightbox. Virtual time drives directory debounce
and synchronization without waiting for real polling intervals.

GitHub Actions runs unit tests, the frontend build, and both browser suites on
Linux, plus locked Rust checks and mocked Graph tests on macOS, on pushes and pull
requests. Failed UI runs retain reports and traces as workflow artifacts. These
checks do not replace manual validation of native OAuth or macOS window behavior.
