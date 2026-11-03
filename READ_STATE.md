# Teams read-state synchronization

The earlier unread implementation was local-only: opening a chat cleared a session watermark without writing Teams' read position. That masked external Mark unread changes until restarting. It also excluded own-message previews, which incorrectly hid manually marked-unread groups or 1:1 chats whose latest message was sent by the current user.

## Current behavior

- Startup leaves **no conversation selected** and does not mark any chat read. The badge counts unread conversations, not unread messages.
- Graph's `viewpoint.lastMessageReadDateTime` is authoritative. No session watermark overrides it. A normal latest message after this position is unread even if it was sent by the current user; system activity and reaction-only edits do not generate unread alerts.
- Explicit sidebar selection authorizes read synchronization once the focused, visible chat is at the bottom and its latest message has loaded. Background/minimized windows, overlays, hidden/pending chats, and directory-picker selection do not mark anything read.
- Rust verifies the signed-in identity and fetches the latest message by creation date before `POST /chats/{id}/markChatReadForUser`. The body contains only `{user:{id,tenantId}}` for the signed-in user. The existing delegated `Chat.ReadWrite` grant is required. Only HTTP 204 confirms the change.
- The operation marks the **whole conversation** through Graph's current latest position. Graph offers no read cutoff parameter or atomic compare-and-set. Preflight verifies the latest message matches what TAUT displayed; an arrival between preflight and POST remains a small API-level race.
- Failed or unconfirmed changes keep the unread indicator, show an error, and do not repeat silently. Refresh or reselect explicitly enables another attempt. A newer displayed message can trigger a new read operation while the selected chat is in view.
- After confirmation TAUT refreshes the chat list. Graph/Teams propagation may briefly lag; subsequent server state wins rather than being masked by a permanent local override.
- Manual Refresh fetches the whole chat list and the selected chat. The existing automatic list interval remains 30 seconds while visible; active messages refresh every 5 seconds. It does not mark unrelated chats read.
- Explicit Mark unread controls are on the todo list. This release imports those changes from Teams, including backwards read-position changes.

## Testing

Rust request tests and Chromium/WebKit tests use mocked Graph only. No real tenant read positions, messages, files, chats, or membership are changed during automated testing. Persistent-auth restoration and sign-out cleanup were separately confirmed by the user manually.

Sources: [markChatReadForUser](https://learn.microsoft.com/en-us/graph/api/chat-markchatreadforuser?view=graph-rest-1.0), [markChatUnreadForUser](https://learn.microsoft.com/en-us/graph/api/chat-markchatunreadforuser?view=graph-rest-1.0), [chat-list read positions](https://learn.microsoft.com/en-us/graph/api/chat-list?view=graph-rest-1.0), [message ordering](https://learn.microsoft.com/en-us/graph/api/chat-list-messages?view=graph-rest-1.0).

The user manually confirmed bidirectional read-state updates between TAUT and Teams, with an acceptable propagation delay (2026-11-03).
