# TAUT Desktop todo

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
- [ ] Follow with drag/drop and clipboard images.

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

- [x] Show joined/associated teams and accessible standard/private/shared channels in a dedicated rail destination, with pagination and host identity for shared channels. Manual tenant validation pending.
- [x] Read channel posts and threaded replies with independent pagination, safe text rendering and stale-response protection. See TEAMS_CHANNELS.md.
- [x] Add a channel details panel with read-only member roster and loaded activity history; thread view replaces details and closing restores it. Delegated ChannelMember.Read.All approved 2026-11-04; Entra consent/fresh sign-in and manual roster validation pending.
- [x] Add explicit plain-text channel posting/replying with approved delegated ChannelMessage.Send, separate drafts and uncertain-delivery safeguards. Manual tenant validation pending.
- [ ] Add channel attachments, formatting, mentions and activity indicators in later passes.
- [ ] User reports ChannelMember.ReadWrite.All admin consent is granted (2026-11-04); membership-management UI and requested write scope are not implemented. Standard-channel membership needs team-level operations; private/shared management needs owner and direct/inherited access checks.
- [ ] Later administration phase: create teams/channels and manage team/channel membership, including leaving where supported. Research role restrictions and standard/private/shared channel differences, document least-privilege permissions, and obtain scope approval before implementation. Keep mutations explicit and all automated tests mocked.
- [x] Handle delegated channel access, pagination, missing host identity and access-denied states; real private/shared and cross-tenant coverage requires manual validation.
- [x] Document and obtain approval for delegated Team.ReadBasic.All, Channel.ReadBasic.All and ChannelMessage.Read.All (2026-11-04); keep automated testing mocked. Entra consent/fresh sign-in required.

## Navigation polish

- [ ] Add TAUT-styled tab-name tooltips on left-rail hover and keyboard focus, with accessible descriptions and no clipped/obscured labels. Existing native title tooltips are the basic fallback.
- [ ] Add a Preferences option to show text labels beside navigation icons, persist the preference locally, and account for narrow windows, focus mode and unread badges.

## Remaining backlog

- [x] Implement persistent sign-in across rebuilds/restarts using macOS Keychain for refresh tokens, silent startup restoration in Rust, token rotation, and cleanup on explicit sign-out. Keep tokens out of Svelte, logs, URLs, and plaintext files; handle Keychain failures and revoked/expired grants. See [PERSISTENT_AUTH.md](PERSISTENT_AUTH.md).
- [x] User manually verified persistent sign-in across a rebuild and explicit sign-out preventing restoration (2026-11-03).

- [ ] Trusted-sender image auto-loading preference.
- [ ] Participant photos and verified Graph presence.
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
- [ ] Shared Media panel with images, files, and links.

- [x] Welcome state: brief signal-settling-into-T/ animation, “Less noise. More signal.”, new-chat/search shortcuts, reduced-motion support; hide empty conversation chrome until selection.

- [x] Persistent layout toolbar: toggle conversation/details panels, amber active states, and focus mode that restores the previous arrangement.

- [x] Show quoted chat reply context in a side pane using explicit messageReference metadata, with read-only fetching of older parents and preserved chat drafts/media/read state. See CHAT_THREADS.md.
- [x] Add explicit text quoted-reply sending from the chat reply pane via Graph replyWithQuote under existing ChatMessage.Send, with separate reply drafts and uncertain-send safeguards. Mocked validation complete; manual tenant validation pending.

## Status and responsiveness follow-up
- [x] Provide a persistent global bottom status area for sync, authentication/session and read-state notices; preserve contextual send/operation errors.
- [x] Move frequently used legacy blocking Graph reads off the native UI thread; retain unchanged formatted-message DOM during polling and use a single-pass PowerShell display lexer.
- [ ] Manually recheck the reported macOS beachball after rebuilding; profile further if it recurs.
- [x] User manually confirmed PowerShell display and Copy code work (2026-11-04).
- [ ] Expand syntax highlighting beyond PowerShell, including PHP when language metadata is available; retain plain-code fallback rather than guessing missing language labels.

- [ ] Manually verify newly composed formatted messages round-trip through Teams (PowerShell code, basic text, quoted replies, channel posts/replies).
