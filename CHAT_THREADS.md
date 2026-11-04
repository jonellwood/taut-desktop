# Chat reply context

Chats now offer the same side-pane reading pattern as channel threads, using Microsoft Graph's explicit `messageReference` attachment relationships. Chat replies are quoted messages in a chronological chat, rather than channel-style server thread collections. No extra OAuth scopes or new send/write operations are added.

## Reading

A quoted chat message has a quote-context button. An original message with quoted replies in loaded history has a reply-count action. Either opens the reply pane. Nested quotes are followed as descendants with cycle protection; unrelated messages stay out of the pane. A reply quoting multiple originals can appear in each relevant context.

The main chat timeline stays chronological and keeps all messages visible. Existing unread/read synchronization and the normal composer behavior remain intact. The pane displays only replies in loaded chat history, with that limitation clearly labeled; chat-list/history pagination remains separate backlog work. Forwarded messages, malformed references, conflicting attachment IDs, cross-conversation references and text-only guesses never fabricate a thread. Older inline quote formats without explicit message-reference metadata are not inferred.

If the original message is outside loaded history, an explicit context click retrieves it with `GET /chats/{chat-id}/messages/{message-id}`. Rust validates/encodes identifiers, checks the returned identity, performs no write and does not change read state. An unavailable original shows an error/retry action; stored message-preview snapshots are never displayed as current content. Deleted messages are masked, including attachments, images and reactions.

The pane supports shared-file opening, explicitly requested images through the existing image viewer, and reaction display. Editing, deleting and reacting remain available through the main chat timeline. Sending a new quoted reply directly from the pane is a separate follow-up; the normal composer continues sending ordinary chat messages. Per-conversation drafts and staged files are preserved.

The details/focus controls hide and restore the pane. Close/Escape returns to conversation details. Chat selection, account changes and sign-out invalidate pending parent reads. Channel navigation preserves the chat draft; no credentials reach Svelte or logs.

## Validation

Mocked tests cover reference parsing, multi-reference bounds, malformed/forwarded/cross-chat inputs, descendants/cycles, deleted parents, unavailable parents, older-parent read races, relationship-only synchronization, images/files/reactions, drafts and layout. Native tests verify GET-only behavior, escaped IDs, identity checks and no retry on failure. Automated tests never create chats, send messages, upload files or otherwise mutate real Microsoft 365 data.

Message HTML is parsed in inert templates when extracting text/image identifiers, so extraction itself cannot auto-load remote image resources. Image bytes still require an explicit user action and the existing Rust Graph boundary.

## References

- [Graph messaging overview: message attachments](https://learn.microsoft.com/en-us/graph/teams-messaging-overview#message-attachment)
- [ChatMessage: replyToId is channel-specific](https://learn.microsoft.com/en-us/graph/api/resources/chatmessage?view=graph-rest-1.0)
- [Get a chat message](https://learn.microsoft.com/en-us/graph/api/chatmessage-get?view=graph-rest-1.0)
