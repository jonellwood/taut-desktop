# TAUT Desktop roadmap

Updated November 10, 2026. Work in the numbered queue in order. Keep new ideas in the later backlog unless we explicitly reprioritize them.

## Current checkpoint

People v1 is accepted. Chats, channels, presence/membership, away replies, appearance, unified search and Mail reading/composing/replying/forwarding are implemented. Mail drafts are local to this Mac. The checkpoint is `5ac97f9` on `feat/message-deletion`; the end-of-day Mail checkpoint follows it on the same branch.

Completed milestones and their original validation notes are preserved in [ROADMAP_COMPLETED.md](ROADMAP_COMPLETED.md). Feature documents and current source define behavior. Automated testing always uses mocks; manual tenant testing is performed by the user.

## Next — in order

1. [x] **Mail attachments and inline images.** File picker, clipboard image paste and file drop; locally persisted attachment drafts; image placement in the body; names/sizes/inline status in review; explicit send only. Preserve failed/uncertain drafts. Start with bounded small files under existing Mail.Send; larger uploads need a separate design and permission review. See [MAIL.md](MAIL.md).
2. [x] **Mail signatures.** Saved signature editor, defaults for new mail/replies/forwards, preview and per-draft control. Defaults are edited in Settings → Mail. Keep signature changes separate from the user's message and attachment review.
3. [x] **Chat → Respond by email.** Create an editable local draft with quoted source attribution; review recipients and any attachments explicitly. Never send or cross-post on selection. Reverse Mail → Chat is a later extension.

The three-item implementation queue is complete; signature sending and the received chat quote were user-validated. Received inline image approval and Mail read-state controls were manually validated by the user, including read/unread propagation to Outlook web and native.

## Mail and discovery — later

- [ ] Multiple named signatures, with separate defaults for new emails, replies and forwards (for example, full and short forms).
- [x] High Importance indicator in the list and message header, using actual metadata.
- [ ] Compact meeting request/update/response cards, including empty-body Sent acceptance responses. Never infer RSVP state from subject text.
- [x] Mail read state: right-click Mark read / Mark unread and configurable mark-read-after-viewing delay, with focus/visibility guards and server reconciliation. Delegated Mail.ReadWrite approved and Entra admin consent confirmed November 10, 2026; see MAIL.md. Requested scope and implementation added.
- [ ] Mail unread badge with honest mailbox coverage and quiet background synchronization.
- [ ] Mail deletion/organization and mailbox-synced drafts: document semantics and obtain explicit feature approval; existing Mail.ReadWrite approval covers read-state changes only.
- [x] Explicit per-image approval: Preview renders a received inline/CID image in HTML view, modal preview in plain text; remember approval per account/message/image and provide revocation. Never treat a click as sender-wide trust.
- [ ] Optional trusted-sender image controls; preserve remote-image privacy protections and improve signature layout fidelity.
- [ ] Unified search: channel provider, sender/date filters and broader chat history. Verify Teams server-search support/scopes first; current Chats search covers loaded messages.
- [ ] Unified file discovery across mailbox attachments and OneDrive/SharePoint references, preserving source links and access boundaries.
- [ ] Mail → Chat local draft bridge.

## Teams, chats and people — later

- [ ] Paginate beyond the newest 50 chats; extend Shared Media beyond loaded history.
- [ ] Explicit Mark unread for chats, without immediately marking the same selection read again.
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

## Calendar, Files and calls — future milestones

- [ ] Calendar: reconcile invitations, updates and RSVP state across Mail/Teams/calendar. Show confirmed response with Change response; only prompt again when the latest update requires it. Unread mail is not an unanswered invitation. Avoid duplicate attention alerts.
- [ ] Files: lightweight OneDrive browser and shared discovery across communication sources.
- [ ] Calls: research supported native integration and permissions before defining scope.
- [ ] Decide whether Activity adds useful signal before implementing a feed.

## Polish and validation

- [ ] Styled rail tooltips for hover/focus and an optional persistent navigation-label preference.
- [ ] Consistent context menus while preserving useful native text/copy/writing tools.
- [ ] Additional syntax languages as needed.
- [ ] Investigate soft attachment previews separately from original uploaded bytes.
- [ ] Recheck the reported macOS beachball; profile if it recurs.
- [ ] Targeted manual edge cases: leave group; private/shared/cross-tenant membership; away-reply recovery. Basic presence/membership/away milestone was user-validated.
- [ ] Manual Mail away replies: one reply per coworker across chat/mail, thread association, automated-mail suppression. Mail.Send consent is confirmed; this specific test remains outstanding.
- [ ] Further signature rendering polish and chat-to-email edge cases; basic signature sending and received quote were user-validated, as were attachments and inline image sending.
- [ ] Manual Mail edge cases: government-tenant policy, long pagination, forwarded original attachment fidelity. New mail sending, replies, draft restart and PDF save were user-validated.
- [ ] Native macOS notification click routing and OS appearance/contrast changes. Banner delivery was user-validated; automated theme/contrast coverage passes.
- [ ] Remaining formatted-message round-trip edge cases in channels and quoted replies; long PHP send and IDE copy were user-validated.
- [ ] Optional accent-matched Dock icon, later.
- [ ] Looping feature showcase after core workflows settle.
- [ ] Installable alpha packaging is deferred until the prospective tester has her MacBook.
