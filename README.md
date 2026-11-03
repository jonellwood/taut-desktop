# TAUT Desktop — Alpha 1.1 (Microsoft 365 read-only)

This release adds Microsoft sign-in via **system browser + PKCE**, a one-time loopback callback, access/refresh tokens held **only in Rust process memory**, and read-only Graph chat listing and messages. No client secret, browser token storage, backend, or automated sending.

## Running

```bash
npm install
npm run tauri dev
```

Click **Sign in** at the bottom of the conversation panel or open Settings. Finish the browser sign-in and return to TAUT. One-on-one chat names may be limited where Graph omits member display names. Chat history is limited to the newest 50 messages and the initial 50 chats (pagination is planned). Presence is placeholder only.

## Entra

- Tenant: `5c747a22-76d4-498e-9d9a-75523aff7ceb`
- Client: `082aabde-4018-4e9e-8936-d2b74a34d9de`
- Authentication platform **Mobile and desktop applications**, redirect URI `http://localhost`.
- Delegated permissions: `User.Read`, `Chat.Read`, `ChatMessage.Send`, `Chat.Create` (but only `User.Read` and `Chat.Read` requested by this alpha).
- No client secret.

## Security notes

- Browser authentication uses PKCE S256, randomized state and an ephemeral listener at `127.0.0.1`.
- Tokens never cross into JavaScript or localStorage; Graph requests are made by Rust.
- Tokens expire/re-authenticate on app restart and refresh in memory until sign-out.
- For production, replace the custom minimal OAuth implementation with a reviewed native identity library and OS keychain storage if persistent login is desired. Validate identity and redirects against tenant policy.
- Graph responses are shown in the app UI. Chat data is not written to disk by TAUT.
- OAuth may fail for tenants using different cloud endpoints or policies.
- Avoid sharing screenshots or console output with sensitive message data.

## Known limits

- **Read-only**: Sending is disabled in live mode even though the permission is registered.
- No calls, meetings, Teams channel messages, chat attachments, or live subscriptions.
- API errors return status codes rather than sensitive response payloads.
- Browser-only `npm run dev` operates in mock mode; native runtime required for sign-in.


## Alpha 1.2 sending test
1. Stop TAUT and update project files from this package (keep your local changes backed up).
2. Run `npm install` and `npm run tauri dev`.
3. Sign out if previously signed in, then sign in again. OAuth now requests the delegated `ChatMessage.Send` permission.
4. Pick a safe test chat, send a short message, and confirm it appears in official Teams.
5. Click the refresh arrow in the chat header to load new messages.
6. Sending currently requires the app to receive a valid Graph `201 Created` response; in ambiguous failures check Teams before retrying.

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
