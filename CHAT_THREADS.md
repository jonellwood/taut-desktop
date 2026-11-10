# Chat reply context

Chats now offer the same side-pane reading pattern as channel threads, using Microsoft Graph's explicit `messageReference` attachment relationships. Chat replies are quoted messages in a chronological chat, rather than channel-style server thread collections. Reading context remains read-only. Quoted sending uses the existing delegated ChatMessage.Send scope; no extra OAuth scopes are added.

## Reading

A quoted chat message has a quote-context button. An original message with quoted replies in loaded history has a reply-count action. Either opens the reply pane. Nested quotes are followed as descendants with cycle protection; unrelated messages stay out of the pane. A reply quoting multiple originals can appear in each relevant context.

The main chat timeline stays chronological. Quoted replies appear as compact “You/[sender] replied to a message” entries with a View thread action; their full text/media remain in the reply pane. Deleted replies retain their deleted-message marker and existing message actions remain available. Opening a loaded original aligns it near the top of the main chat viewport. Existing unread/read synchronization and the normal composer behavior remain intact. The pane displays only replies in loaded chat history, with that limitation clearly labeled; chat-list/history pagination remains separate backlog work. Forwarded messages, malformed references, conflicting attachment IDs, cross-conversation references and text-only guesses never fabricate a thread. Older inline quote formats without explicit message-reference metadata are not inferred.

If the original message is outside loaded history, an explicit context click retrieves it with `GET /chats/{chat-id}/messages/{message-id}`. Rust validates/encodes identifiers, checks the returned identity, performs no write and does not change read state. An unavailable original shows an error/retry action; stored message-preview snapshots are never displayed as current content. Deleted messages are masked, including attachments, images and reactions.

The pane supports shared-file opening, explicitly requested images through the existing image viewer, and reaction display. Editing, deleting and reacting remain available through the main chat timeline. The pane also has its own plain-text reply composer; the normal composer continues sending ordinary chat messages. Per-conversation drafts and staged files are preserved.

The details/focus controls hide and restore the pane. Close/Escape returns to conversation details. Chat selection, account changes and sign-out invalidate pending parent reads. Channel navigation preserves the chat draft; no credentials reach Svelte or logs.

## Validation

Mocked tests cover reference parsing, multi-reference bounds, malformed/forwarded/cross-chat inputs, descendants/cycles, deleted parents, unavailable parents, older-parent read races, relationship-only synchronization, images/files/reactions, drafts and layout. Native tests verify GET-only behavior, escaped IDs, identity checks and no retry on failure. Automated tests never create chats, send messages, upload files or otherwise mutate real Microsoft 365 data.

Message HTML is parsed in inert templates when extracting text/image identifiers, so extraction itself cannot auto-load remote image resources. Image bytes still require an explicit user action and the existing Rust Graph boundary.

## References

- [Graph messaging overview: message attachments](https://learn.microsoft.com/en-us/graph/teams-messaging-overview#message-attachment)
- [ChatMessage: replyToId is channel-specific](https://learn.microsoft.com/en-us/graph/api/resources/chatmessage?view=graph-rest-1.0)
- [Get a chat message](https://learn.microsoft.com/en-us/graph/api/chatmessage-get?view=graph-rest-1.0)

## Sending quoted chat replies

Choose **Reply** beside a chat message, write in **Reply with quote**, then explicitly choose **Send quoted reply**. This uses Graph v1.0 POST /chats/{chat-id}/messages/replyWithQuote with one messageIds entry and a plain-text replyMessage body. Channel posting is separate and remains deferred.

Reply drafts are kept in memory per account, chat and original-message identity, separately from normal chat drafts and staged attachments. Closing/reopening the pane or navigating chats preserves them; sign-out/account changes clear them. This first composer supports text up to 4000 characters. Use the normal chat composer for attachments.

Rust checks actual token permission, current account and the current original message before POST. Invalid/pending targets, blank/oversized text and deleted originals cannot send. A single explicit Send issues at most one POST; delivery is confirmed only by a 201 response containing a valid new message ID and consistent chat/sender identities where present. A confirmed send clears only its captured reply draft. Navigation while sending cannot redirect delivery.

Preflight failures and explicit HTTP rejections retain the draft. Network errors, timeout, server errors and incomplete success responses are treated as uncertain delivery, with no automatic retry. The pane retains its draft and disables Send even when closed/reopened. Refresh only reads messages. After checking Teams, **I checked Teams — enable retry** permits a subsequent explicit Send; that acknowledgement itself never sends.

Validation includes mocked native POST routing/payload, permission/account/deleted-parent guards and ambiguous delivery with no retries; browser tests cover separate drafts, confirmed sending, uncertainty/acknowledgement and navigation during an in-flight send. No real Microsoft 365 write was exercised.

Manual check after rebuilding: quote an existing test-chat message, send a short reply, and verify the quote in official Teams; keep a normal chat draft open to confirm it stays intact.

- [Graph replyWithQuote](https://learn.microsoft.com/en-us/graph/api/chatmessage-replywithquote?view=graph-rest-1.0)
