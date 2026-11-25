# TAUT Desktop roadmap

Updated November 22, 2026. Work in the numbered queue in order. Keep new ideas in the later backlog unless we explicitly reprioritize them.

## Current checkpoint

People v1 and the Mail milestone are accepted. Calendar agenda/details, RSVP, meeting composition and room discovery are implemented, along with individual Mail Move to Deleted Items and stronger Teams attachment access verification. On November 19 the user rebuilt and confirmed Mail/Calendar work after the reported Microsoft outage. The user also confirmed successful manual room booking on November 19. Active branch: `feat/message-deletion`; this checkpoint follows `e67c920`. Mail and meeting drafts remain local to this Mac.

Completed milestones and their original validation notes are preserved in [ROADMAP_COMPLETED.md](ROADMAP_COMPLETED.md). Feature documents and current source define behavior. Automated testing always uses mocks; manual tenant testing is performed by the user.

## Next — in order

1. [x] **Mail attachments and inline images.** File picker, clipboard image paste and file drop; locally persisted attachment drafts; image placement in the body; names/sizes/inline status in review; explicit send only. Preserve failed/uncertain drafts. Start with bounded small files under existing Mail.Send; larger uploads need a separate design and permission review. See [MAIL.md](MAIL.md).
2. [x] **Mail signatures.** Saved signature editor, defaults for new mail/replies/forwards, preview and per-draft control. Defaults are edited in Settings → Mail. Keep signature changes separate from the user's message and attachment review.
3. [x] **Chat → Respond by email.** Create an editable local draft with quoted source attribution; review recipients and any attachments explicitly. Never send or cross-post on selection. Reverse Mail → Chat is a later extension.

The three-item implementation queue is complete; signature sending and the received chat quote were user-validated. Received inline image approval and Mail read-state controls were manually validated by the user, including read/unread propagation to Outlook web and native.

## Platform testing — near term

- [ ] **Installable macOS alpha for a tester.** Prepare an installable package for another Mac user, confirm their Mac architecture and distribution/signing requirements, and document installation and basic acceptance checks. Build only when explicitly agreed.
- [ ] **iOS build for the user's iPhone.** Assess mobile compatibility and required UI/native adaptations, configure device signing/provisioning, and prepare a build the user can install on their own iPhone. This is a personal device test, not an App Store release. Build only when explicitly agreed.

Both items were requested November 22 for the near future; no implementation or build is requested now.

## Mail and discovery — later

- [ ] Multiple named signatures, with separate defaults for new emails, replies and forwards (for example, full and short forms).
- [x] High Importance indicator in the list and message header, using actual metadata.
- [ ] Compact meeting request/update/response cards, including empty-body Sent acceptance responses. Never infer RSVP state from subject text.
- [x] Mail read state: right-click Mark read / Mark unread and configurable mark-read-after-viewing delay, with focus/visibility guards and server reconciliation. Delegated Mail.ReadWrite approved and Entra admin consent confirmed November 10, 2026; see MAIL.md. Requested scope and implementation added.
- [x] Mail Inbox unread badge from server folder metadata, visible/online quiet checks, stale/backoff behavior, and preserved Mail drafts/selection/scroll/paging. Other folders/subfolders excluded.
- [x] Individual email Move to Deleted Items with confirmation (restore in Outlook); existing Mail.ReadWrite, no new scopes.
- [ ] Mail folder organization, in-app restore and mailbox-synced drafts: document semantics and obtain explicit feature approval.
- [x] Explicit per-image approval: Preview renders a received inline/CID image in HTML view, modal preview in plain text; remember approval per account/message/image and provide revocation. Never treat a click as sender-wide trust.
- [ ] Optional trusted-sender image controls; preserve remote-image privacy protections and improve signature layout fidelity.
- [ ] Unified search: channel provider, sender/date filters and broader chat history. Verify Teams server-search support/scopes first; current Chats search covers loaded messages.
- [ ] Unified file discovery across mailbox attachments and OneDrive/SharePoint references, preserving source links and access boundaries.
- [ ] Mail → Chat local draft bridge.

## Teams, chats and people — later

- [x] Pilot attachment download: direct-file references use SharePoint file GUID/webDavUrl. User confirmed the fix using the Mac dev sender and existing recipient apps; no new Windows build needed. Earlier messages are not rewritten.
- [x] Paginate beyond the newest 50 conversations with explicit Load more conversations, preserved selection/drafts/history, retry and account guards. User confirmed manual acceptance November 20; queued for next agreed installer release. Admin-reported Teams message retention is six months; TAUT imposes no client-side retention cutoff.
- [ ] Extend Shared Media beyond loaded history. Chat message history has explicit older-page loading and preserves loaded pages during refresh; Vance history recovery via older-page loading was user-confirmed November 20.
- [x] Explicit Mark as unread in chat right-click/options menus, using existing Chat.ReadWrite and verified self identity. Active-chat automatic read marking pauses until an explicit revisit. User confirmed manual acceptance November 20; queued for next agreed release.
- [ ] Channel attachments, mentions and activity indicators.
- [ ] Create teams/channels: research standard/private/shared semantics, role restrictions and least-privilege permissions before implementation. Ordinary membership management already exists.
- [ ] Existing group renaming, guest/federated role handling and larger group pagination.
- [ ] Native presence-session management, richer status messages and broader channel discovery.
- [ ] Participant photos.
- [ ] Distinguish tenant members and guests using verified directory metadata.
- [ ] Private local People/Chat sections: many-to-many membership, per-account persistence, never create tenant groups or Teams.
- [ ] Bounded member profile deck for small groups; searchable roster for large groups.
- [ ] Typing indicators, subject to supported API availability.
- [ ] Administrative shared-thread deletion stays deferred; requires separate approval and supported admin role.

## Calendar, Files and calls

- [x] Calendar reminders using Outlook timing, opt-in desktop notifications while TAUT runs, durable duplicate prevention and open-event routing. Mocked checks pass; native acceptance and next agreed release pending.
- [x] TAUT reminder cards: four corner positions, local countdown/time, Join/Open, persistent five-minute snooze, dismiss and stacked simultaneous meetings. Mocked checks pass; native window/focus/action acceptance pending.
- [ ] Investigate missed/late reminders and snoozed cards disappearing after Outlook dismissal. The local pending queue was empty after the failed snooze; removal reason is not yet recorded. Verify before considering native reminder acceptance complete.
- [ ] Reminder card size preference: Full size / Compact; user requested as a future enhancement after testing simultaneous cards.
- [ ] Calendar reminder follow-ups: custom timing, optional sound and reminder inbox. Initial timing stays in Outlook.
- [x] Calendar meeting composer, local draft, room picker, advisory availability and reviewed invitation creation.
- [x] New daily/weekly recurring meetings with weekdays, interval, explicit end date or occurrence count; named time zone retained across daylight saving. Pending native acceptance and next agreed release.
- [ ] Calendar follow-ups: recurring series editing, monthly/yearly patterns, and adding Teams links to existing offline meetings. Organizer edits/cancellation are implemented for single meetings; manage recurring series in Outlook.
- [x] Teams meeting option for new Calendar events, supported-provider check, reviewed hybrid room/people invitations and safe Join Teams meeting action in details. Mocked validation complete; manual tenant acceptance pending and queued for next agreed installer release.
- [x] Meeting time-entry refinement: separate date/time controls for creation/editing; Settings → Calendar default meeting length; auto-fill new draft end times while preserving manual overrides; explain availability prerequisites and optional hybrid rooms. Mocked validation complete; native Mac acceptance pending.
- [ ] Time picker redesign: user reviewed wheel, clock-face and stepper prototypes; prefers five-minute picker increments with direct typing for exact times. Lean toward a wheel with explicit AM/PM buttons; preserve off-grid existing times and hide seconds/milliseconds in normal presentation.
- [x] Click-to-open meeting time picker with hour/minute/AM–PM controls, keyboard entry and cancel/Escape behavior. Hide Show meeting summary while the details panel is open. Manual Mac acceptance pending.
- [x] Matching accented calendar/clock icons and automatic focus from a committed date to its corresponding time field. Browser validation complete; native Mac acceptance pending.

- [x] Calendar v1: read-only date/agenda/details workspace, recurring occurrences, attendee and recorded response status. Delegated Calendars.Read approved; user validated successfully.
- [x] Calendar/Mail: resolve invitations to current calendar status; reviewed Accept/Tentative/Decline and Change response with approved Calendars.ReadWrite.
- [x] Calendar/Mail response reconciliation: current recorded RSVP, explicit superseded-request metadata, Change response for answered events, read-only refresh on return and bounded post-response confirmation. Unread mail and event version changes never imply a new response is required.
- [ ] Teams meeting association and unified attention reconciliation: use verified calendar links/identities and avoid duplicate alerts across future surfaces.
- [ ] Files: lightweight OneDrive browser and shared discovery across communication sources.
- [ ] Calls: research supported native integration and permissions before defining scope.
- [ ] Decide whether Activity adds useful signal before implementing a feed.

## Polish and validation

- [ ] Mail presentation resets after automatic mark-as-read (reported November 23; reproduced three times): with Plain text as the default and automatic read delay set to 3 seconds, open an unread email and switch it to HTML before the delay expires. It unexpectedly returns to Plain text around the read-state update. Already-read emails retain the HTML selection. Suspected cause, not yet verified: read-state refresh/remount reapplies the default presentation. Preserve the current message's explicit presentation choice across read-state updates; regression coverage should include unread/read messages and both default modes.
- [ ] Styled rail tooltips for hover/focus and an optional persistent navigation-label preference.
- [ ] Consistent context menus while preserving useful native text/copy/writing tools.
- [ ] Additional syntax languages as needed.
- [ ] Investigate soft attachment previews separately from original uploaded bytes.
- [ ] Recheck the reported macOS beachball; profile if it recurs.
- [ ] Targeted manual edge cases: leave group; private/shared/cross-tenant membership; away-reply recovery. Basic presence/membership/away milestone was user-validated.
- [ ] Manual Mail away replies: one reply per coworker across chat/mail, thread association, automated-mail suppression. Mail.Send consent is confirmed; this specific test remains outstanding.
- [ ] Further signature rendering polish and chat-to-email edge cases; basic signature sending and received quote were user-validated, as were attachments and inline image sending.
- [ ] Manual Mail edge cases: Inbox unread count and external Outlook read/unread synchronization, government-tenant policy, long pagination, forwarded original attachment fidelity. New mail sending, replies, draft restart and PDF save were user-validated.
- [ ] Native macOS notification click routing and OS appearance/contrast changes. Banner delivery was user-validated; automated theme/contrast coverage passes.
- [ ] Remaining formatted-message round-trip edge cases in channels and quoted replies; long PHP send and IDE copy were user-validated.
- [ ] Optional accent-matched Dock icon, later.
- [ ] Looping feature showcase after core workflows settle.
- [ ] Desktop alpha after Calendar acceptance: Windows 11 ARM64 first (two testers), macOS second (one tester), Linux deferred (tentative tester). Windows compatibility implementation and build pipeline are prepared; see WINDOWS_ALPHA.md. First ARM64 installer built and checksum verified; clean-device native acceptance remains pending; installer/clean-machine verification and Settings feedback link to GitHub Issues (implemented per user preference). Recurring editing remains deferred. New Teams meeting links are implemented in development and await manual acceptance/next agreed release; shipped alpha.2 does not include them.

### November 23 — meeting time picker redesign
- Replaced dropdowns with hour/minute wheels, five-minute picker choices and explicit AM/PM buttons. Native time fields still accept exact typed minutes; visible fields omit seconds/milliseconds.
- Picker changes are staged until Set time; Cancel, Escape and outside click discard them. Unchanged off-grid values and hidden stored precision survive opening/applying the picker, so a subject-only edit sends no time changes. Existing duration/manual-end behavior remains covered.
- Verification: 54 mocked Chromium/WebKit browser checks passed across meeting-time and meeting-manage, including exact-minute keyboard selection and subject-only precision preservation. Frontend build and UI TypeScript checks run; no real Graph mutations, Rust rebuild or installer dispatch. Manual Mac acceptance remains pending.

### November 23 — advisory conflicts and accent app icons
- User accepted the revised time picker and reminder delivery at 2:00 for the 2:15 meeting, plus Open meeting routing. The immediately preceding missing reminder had Outlook Reminder=None; no defect established for that event. Earlier missed/snooze reports remain historical, not claimed fixed by this test.
- Added read-only own-calendar overlap warnings near time fields and in create/edit review, with overlap labels on agenda events. Uses existing calendar_page/Calendars.Read, loaded-event fallback, fresh debounced checks and review refresh. No new permissions or server writes. Excludes cancelled/Free/declined/self; strict interval overlap permits adjacent meetings, local dates for all-day spans, tentative labels, first-occurrence-only recurrence warning and honest incomplete/error state. Scheduling remains allowed.
- User promoted accent icons ahead of backlog. New allowlisted app_icon_accent command uses bundled assets only. macOS updates NSApplication Dock icon on the main thread; other desktops update main-window icon. Frontend applies saved/current accent, favicon follows too. Finder/installer icons unchanged. Source artwork retained, deterministic variant generator in scripts/accent-icons.py (Pillow); no image-generation service or runtime external resource. Native command unavailable to reminder window under existing IPC allowlist.
- Checks: frontend build, UI TypeScript, Node suite, mocked Chromium/WebKit meeting and appearance checks; offline cargo check on macOS. Native Dock visual acceptance and Windows/Linux native icon behavior still need manual verification. No installer build or real Microsoft 365 mutation.

### November 23 — first macOS installable alpha
- User explicitly approved packaging; tester confirmed Apple Silicon. Bumped source version to 1.4.4-alpha.3 and added macOS bundle override/Finder icns. Built app + DMG locally; initial sandbox hdiutil device denial resolved with escalated packaging.
- Verified DMG integrity and mounted contents, arm64 executable, app identifier/version/minimum macOS 11.0, Applications symlink and strict ad-hoc signature. No Developer ID identity installed, so no notarization. See MACOS_ALPHA.md for installation, acceptance, checksum and limitations.
- Installer copied outside target cache to release-artifacts/macos-alpha.3, Git-ignored. Current source includes uncommitted changes; no remote publication or Windows release build performed. Clean-machine installation remains pending.

### November 23 — preserve explicit Mail presentation across read updates
- Reproduced the reported Plain default → HTML → three-second auto-read reset in mocked WebKit before the fix. Cause: MailBody's effect read message.id through the replaceable message prop, rerunning on read-state object replacement and reapplying the default.
- Replaced reset effect with explicit message-ID-scoped local presentation override and derived default fallback. Read/unread updates no longer overwrite a chosen view. Default preference remains unchanged; sandbox/image protections unchanged.
- Regression matrix covers both defaults and initial read states, automatic three-second read, manual unread, and unchanged saved default. Existing mail browser suite also checked. No native or installer rebuild; the already-delivered Mac alpha.3 does not contain this fix.

- User manually confirmed the Mail presentation fix November 23. Accent Dock icon and conflict warnings were also accepted on this Mac. Source checkpoint includes these confirmations; Mac alpha.3 artifact remains the earlier verified build and has not been rebuilt for the Mail fix.

### November 23 — compact reminder cards
- Added Full size / Compact setting alongside reminder position. Full size is default, including migration of existing saved settings. Compact preference persists in the existing local reminder store, without changing timing, enabled state, pending reminders or Outlook.
- Reminder surface reads layout through a new read-only allowlisted command and updates on its existing one-second refresh. Compact reduces spacing/type and native window height; Join/Open/Snooze/Dismiss retain their existing handlers. Settings writes remain main-window-only.
- Validation: 34 Chromium/WebKit reminder/settings checks, including both themes, visible actions at 400x295, live layout change and settings reload; 14 Rust reminder tests cover persistence, legacy settings and compact placement. Frontend build/type checks passed. No real Graph mutations or installer rebuild. Manual Mac acceptance pending.

### November 23 — reminder preview
- User requested a test reminder to evaluate size and position. Added explicit Preview reminder button in Calendar settings. Native preview is an in-memory sample, shown in the same reminder window and appended alongside real reminders; its size/corner/theme respond to current preferences.
- Preview expires after 60 seconds or explicit Dismiss. Join/Open/Snooze disabled for sample, and backend rejects non-dismiss preview actions before any auth/Graph operation. Preview creation remains main-window-only. Does not enable reminders, create events, persist sample data or modify real reminder queues.
- Validation uses mocked reminder/settings browser tests and Rust preview expiry/non-persistence tests. No real Graph mutations or installer dispatch. Restart local dev app for new native command; manual acceptance pending.

### November 24 — collapsible email address headers
- Long From/To/Cc block now starts collapsed behind Message details with recipient count, independent of the message expansion control. Full addresses remain available inline by pointer or keyboard; right panel is not required. Disclosure remains open across read-status object updates. No Graph behavior or mail presentation changes.
- Frontend build and mocked Chromium/WebKit mail-details checks cover long To/Cc lists, keyboard expansion, read-state updates and unchanged HTML selection. No installer rebuild.

### November 24 — OneDrive Files v1 and unified search
- User agreed to own OneDrive browsing/downloads first, uploads and shared-media collection afterward, and requested unified search integration in the first milestone. Implemented Files rail workspace with root/folder breadcrumbs, loaded-item sorting, explicit paging, browser opening, native Save downloads and independent OneDrive search source in unified search. Search results navigate to containing folders; existing chat drafts/read state untouched.
- Existing Files.ReadWrite permits reads; SCOPES unchanged. New Rust files module builds own-drive GET routes from /me/drive; bounded sanitized responses strip preauthenticated URLs. Continuations must match the same Graph host/route; search is OData escaped/encoded. Browser URLs are checked and downloaded content stays in Rust. Download uses user-selected destination, validated HTTPS Microsoft hosts/redirects without bearer headers, 100 MiB bound, account checks and atomic flushed staging. No Graph writes, upload/share/delete/move implementation. Shared shortcuts use browser opening only.
- Source map and acceptance checklist in FILES.md. File rows initially use icons; thumbnails/grid, uploads, unified shared media and PDF viewer remain follow-ups. macOS/Windows save dialogs; unsupported platforms explain browser alternative.
- Mocked browser coverage includes folder/root navigation, explicit download, paging/deduplication, cancel/error feedback, shared shortcuts, provider independence and navigation away; native tests cover scopes, escaping, continuation boundaries and secret stripping. Frontend/TypeScript, Node and Rust suites run. No real Microsoft 365 interaction or installer rebuild. Local dev restart required for new native commands; actual OneDrive/manual download acceptance pending.

### November 24 — Files List / Icons and type filtering
- User approved compact List plus Icons grid, type-specific icons and filtering loaded items; true multi-pane Finder columns remain deferred. New FileIcon reuses lucide vectors; no thumbnails, file-content reads, scopes or Rust changes. List shows Name/Type/Modified/Size; grid uses centered icons/names and accessible Open/Download controls. Unified search gets the same dense rows/type icons.
- Files view preference persists on this device, safely defaults to List. Filter categories: folders/documents/PDF/images/video/audio/archives, with unknown types still visible under All. MIME/extension classification handles Office, code/text and common media/archive formats. Count and empty state explicitly describe loaded items; filtering issues no network calls and does not remove Load more.
- Validation: mocked Chromium/WebKit Files/search regressions plus view persistence and local filtering matrix; 117 Node tests including type classification; frontend build and UI TypeScript checks pass. Visually inspected List/Icons screenshots in WebKit. No native/installer build; manual acceptance pending.

- User accepted Files display/filtering and recently modified sorting November 24; agreed to call this pass done. Added future polish for a clear-search × resetting to the current folder, and consideration of up to ten local per-account recent search phrases with rerun buttons/clear history. No search-history implementation started.

### November 24 — checkpoint and reviewed OneDrive uploads
- Committed/pushed Files v1 plus prior reminder/header polish as 763113a before upload work. No installer dispatch.
- Added FilesUpload choose/drop zone with bounded local staging (5 files, 10 MiB each, 25 MiB total), removal, duplicate choice (rename/keep both or fail/stop; no overwrite), and explicit review/confirmation of destination. Files inherit existing folder permissions; no sharing/message operation. Search-result view disables staging until returning to a folder.
- Native upload validates own account, Files.ReadWrite and own-drive folder before authenticated createUploadSession, then sends sequential 1.25 MiB fragments to validated Microsoft preauthenticated URL with no OAuth header or redirect follow. Progress is acknowledged bytes only; size/metadata completion validated. No write retries. Session URL and file contents remain Rust/in-memory, not logs/IPC return/local storage.
- Per-account local attempt marker is saved before writes; native state prevents overlapping/repeated attempts. Reload/lost response checks native progress; confirmed completion removes staged file without resend. Unconfirmed result blocks further upload until user checks OneDrive; batches stop on first failure and preserve visible partial results. File selections are not persisted across restart; no automatic resume or attempt cleanup writes.
- Mocked browser coverage: selection/drop local-only, review cancellation, exact folder/policy, progress/single submission, partial-batch/reload recovery, lost-response success and unavailable local attempt storage. 251 mocked Rust unit tests passed; Node/build/UI type checks run. No live upload or installer build; restart dev app for native commands and manually test a small file.

- User confirmed uploading worked November 24. Requested Files follow-ups recorded in TODO: Recently added sort, New Folder, confirmed move to Recycle Bin, Share via Email/Chat reviewed local drafts with separate recipient access handling. Graph delete uses existing Files.ReadWrite (Microsoft driveitem-delete documentation); no consent change requested and none implemented. No feature implementation started for these follow-ups yet.


### November 24 — Files folders and sorting (development)
User accepted upload testing. Added Recently added sorting from createdDateTime and New folder review dialog, existing Files.ReadWrite only. Own account/parent verified; duplicate names fail; uncertain POST never retries automatically. Folder creation awaits user manual acceptance. Automated checks are mocked only. Delete/Share remain future work. No installer build requested or produced.

### November 24 — Files deletion (development, manual acceptance pending)
Added multi-select and explicit Recycle Bin review for files and folders, including nonempty folder contents warning. Maximum 100 selected loaded items; Shift-click/select all/clear supported. Own-drive only; shared shortcuts/root refused, If-Match current versions, selected descendant covered by selected folder, per-item outcomes and no automatic retries. Uncertain write stops batch; failures remain selected. Existing Files.ReadWrite only. All automated tests mocked; no real Microsoft 365 mutations or installer build. User confirmed manual New folder success before this work.

### November 24 — Reviewed file sharing (development)
Added Share selected (1–5 own-drive files/folders): coworker email or existing loaded chat, read-only review then explicit Share and send. Native single-use 10-minute plans hold URLs, verify account/item version/membership, preserve direct edit access, grant named read access only and verify recipients before one message. No automatic retries; partial sharing/delivery outcomes explained. Existing scopes only. Guest recipients/new chats deferred; manual recipient-open checks pending. Move files/folders is backlog polish per user request. No installer build or real Microsoft 365 automated mutation.

Sharing validation: frontend build/types and 118 Node checks pass; full Rust suite 268 tests passes, including seven mocked sharing tests. Files regression run passed 48 checks before destination-label fixes; all 12 sharing checks then passed in Chromium/WebKit. Native view-access/recipient-open acceptance remains a user test. Move to another folder recorded as deferred polish. No installer build.

### November 24 — Emoji picker layout polish
Separated EmojiPicker from Preferences dialog sizing; compact 480px maximum width, content padding, dynamic viewport height limits, independently scrolling emoji grid and narrow-window stacked controls. Arrow navigation follows the actual responsive grid columns. Existing reaction/send behavior unchanged; automated checks use mocked IPC only. No installer build.

### November 24 — Files selection details panel
Moved Share/Delete/Clear from the scrolling list into a persistent selection panel. Selected names/type/size and per-item removal are visible independently of the main browser scroll. Uses existing details toggle, opens on selection; narrow windows use a compact lower layout. Load more preserves selection. Existing send/delete review gates unchanged. Mocked long-list, narrow viewport, toggle and paging tests added; manual acceptance pending. No installer build.

### November 24 — Pilot feedback triage
Windows daily-driver tester reports positive Mail/Teams use. Shared calendar access is a priority discovery/design item; no implementation or scope expansion performed. Recorded Windows alpha.2 e02a507 predates sender-side attachment fix 92f6d9c; tester sender version/new screenshot needs confirmation before diagnosing a regression. Received [2] in supplied screenshot belongs to website text link and is intentional under current sanitizer rules. Signature formatting needs intranet HTML sample; current outgoing editor supports text/Markdown, not Outlook rich paste. Spelling/grammar added to later roadmap with local-first/privacy considerations. Files selection panel accepted. No installer build triggered.

### November 24 — Signature generator accepted; received layout compatibility
User tested the updated generator in Outlook before sending and after receipt, with images blocked and allowed; layout accepted in that tested environment. Supplied generated HTML is hosted-image markup. Added bounded resource-free layout preservation in received Mail renderer (spacing, local fonts, line height, table layout/roles/widths, alignment and image display), with anonymized markup fixture and mocked browser regressions. Remote images remain blocked; inline CID approval unchanged. Outgoing rich signature paste is not implemented yet. No installer build or automated tenant mutation.

### November 24 — External image approval and directional Mail cards
User approved explicit per-email external-image controls and opposite alignment for sent/received conversation cards. Implemented hosted HTTPS image discovery, domain/label disclosure, one-image explicit load and Block again. Native unauthenticated fetch pins public DNS answers, disables redirects/proxies and bounds raster downloads to 5 MiB/15-second HTTP timeout. No tokens/cookies/referrer or automatic sender/tenant trust. Approval is in-memory for the open email; safe senders remain deferred. Sent cards left, received cards right/mirrored header; body alignment preserved. Frontend build/types and targeted native/browser mocked regressions run; no real Microsoft 365 mutations or installer build. Requires dev app restart for new native command. Manual hosted-image/layout acceptance pending.

External-image manual failure diagnosed: user's intranet host resolves to 10.50.10.27; direct unauthenticated logo probe succeeds. Private-network blanket denial caused the failure. Added per-image explicit intranet confirmation (RFC1918/ULA only, never loopback/link-local/special ranges), matching disclosure styling and safe specific errors. No persisted domain/sender trust. Targeted native/browser regressions and frontend checks run; manual TAUT retry pending. No installer build.

### November 24 — alpha.4 release checkpoint
User confirmed external/intranet signature images now load, then explicitly requested commit/push and Mac/Windows builds. Bumped synchronized app/package/Cargo versions to 1.4.4-alpha.4. Release tag triggers Windows x64/ARM64 and new Apple Silicon macOS workflow; ordinary branch pushes do not trigger installers. Existing identifiers/install modes preserved for manual in-place upgrades; native Windows upgrade acceptance deferred to tomorrow. No automatic updater added. Accumulated Files and Mail work included; file moving remains deferred. Local release checks and remote build links recorded in delivery conversation; no real Microsoft 365 automated mutations.

### November 25 — Shared calendar first implementation
User approved the refined prototype: explicit In my view/Hidden switches and separate Focus/Focused toggle, with banner return and restored context. Added mailbox calendar discovery and secondary calendarView reads under existing scopes only. Calendars exposed in /me/calendars can be selected; direct-owner access requiring Calendars.Read.Shared remains unimplemented/unapproved. Other sources always read-only in TAUT; primary calendar RSVP/edit/create and reminders unchanged. CalendarPicker, source/event identity, independent read errors/paging, per-account visibility, source labels/colors, fresh metadata private-item redaction and focus snapshot restoration implemented. See CALENDAR.md for source/API limitations and manual checklist. Build/type, 118 Node, 276 Rust tests passed; 84 initial browser regressions and 50 final shared/Calendar checks passed. No real Microsoft 365 automated operations or installer build. Native manual discovery/acceptance pending; restart dev app.

### November 25 — People/Teams calendar expansion
User approved Calendars.Read.Shared explicitly; added only that scope, pending fresh sign-in after Entra update. Implemented bounded joined-Teams discovery/group views under existing permissions and explicit person directory selection/read-only owner-calendar access, per-account local selected IDs, removal, route-bound paging/private redaction and access-loss clearing. Store/Dashboard excluded. Tests mocked; no real M365 test or installer. See CALENDAR.md for native acceptance steps and current scope (supersedes earlier no-direct-owner limitation).

### November 25 — Calendar Cards and compact Agenda
User requested the final feature of the day: responsive Cards (default) and compact Agenda, grouped by day with counts and a device-local remembered preference. Existing event selection/details, date, visibility and temporary Focus retained; presentation switches do not read/write Graph. Frontend build/types pass; browser regression and visual verification cover layout, persistence, narrow widths and existing Calendar/shared behavior. No installer build, commit or push requested.
