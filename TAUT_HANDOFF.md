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

## Mail roadmap implementation — November 10, 2026

Reorganized TODO.md into the active ordered roadmap and archived completed history in ROADMAP_COMPLETED.md. Implemented local email file copies in IndexedDB, attachment/inline-image selection plus paste/drop, CID image sending, bounded Graph fileAttachment payloads, and retention after uncertain sending. User confirmed attachment and inline-image sending worked in their manual tenant test.

Added account-local signature defaults for new mail/replies/forwards, an explicit per-draft signature snapshot and review preview. Chat Respond by email creates a local draft quoting the message and loaded replies, with blank recipients and file names only. Mailbox search now has a clear button that resets the current folder view.

Next: remembered approval for individual received inline images in HTML view (plain text keeps modal preview), then timed/read-unread controls and unread badge. Mail.ReadWrite requires documented user approval before implementation; it was not added. Signature and chat-to-email live acceptance remain pending.

Validation: 84 Node tests, 157 Rust tests, UI TypeScript and production build passed (three existing App accessibility warnings). All 490 mocked Chromium/WebKit UI cases passed across the full run and targeted rerun: the full run had two assertions expecting an original clipboard filename, corrected to match the intentionally generated clipboard name; both corrected cases passed on rerun. No automated real Microsoft 365 writes or new OAuth scopes.

### Mail signature and reference polish
Moved account signature defaults to Settings → Mail with Include/Omit choices, leaving only per-draft inclusion in the composer. Chat email drafts now resolve the actual message sender address (known membership or read-only profile lookup) and place an escaped “In reference to” HTML quote above the reply. Recipients remain editable; unresolved addresses stay blank. No new Graph scopes or automated real-tenant writes.
Validation for signature/reference polish: 85 Node tests, 38 mocked Mail/preferences UI cases in Chromium/WebKit, and four final targeted signature/bridge cases passed. Production build and UI TypeScript passed, retaining three existing App accessibility warnings. Inspected the WebKit signature settings screenshot. No Rust behavior changed in this follow-up.

### Mail confirmation follow-up
Confirmed chat references are included in the actual outgoing HTML body; the composer now places the quote in its body area with explicit recipient-facing wording. Added portable HTML line breaks. Self-addressed To recipients require confirmation with an account-local remembered opt-out. Draft discard now uses a centered native dialog with Cancel focused, keyboard dismissal and scroll-free focus restoration. Signature sending was user validated; rendering polish remains future work.
Validation: 85 Node tests and 42 mocked Mail/preferences browser cases passed in Chromium/WebKit. UI TypeScript passed; production build passed with three existing App accessibility warnings. No new scopes or automated Microsoft 365 writes.

Review & send now opens a centered confirmation dialog with Keep editing focused. The confirmation footer stays visible while lengthy review details scroll within the dialog. Escape returns to the unchanged draft. Verified 40 mocked Mail composer browser cases (Chromium/WebKit), including a small viewport, plus 85 Node tests, UI TypeScript and production build. Build retains three existing App accessibility warnings. No real Microsoft 365 writes.

### Cached recipient suggestions and quieter review
To/Cc/Bcc suggest up to five matching names/email addresses from the current account’s People cache after two characters. Keyboard arrows/Enter or pointer selection replaces the current comma/semicolon-delimited address fragment; Escape dismisses suggestions. No lookup requests are made while typing; explicit Find a coworker remains available when the cache has no match. Review shows only Signature included/not included; the outgoing signature is unchanged. Multiple named signatures with separate action defaults are on TODO.md.
Validation: 70 mocked Mail/People/formatting browser tests passed in Chromium and WebKit, plus 85 Node tests, UI TypeScript and production build (three existing App accessibility warnings). No automated Microsoft 365 writes or new scopes.


## Mail read-state authorization — November 10, 2026

User explicitly approved delegated Mail.ReadWrite and confirmed Entra tenant admin consent. Purpose and boundaries are documented in MAIL.md. Scope addition and implementation remain pending, following received inline image approval. Use mocks for all automated mailbox mutations; fresh interactive sign-in will be needed when TAUT requests the expanded scope.

### November 10: received image approval and mailbox read state
- Added approved delegated Mail.ReadWrite request; fresh interactive sign-in required.
- Explicit read/unread controls (message and loaded conversation context menu), server account verification and isRead-only PATCH with GET reconciliation; no write retries.
- Optional focused/visible message delay (Off default, 3/5/10 seconds); manual unread pauses until reopening.
- HTML CID Preview remembers per-attachment approval locally; Block again revokes. Plain-text preview stays modal; remote images remain blocked.
- Validation uses mocked Graph only. Node 85 and Rust 160 tests pass; production build passes with three existing App accessibility warnings. Mail browser regression results recorded in final response.
- Mail browser regressions: 84 passed across Chromium/WebKit; the two new delay checks passed on rerun after correcting the test to advance the fixture's frozen clock (86 checks total). UI TypeScript and git diff whitespace checks pass. No live Microsoft 365 mutation tests performed.


### Mail acceptance and laptop handoff — November 10, 2026
- User confirmed received inline images render successfully, including linked signature images. Fixed Graph's derived contentId selection, preserved bounded image dimensions (including Outlook inch/point sizes), and suppressed numbered link markers for rendered image-only links while retaining reviewed destinations in Email links.
- User confirmed Mark read / Mark unread works; TAUT changes propagate to Outlook web and native within seconds. Changes made in Outlook appear after returning to Mail; current manual/navigation refresh behavior is accepted. Native context menu can appear outside a message/row hit area; no change requested.
- Added actual Graph importance metadata to summaries and message reads, with a High importance indicator on the latest loaded message row and each applicable message header. Never infer importance from subject text.
- README now contains current Mac clone/run instructions and explains that local drafts, signatures, image approvals, preferences, caches and Keychain credentials do not transfer through Git. Active development branch: feat/message-deletion.

End-of-day validation: 85 Node tests and 162 offline locked Rust library tests passed; offline locked cargo check, UI TypeScript, production build and diff whitespace checks passed. Browser suite: 504 passed in the full run; the two new importance cases initially used an ambiguous subject selector, corrected to match the exact subject, and both passed in the targeted Chromium/WebKit rerun (506 cases covered). Build retains three existing App accessibility warnings. No native app launch or real Microsoft 365 operations during automated checks. Checkpoint includes the accumulated November 10 Mail work and README laptop setup; push destination is origin/feat/message-deletion.


## 2026-11-12 — Attachment recipient verification

Investigated reported Teams recipient image download/share failure in a direct
chat. Existing upload path grants read access using driveItem invite; prior
confirmation counted records without matching recipients. Now matches readable
permissions to every Entra recipient (modern/legacy identity facets), with one
read-only permissions lookup if invite identities are incomplete. Unverified
access blocks sending and preserves draft. Mock regressions cover duplicate/wrong
identities, siteUser confusion and incomplete responses. No live Microsoft365
operations or scope changes. Original recipient error remains unknown; do not
claim the reported download failure is conclusively fixed. Calendar is a future
milestone in TODO.md, after this attachment investigation.

User clarified image report: no error, only missing Teams download/share UI.
Added explicit escaped Open original filename links beside outgoing reference
attachments, preserving original URLs/access grants and upload recovery. This is
a fallback route to OneDrive, not a guarantee of native Teams controls or onward
sharing. Mock tests verify escaped labels/query strings and file-only sends.


## 2026-11-12 — Calendar read-only first pass

User explicitly approved delegated Calendars.Read; added to requested scopes and
documented in CALENDAR.md. Entra consent plus fresh sign-in required for Calendar.
New three-pane Calendar workspace has date/range navigation (day/week/30 days),
chronological agenda, selected event details, description preview, organizer,
attendees and recorded RSVP/cancellation state. Selection opens details; closing
it and selecting an event opens it again. Navigation and refresh are explicit.
Uses /me/calendarView for occurrences/exceptions; validated Graph-only continuation,
bounded date range, scope gate, stale-result guards. No event writes or meeting
responses. Mail invitation reconciliation/change-response remain future work.
Existing attachment changes in this working tree precede Calendar; preserve them.
Calendar automated tests use mocked IPC/Graph only. No signed-in native app or
real Microsoft365 data accessed during testing.
Validation: Rust 169/169; Node helpers 88/88; Calendar browser cases 6/6
(Chromium + WebKit), plus 88/88 Mail/Teams/layout/welcome regressions.
Production build and UI TypeScript check pass; three existing App accessibility
warnings remain. git diff --check passes. Tenant calendar validation is pending.

## 2026-11-12 Calendar invitation responses
User validated Calendar v1 successfully, then explicitly approved delegated
Calendars.ReadWrite and confirmed Entra admin consent. Scope now requested;
fresh interactive sign-in required. CALENDAR.md records rationale and controls.
Shared MeetingResponse component in Calendar details and expanded Mail event
messages: resolves Graph event relationship, reads current calendar status,
shows Change response for answered invitations, and previous start time when
available. No subject guessing or conflating unread mail with unanswered RSVP.
Review modal for Accept/Tentative/Decline, optional note and organizer email.
Rust verifies account with same token snapshot and fresh changeKey before one
POST. Blocks organizer/cancelled/series-master actions. HTTP202 is accepted for
processing; status refresh remains read-only. Local persistent event-version
markers plus Rust process ledger prevent repeated uncertain responses.
No automated tenant access or mutations. Rust174/174, helper88/88, build and
UI type checks pass (3 existing App accessibility warnings). Browser regression
suite100/100 passed across Chromium/WebKit before final uncertain-state case.

### Mail invitations use Calendar for responses

User confirmed Calendar RSVP and cross-surface status updates work, but Mail RSVP
returned HTTP 400. Mail now keeps status/refresh and navigates to the exact meeting
in Calendar with date and details open. Calendar owns RSVP review/send. Read-only
missing-event retry preserves the target; selected events survive omission from an
agenda page (e.g. declined events). No new scopes or real tenant automated writes.
Validation: 88 Node tests and 58 mocked Calendar/Mail browser regressions passed;
final Calendar retry coverage and production build checked separately.

## 2026-11-12 — Approved room discovery scope

User confirmed Entra consent and explicitly approved delegated Place.Read.All.
Added to requested Rust OAuth scopes; rationale and planned room booking behavior
are documented in CALENDAR.md. Fresh sign-in required. Room picker and meeting
creation remain to be implemented; this change only prepares authorization.

### 2026-11-12 — meeting composer / room picker

Added Calendar New meeting: account-specific local drafts, subject/date/time,
attendee addresses, description, searchable/paginated Graph rooms, advisory
availability and explicit review/create. Uses approved Calendars.ReadWrite and
Place.Read.All. Selection/drafting never creates an event. UTC payloads invite
rooms as resource attendees; Exchange controls acceptance/approval. Persistent
attempt markers plus Rust transaction/process guards prevent automatic repeats
on uncertain results. Single meetings and one room for this pass. See CALENDAR.md.
Validation: 180 Rust tests, 88 Node tests, 20 Calendar/composer browser tests
(Chromium + WebKit), UI TypeScript check and production build pass. Three existing
App.svelte accessibility warnings remain. No real Microsoft365 writes were tested.

### 2026-11-12 — meeting summary and attendee autocomplete

Moved composer availability into a live right-panel summary with time, people and
room details, connected to the workspace panel controls. Attendees reuse cached
People autocomplete from Mail. Selection changes invalidate old availability.
User confirmed availability and meeting creation without a room; actual room
booking is still awaiting a real meeting. Validation: 22 mocked Calendar/meeting
browser checks across Chromium/WebKit, UI TypeScript check and production build
pass; three existing App accessibility warnings remain. No automated tenant writes.

### 2026-11-12 — composer spacing and attendee status polish

Meeting composer now uses a dedicated class instead of inheriting the global chat
composer flex layout, which placed its header beside the form and left a large
blank area. Added browser geometry coverage for the header/form flow. Attendee
response values use readable labels (Not Responded, Tentatively Accepted, None,
Accepted, Declined); pending room wording remains explicit.
Validation: 89 Node tests, 22 mocked Calendar/meeting browser tests, UI TypeScript
check and production build pass. Three existing App accessibility warnings remain.
No automated Microsoft365 writes.

### Individual mail deletion

Added explicit Move to Deleted Items with MailConfirm, existing Mail.ReadWrite, account verification, one Graph move request and durable local attempt lock. Only individual emails; no permanent or bulk deletion. Restore via Outlook. Conversation/search pages exclude Deleted Items. Automated tests use mocked transport/IPC only.

### 2026-11-12 — Mail/Calendar gateway diagnostics

Mail and Calendar GET reads share mailbox_transport. Retry only HTTP 502/503/504,
at most three attempts with bounded waits. Persistent failures expose only a
validated Graph machine error code and request-id, never response message text,
mail content or tokens. Write transports remain unchanged and are not retried.
The reported live persistent 502 cause is not yet established; the improved
error is needed to distinguish an Exchange/service problem from a request issue.
Validation: 187 Rust tests and 89 Node tests pass, including loopback mocked HTTP
recovery, persistent safe diagnostics, and no retry for 403. No live M365 testing.


## 2026-11-19 — Mail/Calendar recovery and checkpoint

User reported that the earlier 502 errors coincided with a nationwide Microsoft outage lasting almost a full day. After rebuilding today, the user confirmed Mail and Calendar are working again. This strongly supports a service outage as the cause; no request-level cause was independently established. Keep the bounded read-only gateway retry and safe diagnostics for future service interruptions; mutations are never retried by that transport.

This checkpoint preserves the accumulated November 12 Calendar workspace, reviewed RSVP and meeting composer, room discovery/advisory availability, Mail invitation navigation, individual Move to Deleted Items, and Teams attachment recipient verification/original-file links. Room booking remains pending a deliberate manual test; today's confirmation does not imply new meeting invitations or deletion tests were performed.

November 19 checkpoint validation: all 536 mocked Chromium/WebKit browser tests, 89 Node tests and 187 Rust library tests passed. Three local HTTP transport tests initially could not bind localhost inside the sandbox; their targeted rerun with localhost access passed. Offline locked cargo check, UI TypeScript, production build and whitespace checks passed. Build retains three existing App accessibility warnings. No native app launch or real Microsoft 365 calls during automated checks.

### 2026-11-19 — Room booking accepted

User explicitly confirmed that the manual room-booking test passed as expected. Calendar creation with a room is now user-validated alongside the earlier availability and meeting-without-room checks. This was a user-performed tenant test; no automated real Microsoft 365 calls were made. Documentation-only update, checked with git diff --check; no code changes or test rerun.


### November 19 — Mail/Calendar invitation reconciliation

Current calendar RSVP now drives response controls. Answered mail offers View in Calendar; eligible answered events offer Change response. Only current meeting-request mail with a notResponded event and requested response offers Respond in Calendar. Graph isOutOfDate, responseRequested and previous time/location metadata are preserved separately from current event state. Response receipts and missing/removed associated events never fabricate the user's RSVP. Neither unread mail nor changeKey triggers attention.

List refresh and return to visible/focused cards refresh their status; stale failed reads cannot send. Accepted responses receive bounded read-only reconciliation (immediate, then up to 2/5/10 seconds), stopped by confirmation, navigation/unmount or hiding. Uncertain writes are never repeated and persistent version locks remain. No OAuth changes or real Microsoft 365 requests during automated work. Teams calendar association/unified attention remains explicitly deferred; current scope is Mail and Calendar.

Reconciliation validation: 90 Node tests, 11 targeted Calendar Rust tests, offline locked cargo check, UI TypeScript and production build pass (three existing App accessibility warnings). 88 unique mocked Mail/Calendar/meeting browser cases are covered across Chromium/WebKit: 86 initially passed, the failed-refresh pair had an assertion missing the mock Error prefix and passed after correction; all 30 Calendar cases then passed again including focus-return reconciliation. WebKit Calendar screenshot inspected. No native app launch, new scopes or real Microsoft 365 operations. Manual tenant validation of this reconciliation follow-up is pending.


### November 19 — Decline prominence and room booking priority

User requested stronger emphasis for the meeting decline inside Mail while preserving the subject. The classified message kind is now a 20px heading; decline has an icon and theme-aware warning surface/text. Calendar details place resource/room booking status above the calendar RSVP card and other event details. Declined rooms explicitly say Room declined and This room is not booked for this meeting; accepted/pending remain neutral. People attendees remain below; resources no longer repeat there. Status comes from actual attendee metadata only. No backend, permission or mutation changes.

Validation: all 96 targeted mocked Mail/Calendar/meeting browser checks passed. The eight new visual cases also passed again after correcting the test preference key and asserting the actual light/dark theme. Light and dark WebKit screenshots inspected. Production build, UI TypeScript and diff whitespace checks pass (three existing App accessibility warnings). No real Microsoft 365 operations or native app launch during automated checks.


### November 19 — Inbox unread counter and quiet Mail synchronization

Added a server Inbox unreadItemCount badge (including meeting items, excluding other folders/subfolders), full accessible count and 99+ display cap. Existing Mail.Read only; account verification and folder GET share one Rust token snapshot. User authorized background metadata from other workspaces. Native responses validate nonnegative Int32 counts and make no mailbox writes. No bodies/attachments fetched outside Mail for the counter.

Root MailUnread is keyed by account, clears on sign-out, rejects stale in-flight revisions, serializes checks and queues a fresh check after local mutations. Visible/online minute checks pause when hidden/offline; errors keep a marked last count and back off up to five minutes. Local read/unread/move/send and manual refresh trigger a count read. No notification noise or count persistence.

Open Mail merges latest folder/search and conversation summary pages, preserving selection, loaded pages/cursors, drafts, cached bodies/images and scroll anchors. Composition/preview/in-flight actions defer quiet refresh. New thread messages stay collapsed without automatic media indexing. External read/unread flags update cached body metadata in place; external unread holds the optional timer until reopening. Manual list refresh remains the way to replace the current page; older retained summaries are not guaranteed fully synchronized. Tests use mocked Graph/IPC exclusively.

Unread-counter validation: 90 Node tests, 15 targeted Rust Mail/away-mail tests, offline locked cargo check, UI TypeScript and production build passed (three existing App accessibility warnings). Full mocked Chromium/WebKit suite: 580 passed; a legacy reaction test globally matched all unread badges and failed in both browsers after the valid Mail badge appeared. Scoped its assertion to the Chats button; both corrected cases passed, covering all 582 cases. New coverage includes authoritative counts, 99+ labels, consent, backoff, offline/hidden recovery, account isolation, mutation races, pagination, draft/search/scroll preservation, external unread timer holds and stale folder responses. WebKit Inbox badge screenshot inspected. No native app launch or real Microsoft 365 operations; manual tenant counter validation remains pending.


## November 20, 2026 — organizer meeting management

User manually confirmed acceptance of another user's invitation and cancellation reconciliation in Mail and Calendar. Inbox unread counter also confirmed updating from Outlook at roughly 45 seconds within its 60-second polling cadence.

Added reviewed organizer editing/cancellation for active single meetings; see CALENDAR.md. New MeetingEditor local drafts, changed-field PATCH, optional/required/resource preservation, protected formatted/online descriptions with append-only notes, explicit room changes, account/version preflight and durable uncertain-attempt guards. Cancel uses the organizer cancel action and clearly warns of attendee notifications. No scopes added, no live Microsoft 365 automated writes. Rebuild and manually verify organizer update/cancellation next; recurring events remain in Outlook.

Validation: 200 Rust tests, 94 Node tests, 22 organizer-management browser checks across Chromium/WebKit passed, alongside UI TypeScript and production build. Existing Calendar/meeting browser coverage passed 62 cases in the initial combined run; four new-case label failures were corrected and all 22 new cases rerun green. Three existing App accessibility warnings remain. No signed-in native app or live Graph mutation was used.


### Calendar alpha closeout — November 20

Final review displays replacement description content and the affected room on cancellation. Attempt-lock reads happen before local draft parsing; corrupt drafts cannot bypass a prior uncertain attempt, and unreadable safety storage leaves management unavailable. Added pending-cancellation, corrupt-draft and storage-read failure regressions. All 72 mocked Calendar/meeting/organizer browser cases passed in Chromium/WebKit; 94 Node tests, UI TypeScript and production build passed. Native source unchanged from the 200-test Rust pass above. WebKit cancellation review inspected. CALENDAR.md contains the live organizer acceptance checklist; those writes are performed only by the user. Recurrence authoring/editing and new Teams links remain deferred for the focused alpha.

User reprioritized installable pilot after Calendar acceptance: two Windows testers first, one Mac tester second, Linux tentative/deferred. Plan Windows compatibility/credential storage/attachment-save/auth/notification audit, installer validation and Settings feedback link to an internal form. No release or feedback service created yet.


### Organizer status display follow-up

User confirmed live organizer meeting editing worked as expected and observed no email to themselves. Organizer cancellation initiated in TAUT still awaits confirmation. Calendar attendee rows now identify the organizer by the event's actual organizer email and display Organizer · No RSVP needed even when Graph returns none. No accepted RSVP is fabricated, other people/resource responses remain unchanged, and no write behavior changes.


### Organizer cancellation and navigation report

User confirmed cancellation removed their organizer event from TAUT and subsequently Outlook. This matches Graph cancel moving the organizer copy to Deleted Items; attendee cancellation delivery was not independently confirmed. The minute Inbox unread poll does not govern this action. User also reported Chats rail/sidebar activating while Calendar remained in the main panel, preventing conversation access. Added regression cases for returning to a preserved chat draft after cancellation and leaving a selected cancelled event. Both pass in development and production builds in Chromium/WebKit (4 cases per build), without unhandled errors or unexpected writes. The reported native navigation failure has not been reproduced or claimed fixed; asked whether a full restart of the running development app clears it, to distinguish hot-reload state from a persistent defect. Capture exact steps/runtime error if it recurs.


### Duplicate attachment keys — root cause identified

Full restart did not clear the stuck-workspace/missing-history issue. User supplied the console error: each_key_duplicate for a UUID at attachment indexes 1 and 2. A synthetic message with repeated reference attachment IDs reproduced the exact error in both Chromium and WebKit, interrupting chat rendering. The file attachment renderer keyed entries only by Graph attachment ID. Conversion now assigns display identity from ID plus URL, collapses exact repeats and preserves distinct URLs even if IDs match. No Graph data, message history, scopes or write operations change. Original tests with unique IDs did not cover this payload. Added coverage with prior/new history, duplicate references, distinct files sharing IDs, chat switching, and Calendar/People-to-Chat transitions. User's native recovery after rebuilding remains pending.


Duplicate-key validation: regression failed before the fix with the exact supplied UUID/index error in both browsers. After the fix, all 82 targeted chat/media/thread/shared-media/organizer-navigation browser cases passed; the duplicate-history/workspace regression also passed against compiled production assets in Chromium and WebKit. All 97 Node tests, production build, UI TypeScript and whitespace checks passed (existing App accessibility warnings remain). An overlapping preview runner initially cleared active browser artifacts; suites were rerun sequentially to obtain the clean results above. No real Graph calls or native app testing was performed.


### Vance history follow-up — November 20

User confirmed duplicate-key fix restored navigation and other chats, but Vance still showed only the newest message. Source inspection found chat messages consumed only the first page, ignored @odata.nextLink and replaced the timeline on each read. Added explicit Load older messages using native chat-bound, HTTPS Graph continuation validation. Pages merge by message identity; overlapping entries update once, older loaded history survives recent-page refresh and sending. Pagination cursors are per account/chat; navigation preserves them, account changes/sign-out clear them. Older-page failures preserve the timeline/cursor for explicit retry, prepending preserves scroll position and does not create unread/Snap-to-Now attention. Previously loaded messages outside refreshed pages are not guaranteed current until reread. No new permissions, automatic unbounded history crawl or real Microsoft 365 automated calls. This closes a confirmed loading limitation, but the exact Vance payload remains uninspected; live recovery is pending.


User's latest Console error was the notification plugin's injected startup script calling is_permission_granted without a window capability. Confirmed in installed tauri-plugin-notification 2.8.0 src/init-iife.js. Added only notification:allow-is-permission-granted to the main window capability, enabling the existing read-only OS permission check; no frontend notification send/request permission or Graph scopes added. This is independent of older chat pagination.


History validation: 66 mocked history/conversation/media/read-state/thread cases passed, followed by 38 mocked history/deletion/reaction cases after the attention guard adjustment. All 97 Node tests, 2 focused Rust continuation-validation tests, locked offline cargo check (including capability manifest), UI TypeScript and production build passed. No live Graph request or signed-in app launch. Native Vance history recovery and notification console cleanup remain user verification steps.

User confirmed Load older messages recovered Vance’s missing history. Earlier duplicate-attachment rendering/navigation fix was also confirmed working. This verifies history continuation as the remaining cause of Vance’s missing older display; no server history restoration was needed. Notification permission-error cleanup remains unconfirmed on the native app.


### Windows 11 ARM64 alpha preparation — November 20

User authorized starting Windows readiness and confirmed both pilot PCs are Windows 11 ARM. Found macOS-only browser launch, absent Windows vault, macOS-only Mail save, mismatched versions and macOS-only CI. OAuth now uses existing Rust Tauri opener, preserving PKCE/scopes/loopback and token isolation. Renamed vault wrapper to SecureVault with unchanged macOS storage identity; Windows uses current-user Credential Manager via windows-sys, no file fallback. Credential Manager's 2560-byte generic blob limit produces a safe temporary-session warning for larger tokens; actual tenant persistence must pass before pilot approval. New Windows native Save dialog uses rfd with safe filename suggestions. Linux stays unsupported for these two features. UI storage/appearance/notification copy is platform neutral.

Aligned package/Cargo/Tauri at 1.4.4-alpha.1, converted existing PNG icon to ICO, added Windows NSIS current-user override and WebView2 bootstrapper configuration. CI adds Windows x64/ARM64 backend tests. New Windows alpha candidate workflow on relevant branch pushes builds native ARM64 on windows-11-arm, verifies PE machine type and uploads installer/checksum for 14 days, without releases or notifications to testers. See WINDOWS_ALPHA.md for architecture, limits and native acceptance steps. Feedback destination/signing/native install tests remain pending.

The new Windows vault and rfd dialog code compiled for aarch64-pc-windows-msvc in an isolated temporary check crate, including test code; this is not a full Tauri Windows build or native execution. macOS cargo check and all 204 mocked backend tests passed. No real OAuth, credential-store mutation, Graph interactions or native app launch occurred. GitHub CLI is not logged in on this Mac; the GitHub connector can read commit status, but workflow execution/artifact/native results must be checked before claiming Windows readiness.


Windows preparation local validation: all 178 targeted mocked auth/notification/appearance/Mail/meeting browser cases passed in Chromium/WebKit after adjusting two notification-copy assertions; all 97 Node tests, 204 backend tests, UI TypeScript and production build passed (existing App accessibility warnings remain). YAML parsed, release versions agree, and the Windows-only secure-vault/dialog code including test code compile-checks for ARM64. Full native Windows Tauri CI/installer and clean-machine acceptance remain distinct pending checks. Platform-neutral local-draft/signature labels were updated alongside session/settings wording.

GitHub connector GET of Actions runs is available even though the local gh CLI is unauthenticated. Both CI and Windows ARM64 candidate jobs started for 9f1dd7e. Repository metadata confirms it is public; Actions artifacts inherit repository access rather than being restricted to pilot testers. No separate public Release is published.


First native Windows CI compiled successfully on ARM64 and x64, then six away-storage tests failed because directory File::open/sync_all is Unix-specific. Replaced only the ledger commit operation with durable_file: flushed/closed temp file, MoveFileExW REPLACE_EXISTING|WRITE_THROUGH on Windows, rename plus parent directory sync on Unix. Added an overwrite/restart file test, kept failure gating rather than skipping durability. ARM64 helper compile-check and all 205 local backend tests pass; native rerun pending.

User selected GitHub Issues for feedback. Added Settings → Feedback with current app version and an explicit prefilled issue-draft link to the existing enabled public repository. It discloses public visibility, requires review/submit on GitHub, and attaches no chat/email/account data. No issues or messages created automatically. Build/types and 98 Node tests pass; focused browser check pending.

Follow-up validation: 205 local Rust tests passed after the durable-file fix; ARM64 vault/dialog/durable-file code compiled including tests. Build/type checks, 98 Node tests, and 38 focused mocked feedback/auth/notification browser cases passed. The feedback test JSON import was corrected to a Node-compatible explicit JSON import; no production behavior was affected. Native Windows rerun/installer remain pending at this checkpoint.


Windows ARM64 candidate succeeded for 1f8a91d in Actions run 44772991818; uploaded artifact 14648298989 contains TAUT_1.4.4-alpha.1_arm64-setup.exe and SHA256SUMS.txt. ARM64 PE check passed. Downloaded ZIP independently and verified installer SHA256 0860653e20b25a7f30bee3d0b9776fcc26d804c9a1389f58c2c6ee5964e5ab85, 3,443,545 bytes, without execution. All native backend CI jobs green: 206 Windows ARM64/x64 tests and macOS tests. Full remote UI run: 620 passed, four room-priority fixture cases failed because Alex was both organizer and declined attendee after the organizer-display fix; set a distinct organizer in that fixture and all four reran green locally. No runtime code changed after the successful candidate. See WINDOWS_ALPHA.md for stable artifact link, checksum and pending real Windows 11 ARM acceptance. Artifact unsigned, 14-day retention, public repository access. No public Release, tester messages or live Graph testing.


User downloaded ARM64 candidate and is waiting for Hannah to test. User's own Windows device is an 11th-generation Intel Core i7, so added a native x64 installer job alongside ARM64 in the candidate workflow. Architecture-specific runners/targets, PE checks, checksums and artifact names prevent mix-ups. No application/runtime changes or version bump; Windows x64 backend tests already passed previously, and installer build is pending.
