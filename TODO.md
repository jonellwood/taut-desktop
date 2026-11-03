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

## Remaining backlog

- [ ] Persistent sign-in across rebuilds/restarts using macOS Keychain for refresh tokens, silent session restoration in Rust, and Keychain cleanup on explicit sign-out. Keep passwords and tokens out of Svelte, logs, URLs, and plaintext files; handle revoked/expired grants and tenant sign-in policy. Lower priority at user request.

- [ ] Trusted-sender image auto-loading preference.
- [ ] Participant photos and verified Graph presence.
- [ ] Reactions and native notifications with reaction noise suppressed.
- [ ] Code-block formatting and syntax highlighting.
- [ ] Typing indicators, subject to API support.
- [ ] Shared Media panel with images, files, and links.
