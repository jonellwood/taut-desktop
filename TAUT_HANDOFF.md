# TAUT Desktop — Project Handoff for Codex

## Project overview
TAUT is a native macOS alternative client for Microsoft Teams chats, deliberately distinct from Microsoft's UI. Its goals are an efficient developer-tool-style interface, lower notification noise, explicit user control, and a trustworthy Teams integration.

**Technology:** Tauri 2 / Rust backend, Svelte 5 / TypeScript frontend, Vite, delegated Microsoft Graph API with Entra authentication. Microsoft Graph access tokens belong in Rust and must not be exposed to the Svelte frontend, logs, or URLs.

**Local project:** Open the existing `taut-desktop` repository/workspace in VS Code. Treat its actual files as the authoritative source; this handoff is project background, not a substitute for inspecting code.

**Visual identity:** Charcoal/deep blue-gray, amber accents, compact navigation, T/ logo. Tagline: "Less noise. More signal." Command palette and "Snap to Now" for scrolling to latest.

## Working features reported by user
- Native macOS app builds and runs through `npm run tauri dev`.
- Entra OAuth login and delegated Graph authenticated chat access.
- List and read real Teams chats and messages; send plain-text messages.
- Periodic live sync for active chat and chat list.
- Chronological message ordering; message date separators; scroll lifecycle and Snap to Now.
- Per-conversation in-memory drafts; preserve drafts during sync.
- Basic image messages fetched by Rust through authenticated Graph hosted-content endpoints (manual click to load), and a viewport image lightbox.
- File attachment reference cards; launch external links via Tauri opener. Browser may require Microsoft authentication.
- Existing conversation reuse and newly created one-on-one chats.
- Directory search with `User.ReadBasic.All` delegated permission approved by tenant administrator.
- Historical chat member diagnostics and fallback naming for unavailable participants.
- Legacy feature: notification philosophy should suppress reaction noise rather than encouraging it.

## CURRENT CRITICAL BUG — FIX FIRST
**Creating/selecting a new contact in TAUT seems to generate a visible empty Teams chat before the user sends any message.** The user selected a coworker during testing and never pressed Send, but the coworker saw a new Teams conversation/event and contacted them about it. A `Unsupported message content` bubble also appeared in the newly created chat.

**Safety requirement:** Selecting a user from search must NOT call `POST /chats` or send anything. Display a local pending-chat draft UI only. If an existing conversation can be identified through already-available chat data without mutation, opening it is fine. For a genuinely new 1:1 chat, defer `POST /chats` until explicit Send with nonempty message content. Explain and handle the non-atomic sequence: chat creation may succeed even if sending fails; never silently retry ambiguous sends. Prevent self-chat; avoid duplicate chats; treat system messages as system notices or filter them, not user-created text. Make user-facing creation behavior accurate: Graph `POST /chats` is a side-effect, even when no text was sent.

**Important:** Inspect current implementation before changing anything. Make minimal, reviewed changes. Do not exercise POST Graph endpoints against actual coworkers during tests unless the user explicitly authorizes the specific recipient and action. Favor mocks and unit/integration tests using stubbed API responses.

## Other observed issues
- New empty chats already exist from earlier testing. Investigate supported Graph hide/delete options and user-specific semantics before implementing. Never silently delete or mutate chats.
- User wants directory autocomplete and comfortable name search; recently added, needs validation.
- Some new chat initialization produced `Unsupported message content`, likely a Graph system event. Determine actual messageType before treating it as text.
- Presence display has been seen as 'Offline' despite inconsistent colored indicators; verify data source before claiming true Graph presence.
- File opens in system browser but Microsoft authentication may be requested; don't put access tokens in links or attempt credential bypass.
- Some archived chats have former employee members with missing display names (`Members returned: 2; identifiable others: 0`); preserve data, avoid guessing identity.

## Feature roadmap
1. **Immediate:** Fix silent new-chat creation / notifications; validate directory picker and message initiation UX.
2. **High:** Send attachments: Microsoft 365 upload/share-reference flow, with least-privilege Graph permissions and clear user-triggered sending. Design secure file handling; support paperclip, drag/drop and clipboard images later.
3. **Medium:** Trusted sender image auto-load preference keyed by Entra user ID; no automatic file download by default.
4. **Medium:** Better participant photos and actual Graph presence; message reactions as appropriate, without reaction notifications.
5. **Medium:** Native macOS message notifications, with reaction noise disabled by default.
6. **Low:** Code-block formatting with language selector / syntax highlighting.
7. **Very low:** Telegram-style typing indicator, only if supported by a suitable API; Graph typing state may not be available for ordinary chats.
8. **Very low:** Populate Shared Media conversation-details panel with images, documents, and links.

## API/security guidance
- Microsoft Graph delegated permissions reported enabled: `User.Read`, `Chat.Read`, `ChatMessage.Send`, `Chat.Create`, `User.ReadBasic.All`. Verify exact scopes requested in code and avoid expanding permissions without justification.
- Keep tokens in Rust and prevent logging access tokens, auth codes, chat contents, or sensitive identifiers. Prefer Entra object IDs for recipients rather than display names or hardcoded domain concatenation. Only send messages on explicit user action.
- Browser-linked attachments may need login; do not leak bearer tokens to default browser URL.
- This is a government tenant environment; honor least privilege, careful logging, and safe handling of historical conversations.

## Development workflow
- First inspect `package.json`, `src/App.svelte`, Svelte support modules, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, and `src-tauri/capabilities` and describe the actual implementation.
- Use a Git branch; run `git status`; protect uncommitted edits.
- Fix critical bug with small diff and tests before adding features.
- Run `npm install` if needed; `npm run check` (if available), `npm run build`, `cargo check` via `src-tauri`, then `npm run tauri dev` for macOS manual validation.
- Provide concise change summary, test results and outstanding issues. Do not assert that a real Graph send is safe without confirming semantics.

## First Codex task recommendation
"Inspect TAUT's new-conversation flow end to end. Fix the critical privacy/UX issue where selecting a coworker creates a visible Teams chat before an explicit message send. Implement a pending-chat state, guard self-chat and no-content sends, classify system messages appropriately, and add tests with mocked Graph calls. Preserve existing-message functionality, drafts, sync, and attachments. Do not make real POST calls to Microsoft Graph while testing."
