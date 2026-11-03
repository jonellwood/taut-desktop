# TAUT Desktop todo

## Current status

- Pending-conversation workflow implemented; user reports draft creation works as expected in manual testing (2026-11-03).
- Attachment/composer improvements, mocked UI regression tests, and CI committed and pushed as `504cadd` on `test/pending-conversation-ci`.
- Group chat implementation is on `feat/group-chats`; the user approved `ChatMember.ReadWrite` on 2026-11-03; tenant consent and manual validation remain pending.
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
- [ ] Complete tenant consent, sign out/in, and manually validate group operations.
- [ ] Follow up: guest/federated participant role handling, larger/paginated groups, existing-group renaming (requires separate scope review).

## Message and conversation deletion

- [ ] Delete individual messages where supported; establish ownership and permission restrictions and whether recovery is possible.
- [ ] Delete entire message threads/conversations where supported. Research and clearly distinguish hiding/removing a chat for myself from deleting shared history for everyone.
- [ ] Confirm the actual scope and consequences of each destructive action in the UI; do not silently delete or fall back to a different operation.
- [ ] Cover deletion and membership changes with mocked requests, including failures and partial success.

## Remaining backlog

- [ ] Persistent sign-in across rebuilds/restarts using macOS Keychain for refresh tokens, silent session restoration in Rust, and Keychain cleanup on explicit sign-out. Keep passwords and tokens out of Svelte, logs, URLs, and plaintext files; handle revoked/expired grants and tenant sign-in policy. Lower priority at user request.

- [ ] Trusted-sender image auto-loading preference.
- [ ] Participant photos and verified Graph presence.
- [ ] Reactions and native notifications with reaction noise suppressed.
- [ ] Code-block formatting and syntax highlighting.
- [ ] Typing indicators, subject to API support.
- [ ] Shared Media panel with images, files, and links.
