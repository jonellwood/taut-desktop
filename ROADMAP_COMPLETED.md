# Completed milestones and validation record

Archived from TODO.md on November 10, 2026. Historical branch references and pending-test notes describe their original milestone, not the current queue. Current priorities and remaining validation are in [TODO.md](TODO.md). Source remains authoritative.


## Current status

- Pending-conversation workflow implemented; user reports draft creation works as expected in manual testing (2026-11-03).
- Attachment/composer improvements, mocked UI regression tests, and CI committed and pushed as `504cadd` on `test/pending-conversation-ci`.
- Group chat implementation is on `feat/group-chats`; the user approved `ChatMember.ReadWrite` on 2026-11-03; the user confirmed Entra delegated permission and admin consent on 2026-11-03; the user confirmed named group creation, first-message sending, member addition with history choices, and member removal on 2026-11-03.
- User is manually testing against the actual Office 365 tenant with their boss's approval. Automated tests continue to use mocks; this does not authorize unspecified automated tenant mutations.

## Attachment sending — manually verified

See [ATTACHMENTS.md](ATTACHMENTS.md) for behavior, limits, recovery, and the permission proposal.

- [x] Verify the documented Graph upload/share/reference flow. User approved delegated `Files.ReadWrite` on 2026-11-03; scope added.
- [x] User confirms tenant admin consent and successful live attachment sending (2026-11-03). Automated testing remains mocked.
- [ ] Low priority: investigate reported soft/low-resolution appearance; distinguish preview rendering from original file quality. Current upload code sends the selected file bytes without image resizing.
- [x] Add paperclip selection, local attachment staging, preview/removal, and per-conversation attachment drafts. Selecting a file must not upload or share it.
- [x] Upload/share and send only on explicit Send; show progress and actionable errors. Preserve the draft and track partial success to avoid duplicate uploads or ambiguous message retries.
- [x] Preserve nonempty first-message text for pending conversations; allow attachment-only messages in existing chats.
- [x] Add mocked upload/share/send tests and preserve existing attachment opening and image viewing.
- [x] Add main-composer file drops and clipboard raster-image paste into the shared local attachment staging flow; retain limits, separate drafts and explicit Send.
- [x] User manually confirmed clipboard image paste and drag-and-drop both work perfectly in the rebuilt native app (2026-11-05).

## Group conversations

See [GROUP_CHATS.md](GROUP_CHATS.md) for implemented behavior, permissions, and limits.

- [x] Create group chats with multiple selected coworkers and an optional name; keep recipient selection local until explicit creation/send.
- [x] View and manage group members, including adding and removing members.
- [x] Leave a group chat by removing myself, with clear confirmation and consequences.
- [x] Verify documented Graph operations, least-privilege delegated permissions, and history choices; add mocked coverage for creation and member operations.
- [x] User approved delegated `ChatMember.ReadWrite` on 2026-11-03; scope added to Rust.
- [x] User confirmed delegated `ChatMember.ReadWrite` and tenant admin consent (2026-11-03).
- [x] User manually verified named group creation, first-message sending, adding a user with history options, and removing that user (2026-11-03).
- [ ] Manually validate leaving a group (mocked coverage already passes).
- [x] Add a chronological activity timeline for member changes and group-name changes using structured Graph system events; no extra permissions.
- [ ] Follow up: guest/federated participant role handling, larger/paginated groups, existing-group renaming (requires separate scope review).

## Message deletion and personal chat visibility

See [DELETION.md](DELETION.md) for behavior, permission approval, Graph operations, and limits.

- [x] Soft-delete and restore own normal messages, with Rust ownership verification and explicit confirmation; tenant policy may restrict either operation.
- [x] Hide/unhide a conversation for myself, preserving shared history, membership, files, and session drafts; expose hidden chats in the sidebar.
- [x] User approved delegated `Chat.ReadWrite` on 2026-11-03; added to Rust's requested scopes.
- [x] User confirmed Entra delegated `Chat.ReadWrite` consent and manually verified message deletion/restoration and hide/unhide with the unsent draft preserved (2026-11-03).
- [x] Document exact consequences; failed or uncertain actions do not silently change the UI or automatically retry. Read-only status checks precede explicit retries.
- [x] Mocked coverage for permissions, ownership, cancellation, success, failure, recovery, stale reads, and draft preservation.
- [ ] Deferred: administrative deletion of shared threads for everyone. Requires separate `Chat.ManageDeletion.All` approval and supported admin role; user delegated the release choice and this release offers Hide for me only.

## Incoming message visibility

- [x] Request expanded latest-message previews and newest-message ordering from Graph; show message previews/times, per-conversation unread dots, and an unread-conversation badge on Chats.
- [x] Preserve drafts and synchronize read state to Teams only after explicitly opening a conversation and viewing the latest messages in the focused window. Use existing Chat.ReadWrite; no new permissions or native notifications. Start with no conversation selected; server read positions remain authoritative, including external mark-unread changes.
- [x] Cover incoming inactive/new chats, local reads and later messages, hidden chats, and server-marked unread own messages and suppression of system/reaction-only changes with mocked tests.
- Chat list currently loads the newest 50 chats; existing active and local draft conversations remain retained during synchronization. Inactive chat-list updates use the existing 30-second polling interval while TAUT is visible.
- [ ] Paginate the full chat list for larger histories.
- [x] Manual Refresh updates the whole chat list as well as the selected conversation; keep manually marked-unread own/group messages visible.
- [ ] Add explicit Mark unread controls using the supported Graph action, with no automatic re-reading until the user opens the conversation again.
- [x] User confirmed that marking a conversation read in either app updates the other, with an acceptable propagation delay (2026-11-03).

## Conversation organization — lower priority

- [x] Add Pin / Unpin actions in conversation-row options; pinning does not open or mark the chat read.
- [x] Persist pins locally per signed-in account across restarts. Pins are TAUT-only on this device; no Teams synchronization or new Graph permissions. Only chat IDs are stored; drafts and messages are not persisted with pins.

## Teams and channels

- [x] Show joined/associated teams and accessible standard/private/shared channels in a dedicated rail destination, with pagination and host identity for shared channels. User validated in the tenant.
- [x] Read channel posts and threaded replies with independent pagination, safe text rendering and stale-response protection. See TEAMS_CHANNELS.md.
- [x] Add a channel details panel with read-only member roster and loaded activity history; thread view replaces details and closing restores it. Delegated ChannelMember.Read.All approved 2026-11-04; Entra consent/fresh sign-in and manual roster validation pending.
- [x] Add explicit plain-text channel posting/replying with approved delegated ChannelMessage.Send, separate drafts and uncertain-delivery safeguards. User validated in the tenant.
- [x] Add shared formatted composition to channel posts and replies.
- [ ] Add channel attachments, mentions and activity indicators in later passes.
- [x] Add explicit ordinary team and direct private/shared channel member management with owner verification, confirmation, separate standard-channel/team semantics, leaving for non-owners, and uncertain-outcome guards. See PRESENCE_MEMBERSHIP_OOO.md. User validated in the tenant.
- [ ] Later administration phase: create teams/channels and manage team/channel membership, including leaving where supported. Research role restrictions and standard/private/shared channel differences, document least-privilege permissions, and obtain scope approval before implementation. Keep mutations explicit and all automated tests mocked.
- [x] Handle delegated channel access, pagination, missing host identity and access-denied states; real private/shared and cross-tenant coverage requires manual validation.
- [x] Document and obtain approval for delegated Team.ReadBasic.All, Channel.ReadBasic.All and ChannelMessage.Read.All (2026-11-04); keep automated testing mocked. Entra consent/fresh sign-in required.

## Presence and out-of-office — requested 2026-11-05

- [x] Add explicit temporary own presence preferences and Return to automatic with approved Presence.ReadWrite. Current online preferences need an existing Teams presence session. User validated in the tenant.
- [x] Add a configurable out-of-office message with explicit enable/disable and optional start/end scheduling. Review native Teams/Outlook OOO/status-message support separately from TAUT-generated chat replies so the UI clearly describes which behavior is provided.
- [x] Let the user choose reply scope: direct chats only, or broader coverage including group chats and Teams/channel conversations. User-approved default (2026-11-05): direct chats only; make groups/channels explicit opt-ins. Define channel/thread placement and mention/trigger behavior before implementation.
- [x] Send the configured OOO reply only once per sender per OOO period: Hannah sending four messages gets one reply. User-approved rule (2026-11-05): deduplicate across the enabled scopes using stable sender identity, account/tenant and an explicit OOO-period ID; persist the ledger so restarting or rebuilding does not resend. Define when a new OOO period resets eligibility.
- [x] Prevent reply loops and duplicate sends: process only genuinely new eligible incoming human messages after enablement, excluding own messages, historical sync, system events, bot/auto replies, edits and reaction-only changes. Reserve delivery state before sending and retain ambiguous outcomes without automatic write retries; provide clear status/recovery controls.
- [x] Confirm whether replies can work while TAUT is closed, asleep or offline; clearly distinguish server-side features from app-running-only behavior. Keep configuration and deduplication account-scoped, review any new permissions, and test all automated sends with mocked Graph requests before a separately authorized manual tenant test.

## Navigation polish

- [ ] Add TAUT-styled tab-name tooltips on left-rail hover and keyboard focus, with accessible descriptions and no clipped/obscured labels. Existing native title tooltips are the basic fallback.
- [ ] Add a Preferences option to show text labels beside navigation icons, persist the preference locally, and account for narrow windows, focus mode and unread badges.

## Remaining backlog

- [x] Implement persistent sign-in across rebuilds/restarts using macOS Keychain for refresh tokens, silent startup restoration in Rust, token rotation, and cleanup on explicit sign-out. Keep tokens out of Svelte, logs, URLs, and plaintext files; handle Keychain failures and revoked/expired grants. See [PERSISTENT_AUTH.md](PERSISTENT_AUTH.md).
- [x] User manually verified persistent sign-in across a rebuild and explicit sign-out preventing restoration (2026-11-03).

- [ ] Trusted-sender image auto-loading preference.
- [x] Verified Graph presence for chat participants and loaded rosters, consistent colors, expiry and neutral failure states. User validated in the tenant.
- [ ] Participant photos.
- [x] Display received message reactions (including likes), grouped counts, and expandable participant lists. Reaction-only changes do not create unread/new-message indicators or notifications. Custom reactions use text-only fallback. See [REACTIONS.md](REACTIONS.md).
- [x] User confirmed received reactions render correctly and a changed reaction from Teams appeared in TAUT within about 15-20 seconds (2026-11-03).
- [x] Add explicit Unicode reaction selection and removal of own standard reactions, with server verification and no automatic retries.
- [x] Enable searchable categorized emoji insertion into the composer at the caret/selection, preserving local per-chat drafts and explicit Send.
- [x] User confirmed reaction add/remove and composer emoji insertion all perform as expected (2026-11-03).
- [x] Opt-in native message notifications with reaction noise suppressed. See [NOTIFICATIONS.md](NOTIFICATIONS.md); macOS banner delivery and click routing await manual validation.
- [x] Message formatting — received rendering and opt-in source composition with preview implemented (see FORMATTING.md). Important daily workflow for sharing PowerShell. Apply consistently to chats, channel posts and reply panes.
- [x] Render received code blocks and inline code with exact line breaks, indentation, tabs and blank lines; use a monospace code container, language label, horizontal scrolling and Copy code that preserves the original code. Add syntax highlighting, with PowerShell as a required language and plain-text fallback for unknown languages. The user's Teams/TAUT screenshots demonstrate code currently being flattened into a paragraph; use that scenario as a manual acceptance case.
- [x] Preserve supported rich-text structure safely: paragraphs, line breaks, bold/italic, lists, links and blockquotes. Parse/sanitize untrusted Graph content without executing markup or auto-loading remote resources. Keep code contents literal, including angle brackets, ampersands, quotes and PowerShell variables.
- [x] Add composer formatting controls for code blocks/inline code, language selection (including PowerShell), and basic rich text; preserve per-conversation drafts, attachments and explicit Send. Verify formatting round-trips between Teams and TAUT with mocked Graph tests before manual tenant testing.
- [ ] Typing indicators, subject to API support.
- [x] Shared Media panel with images, files, and links from loaded chat history; explicit image loading and safe external opening.
- [ ] Expand Shared Media to older history/search beyond loaded messages.
- [ ] Record a looping feature showcase once the core features settle.

- [x] Welcome state: brief signal-settling-into-T/ animation, “Less noise. More signal.”, new-chat/search shortcuts, reduced-motion support; hide empty conversation chrome until selection.

- [x] Persistent layout toolbar: toggle conversation/details panels, amber active states, and focus mode that restores the previous arrangement.

- [x] Show quoted chat reply context in a side pane using explicit messageReference metadata, with read-only fetching of older parents and preserved chat drafts/media/read state. See CHAT_THREADS.md.
- [x] Add explicit text quoted-reply sending from the chat reply pane via Graph replyWithQuote under existing ChatMessage.Send, with separate reply drafts and uncertain-send safeguards. Mocked validation complete; manual tenant validation pending.

## Status and responsiveness follow-up
- [x] Provide a persistent global bottom status area for sync, authentication/session and read-state notices; preserve contextual send/operation errors.
- [x] Move frequently used legacy blocking Graph reads off the native UI thread; retain unchanged formatted-message DOM during polling and use a single-pass PowerShell display lexer.
- [ ] Manually recheck the reported macOS beachball after rebuilding; profile further if it recurs.
- [x] User manually confirmed PowerShell display and Copy code work (2026-11-04).
- [x] Add PHP and JavaScript lexical highlighting when language metadata is available; retain lossless copy and a plain-code fallback rather than guessing missing language labels.
- [ ] Extend highlighting to further languages and advanced PHP/JavaScript syntax as needed.

- [x] User manually verified a long PHP block sent from TAUT is recognized as PHP in Teams and highlighted in TAUT (2026-11-05). User also confirmed Copy code pasted into an IDE file correctly.
- [ ] Complete remaining formatted-message round-trip checks for PowerShell, basic text, quoted replies and channel posts/replies.

## Next milestone — presence, membership and away replies

- [x] Implement the unified milestone described in [PRESENCE_MEMBERSHIP_OOO.md](PRESENCE_MEMBERSHIP_OOO.md): approved scopes, real presence reads/preferences, ordinary membership administration and opt-in native away replies. Team-owner role changes and mailbox/calendar OOO stay out of scope.
- [ ] Manually validate presence, status, team/private/shared membership and away replies after consent/re-sign-in. Native presence-session management, richer status messages and broader channel discovery remain later work.

## Appearance and accessibility — requested 2026-11-05

- [x] Add Light, Dark and System appearance preferences; default to System, follow macOS changes live, and persist the explicit choice locally across restarts.
- [x] Keep the established charcoal/amber identity in Dark and create a warm off-white/slate Light theme. Refactor shared semantic color tokens across chats, channels, threads, dialogs, composers, code blocks, media and status UI rather than applying a blanket inversion.
- [x] Add blue and rose accent choices alongside amber, teal and violet; use theme-specific shades so accent text, selected states and button labels stay legible in both appearances.
- [x] Add an independent Increase contrast preference: stronger text and boundaries, clearer selected/unread/focus states, reduced translucent decoration, and status communicated through labels/shapes as well as color. Honor macOS contrast preference by default while retaining explicit user control.
- [ ] Verify theme/contrast combinations with browser tests and visual checks, including syntax highlighting, disabled/error states, keyboard focus, system changes, restart persistence and avoiding a wrong-theme flash on launch. No Graph permissions are needed.

- [x] User reports all five presence/membership permissions added with admin consent and the milestone tested successfully in the real tenant (2026-11-05). Retain targeted edge-case/manual coverage for private/shared access and away-reply recovery as needed.

- [x] Reorganize growing Preferences into categorized navigation with a fixed header/footer, segmented appearance/contrast choices, consistently styled dropdowns, and preserved unfinished forms when changing categories.
- [x] Soften light-mode surfaces and give messages subtle tone separation while keeping increased contrast available.

## Mail and unified discovery — 2026-11-05

- [ ] Show incoming email High Importance with a clear, accessible indicator in the conversation list and message header; preserve sender importance metadata.
- [x] New Mail composer: To/Cc/Bcc, subject, existing formatting/preview, local drafts, recipient review and explicit Send; save sent copies, preserve failed drafts and prevent automatic retries after uncertain acceptance. Use existing delegated Mail.Send; mailbox-synced drafts remain a separate Mail.ReadWrite proposal.

- [x] Document and obtain approval for delegated Mail.Read in MAIL.md.
- [x] Optional read-only Mail preview: Inbox/Sent, mailbox search, paginated summaries, expandable conversations, safe text reading, explicit attachment preview/save and Open in Outlook.
- [ ] Manually verify Mail with Entra consent and fresh sign-in, including real pagination, conversation matching, attachment save dialog and government-tenant policies. Mail remains manual-refresh and does not mark messages read in this preview.
- [x] Initial unified search: loaded Chats plus paginated mailbox search, source labels, navigation, permission/error isolation and preserved drafts.
- [ ] Expand unified search across Mail, Chats and Channels with source badges, sender/date filters, coverage labels and separate query providers; verify Teams search availability/scopes separately.
- [ ] Unified file discovery across mailbox attachments and OneDrive/SharePoint references, retaining original source links and access boundaries.
- [ ] Email composing/replies and chat↔mail draft bridges, with explicit recipients/quote/attachment review. Mail.Send is approved for away replies; propose any additional Mail.ReadWrite access separately.
- [ ] Packaging an installable alpha is deferred until the prospective tester has her MacBook.

- [x] Render HTML Mail with tables/headings/lists/code, sandbox isolation, blocked images, explicit reviewed links and a Plain text toggle.
- [ ] Future Mail presentation: explicit inline-image display and richer layout fidelity; keep remote-image loading opt-in.

- [x] Mail reading polish: visible active HTML/Plain text choice, saved default in Preferences → Mail, and validated sender text/background/border colors.
- [x] Extend existing away replies to opt-in internal Mail, sharing schedule/message/durable coworker ledger; delegated Mail.Send approved.
- [ ] Manually validate Mail away replies after Entra Mail.Send consent and fresh sign-in: explicit opt-in, single reply per coworker across chat/mail, thread association and suppression of automatic mail. TAUT must remain running.

- [ ] Polish right-click menus consistently across message actions, selected text, and native macOS writing/copy tools; preserve useful native text actions.

- [ ] Manually validate New Mail composing/sending after rebuild: local draft restart, To/Cc/Bcc, formatting, accepted Sent copy and tenant policy. Email attachment composition, replies/forward and chat↔mail bridges follow.

- [ ] Mail composition follow-up: attach files and insert inline images, including clipboard/drop support and explicit send review.
- [ ] Mail signature fidelity: explicit inline/CID image rendering and optional trusted-sender image controls; retain remote-image privacy protections.

- [ ] Calendar: reconcile meeting invitations/updates and RSVP state across Mail, Teams and calendar. Show confirmed Accepted/Tentative/Declined status with an explicit Change response action; request a fresh response only when the latest update needs one. Keep unread mail separate from unanswered invitations and avoid duplicate attention alerts.
- [ ] Mail meeting messages: render request/update/response metadata (including Sent acceptance responses) as compact meeting cards with subject, time, organizer and response state, rather than an empty HTML body. Do not infer RSVP state from subject text.

- [x] Mail conversation details and shared media pane: participants, date range, explicit conversation/email scope, files/images/links, source navigation, optional inline images and verified duplicate image grouping.

- [ ] Mail signatures: saved signature editor, default for new mail/replies/forwards, preview and explicit per-draft control.
- [ ] Mail deletion with clear mailbox semantics, confirmation and recovery where supported; separate permission proposal before scope expansion.
- [ ] Mail navigation unread counter badge, with accurate mailbox coverage and quiet background synchronization.
- [ ] Mail right-click Mark as unread; synchronize read state with Microsoft 365 after permission review.
- [x] People tab: deliberate coworker name/email search, presence, basic profile details and explicit Chat/Email actions. Chat reuses existing conversations or stages a local pending chat; Email opens a local addressed draft. User validated in the tenant.
- [x] Mail Reply, Reply all and Forward: source-bound local drafts, recipient review, original context and explicit Graph send actions using approved Mail.Send.

- [ ] Later appearance polish: optionally match the macOS Dock icon's T/ mark and border to the selected TAUT accent, updating when the accent changes. Retain amber as the default and preserve the recognizable icon shape; investigate native runtime icon support when scheduled.

- [x] People directory second pass: account/tenant-scoped cached roster; show cached results immediately, background refresh with last-updated/error status, explicit refresh, pagination and refresh selected profile on click. Add name sorting and local filters. Clear the current directory on sign-out; isolate cached rosters across accounts.
- [x] People profiles: richer job/contact/organization details after reviewing required delegated permissions and obtaining approval for any scope expansion.
- [x] People connections pane: selected coworker’s shared chats, email conversations and shared files with source links; distinguish loaded/local coverage from full search. Keep profile in center, directory left and optional connections right; no automatic messages or mailbox changes.

- [ ] People organization: distinguish tenant members from external/guest people using verified directory metadata (never infer from email domains alone).
- [ ] Private local sections for People and Chats: user-named sections with membership in one or multiple sections, saved per account on this device. These are personal organization preferences and must never create Microsoft 365 Teams, groups, or directory identities.

- [ ] Explore a bounded member profile deck for small groups, reusing People card switching; large groups keep a searchable member list rather than eagerly creating a card for every member.

- [x] People v1 complete: cached directory, filters, local hiding, rich profiles, shared connections and bounded manager card deck; user acceptance confirmed November 10, 2026.
