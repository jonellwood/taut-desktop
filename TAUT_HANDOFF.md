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
See [TODO.md](TODO.md) for current priorities and newly requested work. The numbered list below is historical context.

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

## Appearance preferences — 2026-11-05

Settings now offers Light / Dark / System (default), five accents (Amber, Teal, Violet, Blue, Rose), and independent System / Standard / Increased contrast. Preferences are validated and saved under `taut.appearance.v1` in localStorage; these contain no credentials. `public/appearance.js` applies them in the document head before app startup and follows system color-scheme/contrast changes. Shared semantic colors in `src/appearance.css` cover application surfaces, dialogs, syntax tokens and presence labels; light accents use darker shades for legibility. No Graph scopes or native authentication behavior changed. Native macOS title-bar chrome remains controlled by macOS; manual native appearance testing is still appropriate.

Appearance validation: 68 Node tests and all 380 mocked Chromium/WebKit browser checks passed; the 10 appearance cases also passed with explicit primary/secondary text and accent-button contrast assertions. UI TypeScript check and production build pass with the same three existing Svelte accessibility warnings. No real Graph operations were performed. Manual native light/dark/system and macOS accessibility review remains on the checklist.

## Categorized Preferences and daylight refinement — 2026-11-05

Preferences now uses a wider dialog with Appearance, Notifications, Presence & status, Away replies, and Account navigation. Header/category navigation/footer remain available while the content scrolls; narrow windows use horizontal category navigation. Panels stay mounted while switching categories to preserve unfinished presence/away forms; only explicit Apply/Enable controls perform their existing mutations. The avatar shortcut opens Presence & status directly. Appearance/contrast use native radio inputs styled as segmented choices, and other selects/date inputs have consistent sizing. Sign-out controls no longer wrap into a narrow column. Light surfaces use softer stone/slate colors and subtle message tinting while retaining contrast overrides. Native testing still needed for OS-specific select menus and appearance preferences.

Validation for Preferences refinement: production build and UI TypeScript check pass (three existing App.svelte accessibility warnings), all 68 Node tests and 384 mocked Chromium/WebKit tests pass, and `cargo check --offline` passes. Browser screenshots reviewed at normal and 620×600 sizes. No live Microsoft 365 mutations or native app launch during automated checks.

## Optional read-only Mail preview — 2026-11-05

See MAIL.md for the approved scope and phased roadmap. Mail.Read was explicitly approved by the user and added to interactive OAuth scopes. Existing refresh-token exchanges now retain their original grant instead of requesting the expanding global scope list, so new Mail access requires a fresh interactive sign-in. Native mail.rs has read-only validated routes and resource/query-bound continuations. MailWorkspace.svelte adds Inbox/Sent, mailbox search, conversation expansion, explicit attachment metadata/preview/save, and Open in Outlook. It uses text-first safe rendering and blocks remote resources. Attachment saves use a user-selected local destination (native macOS save dialog), with a 10 MB cap, and no file execution. Mail preview is manual-refresh and does not mark messages read. Unified cross-source search and sending/bridges remain future work with separate permission proposals. No real mailbox or Teams operations performed by automated testing.

Mail validation: 143 Rust tests, 72 Node tests, 400 mocked browser tests, production build and UI TypeScript check pass (three existing accessibility warnings). Read-only opt-in, consent gating, safe HTML fallback, paging/search/errors, explicit attachments, stale responses, themes and retained chat drafts covered. Native save-dialog/real tenant validation remains manual.

### Mail paging correction (2026-11-05)
The first live Mail test hit `Invalid mail continuation destination`: exact nextLink path comparison rejected Graph canonical route forms before returning the first page. Paging now applies the validated continuation query to the original locally constructed `/me` route, never the supplied destination path. HTTPS Graph origin, v1.0, no credentials/fragments, and unchanged selected query remain enforced. Mocked regression covers canonical OData/user/folder routes, first-page retention, and destination isolation. No permission changes or live Microsoft 365 tests.

### Mail conversation list (2026-11-05)
Mail sidebar now groups loaded summaries by Graph conversationId, orders by latest loaded message, and shows latest sender/subject/preview, aggregate unread/attachment indicators, and explicitly labeled loaded counts. Missing conversation IDs remain separate messages; identical subjects do not merge unrelated alerts. Paging adds to existing groups and selecting a group opens its latest loaded message with earlier thread messages collapsed. Counts/unread indicators cover only loaded folder/search results, not the entire mailbox. No scopes or mailbox writes added. Validation: 73 Node tests, 18 mocked Mail Chromium/WebKit checks, UI TypeScript check and production build pass (same three existing accessibility warnings).

### Unified search foundation (2026-11-05)
Global toolbar and Command Palette open Discovery.svelte. Explicit searches combine up to 100 local loaded chat matches (message text, attachment names, conversation names) with paginated Graph mailbox search. Coverage/source labels are explicit; channels and server-wide chat search remain pending. Hidden/pending chats, deleted messages and system events are excluded. Results open their original chat without read mutation or mail conversation; drafts remain intact. Mail access failures preserve chat results; overlay close/account destruction invalidates late responses. Search blocks background read marking and attachment staging while open. No additional scopes or native changes. Validation: 74 Node tests, production build and UI TypeScript check passed (three preexisting warnings). Full mocked UI run: 405 passed, one Mail layout test interrupted by a Vite source reload; rerun of all 22 Mail/discovery checks passed. No real Microsoft 365 operations.

### Rendered HTML Mail (2026-11-09)
Mail requests now prefer HTML bodies. MailBody.svelte defaults HTML messages to Formatted with a Plain text toggle; plain messages retain the text view. mail-html.ts reconstructs a bounded semantic subset including headings, tables, lists, emphasis, quotes and code. Arbitrary CSS, active elements and resource attributes are discarded. Images (remote, data and CID) become placeholders; existing explicit attachment preview/save remains available. Numbered HTTP(S) destinations are shown outside the frame and require review plus an explicit Open link action. Rendered content runs in an empty-sandbox, opaque-origin srcdoc iframe with restrictive CSP and no scripts/network resources; theme colors come from TAUT. Large/deep content is bounded and labeled when shortened. No new dependencies, Graph scopes or mailbox mutations. Native WKWebView rendering/scrolling remains a manual rebuild check.

Validation: all 412 mocked Chromium/WebKit browser checks passed, including formatting, resource blocking, link review, theme rendering, plain-text switching and existing Mail/search flows. All 74 Node tests and 144 Rust library tests passed. Production build, UI TypeScript check, offline cargo check and diff whitespace check passed; build retains the same three existing App.svelte accessibility warnings. Browser screenshot reviewed. No real Microsoft 365 operations or native app launch during automated testing.

### Mail presentation preferences and away replies (2026-11-09)
HTML/Plain text buttons now use a filled accent for the active choice. Preferences has a Mail category with a saved local reading default (`taut.mail.presentation.v1`); per-message overrides remain temporary. The HTML sanitizer preserves validated literal inline/legacy text/background/border colors, including CSS shorthand background colors, but still discards resource attributes, arbitrary CSS, variables, fonts and sizing. Frame sandbox/CSP, blocked images and reviewed links remain unchanged.

User explicitly approved delegated Mail.Send on 2026-11-09; requested OAuth scopes now include it. Mail.ReadWrite/application permissions were not added. Away settings has an off-by-default Mail destination. The native 30-second worker shares the existing message, schedule, rate limits and durable once-per-directory-user ledger across chat/channel/Mail. Reads at most the latest 50 Inbox summaries and details only for fresh arrivals; startup/sleep/error recovery establishes a baseline rather than replaying mail. Mail must be directly addressed to the signed-in user, from an exact resolved internal non-guest identity with matching sender/replyTo. Automated/list/suppressed messages, self mail, notifications and ambiguous identities are excluded. MIME reply uses a single recipient, original message reference, folded/encoded UTF-8 subject/body and Auto-Submitted/X-Auto-Response-Suppress headers. HTTP 202 means accepted, not delivered. Uncertain replies remain reserved across restarts; account/generation checks and atomic storage apply. Native behavior and thread association await manual tenant testing. Entra Mail.Send consent, rebuild/fresh sign-in and explicit Mail opt-in are required. Outlook automatic replies remain independent. See MAIL.md for limits.

Validation: all 416 mocked Chromium/WebKit checks passed; 74 Node tests and 148 Rust library tests passed. Build, UI TypeScript, offline cargo check and git diff --check passed, with the same three existing App.svelte accessibility warnings. Rendered color screenshot reviewed. Native tests cover missing send scope/opt-in, historical mail exclusion, suppression headers, shared-ledger deduplication, timeout/restart reservations, MIME transport and header encoding. No real Microsoft 365 mutations or native app launch in automated tests.

- Mail refinement: contrast repairs use effective inherited backgrounds, black/white fallback and progressive contrast-color(); sender colors survive when readable. Sent/Received badges use profile mail/UPN; Inbox/Sent are list filters. Expanded messages fetch attachment metadata only, including inline-only files, and suppress empty controls. Automated checks use mocked IPC only.

### New Mail composing and local drafts — 2026-11-09
MailWorkspace now hosts MailComposer and account-specific local drafts. New email supports To/Cc/Bcc, explicit directory lookup, subject, existing source formatting/preview and portable code HTML. Drafts autosave on this Mac, survive navigation/restart, and require explicit discard. Review & send then Send email invokes native mail_send_new using existing approved Mail.Send. Native validates payload/account and uses one token snapshot for verification/send, saves a Sent copy, reserves attempt IDs, and labels 202 accepted only. Local uncertain markers persist before IPC; failures/unknown results stay locked until user checks Outlook and explicitly unlocks. No automatic resend. No attachments/reply/forward or mailbox-synced drafts in this pass. Added context-menu consistency to polish backlog. Automated verification uses mocks only; do not launch native app for tests.

### Composer polish — 2026-11-09
Coworker destination follows the last focused To/Cc/Bcc field. Mail send validation has a prominent Before sending status. Shared toolbar visibility defaults open and persists locally app-wide independently of draft formatting, so hiding controls does not strip formatting. Choosing a formatting action enables formatted writing; opening a hidden toolbar also enables it for that draft. HTML Mail no longer adds borders/padding to every table cell, avoiding inflated signatures. Images remain explicit regardless of sender domain. Mail attachment/inline image follow-ups recorded. Tests remain mocked.

### Mail conversation media pane (2026-11-09)
MailWorkspace now supports the global details toggle with MailDetails: participants/date range and Files/Images/Links, default conversation scope plus explicit selected-email scope. Read-only indexing is bounded to 25 loaded emails per pass; attachment paging and binary preview/save stay explicit. Inline images are hidden by default; duplicate images group only after previewed bytes match SHA-256, preserving sources. No new Graph scopes or automated tenant writes. Browser coverage uses mocked IPC.

### Mail response actions (2026-11-09)
Expanded emails now offer Reply/Reply all/Forward via existing local MailComposer. mail-drafts.ts stores action/sourceId/escaped original context; one draft per source/action is reused. Reply-To, self exclusion, To/Cc deduplication and sent-message reply recipients are handled. Native mail_send routes validated optional action/source to Graph reply/replyAll/forward with explicit reviewed payload; no new OAuth scopes or remote draft creation. Existing uncertain-send protections apply. Forward warns original attachments are included. Signatures/deletion/unread badge/Mark as unread and People directory recorded in TODO.md. All automated sending remains mocked.

Response-action validation: 78 Node tests, 152 offline Rust library tests and 54 mocked Chromium/WebKit Mail checks passed, including source/action persistence across restart, recipient selection and explicit reviewed sends. Production build, UI TypeScript and diff whitespace checks pass; the same three existing accessibility warnings remain. Reply review screenshot inspected. No real Microsoft 365 mutations or native app launch during automated testing.

### Mail post-send refresh and attachment preview sizing
- Accepted Mail sends now trigger bounded, read-only refreshes of the open conversation (immediately, then after 2, 5 and 10 seconds). This accommodates Sent-copy indexing delay without repeating sends. Navigation/unmount cancels pending refreshes; refreshed results merge into loaded history and retain its continuation.
- Attachment previews preserve intrinsic image dimensions, so small signature icons are not stretched across the dialog; larger images remain bounded by the viewport.
- Regression coverage uses mocked Graph only: delayed Sent-copy appearance, navigation cancellation, and intrinsic image sizing.

## People directory first pass (2026-11-09)
- People now offers explicit name/email prefix search (2–80 characters, up to 12 matches), basic identity details and presence refreshed every 30 seconds while open. Signed-out/empty/error states contain no demo coworkers.
- Uses existing graph_search_users and graph_presence commands and approved permissions; no new scopes. Selection is local/read-only. Chat uses the existing pending-conversation path; Email stages one account-scoped local draft and does not send.
- Verified: npm test (78 passed), npm run check:ui, npm run build (existing App accessibility warnings), and 68 mocked Chromium/WebKit People and Mail UI checks. No real Microsoft 365 mutations during testing. Manual tenant validation remains.

## People directory second pass — November 10, 2026

Implemented the approved delegated User.Read.All scope for a read-only, paginated directory and richer profile/manager lookup. See PEOPLE.md for the permission reason, user approval, cache policy and coverage limits. Fresh sign-in is needed for the expanded token.

People now uses three panes: cached/filterable/sortable directory, profile, and shared connections. Cached rosters are tenant/account scoped, refresh on entry and periodically while open, survive transient errors, and are removed for the current account on explicit sign-out. Selection refreshes the profile. Chat/Email retain the existing safe pending/local-draft workflow. Connections show known shared chats and attachments from loaded history; shared email search is explicit. Layout toggles now work for People.

Verified: production build (three existing App accessibility warnings), UI TypeScript check, 80 Node tests, 156 Rust tests, and 78 Chromium/WebKit mocked UI checks across People, authentication, conversations and email compose. Inspected the People WebKit screenshot. No real Microsoft 365 mutations or live-tenant testing.

### People polish — November 10, 2026
- Restyled directory selects, widened search space, and added exact department-name counts.
- Center profile now has an accent hero, initials, presence pill, primary chat action, contact/organization sections and manager card. Shared connections remain in the right pane.
- Right-click / options button hides people locally, with a Hidden people view to restore them. Preferences are account-scoped and persist on this Mac; no Graph mutations or scopes added.
- Validation: 80 Node tests, UI TypeScript check, production build (three existing App accessibility warnings), and 20 mocked People UI checks passing in Chromium/WebKit. WebKit profile screenshot inspected.

### People layout follow-up — November 10, 2026
- Directory controls remain stationary above an independently scrolling roster. Search and selects share the same width.
- Profile Chat/Email actions explicitly reset inherited margins and share height/alignment. Known one-to-one conversations show Continue chat without additional requests.
- Added roadmap entries for verified member/guest grouping and private many-to-many local sections in People/Chats (no tenant group creation).
- Verified production build (three existing App accessibility warnings), UI TypeScript, whitespace check and 22 mocked Chromium/WebKit People tests, including geometry/scroll behavior and zero Graph writes.

## People manager cards polish
- Added offset, clickable manager profile history with close/back action and subtle reduced-motion-aware entrance. Directory selection clears the local stack; stale profile requests remain guarded.
- Centered email copy icon in a square button, resetting inherited margins.
- Validation: build passed (three existing App accessibility warnings), UI TypeScript passed, 80 Node tests passed, 24 mocked People browser tests passed across Chromium/WebKit. No real Microsoft 365 writes performed.

### Profile deck follow-up
- Anchored front card with up/left backing cards and fixed-height horizontal card selector. Switching retains other profiles; closing removes only the current profile. New directory selection resets all cards. Deck capped at 12 profiles.
- Added future small-group profile deck idea to TODO; large groups should use searchable members.
- Verified production build (three existing App accessibility warnings), UI TypeScript, diff check and 24 mocked Chromium/WebKit People tests, including retained cards and stable front-card position. No live Microsoft 365 mutations.

## People v1 accepted — November 10, 2026
User confirmed People v1 complete. Checkpoint includes accumulated Mail preview/composition/replies/attachments, unified search, appearance/preferences and People development since the previous commit. Future People organization and group decks remain in TODO.

Checkpoint validation: 80 Node tests, 156 Rust tests and all 478 mocked Chromium/WebKit UI tests passed. UI TypeScript and production build passed; build retains three existing App accessibility warnings. No real Microsoft 365 data mutated during automated tests.
