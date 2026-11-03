# Message deletion and personal chat visibility

## Permission proposal

TAUT needs **delegated `Chat.ReadWrite`** for message soft deletion/restoration and hiding/unhiding a chat for the signed-in user. This permission allows broader chat changes on the user's behalf; TAUT exposes only the explicit operations described here. Existing read, send, create, attachment, and membership scopes stay as currently configured. The user approved adding this scope on 2026-11-03 under AGENTS.md; it is now requested in Rust. Entra consent and a fresh sign-in are then required; admin consent alone does not update an existing access token.

No application permissions or `Chat.ManageDeletion.All` are requested. Shared-thread deletion is deferred: it requires administrative permissions and a supported administrative role. The user delegated this product choice, and this release uses **Hide for me** to preserve shared history.

## Behavior

- Own normal messages offer Delete; deleted own messages offer Restore. Both require explicit confirmation. Rust independently reads the signed-in identity and selected message, verifies ownership and message type, and checks the current deletion state before writing. Other people's messages and system events have no deletion control.
- A confirmed deletion replaces the contents with a quiet deleted-message marker and removes attachment/image previews. A confirmed restore reloads authoritative content. Tenant policy may prevent either action.
- Hide for me affects only the signed-in user's chat list. It does not delete shared history, remove membership, or delete files. Hidden chats are available from the sidebar and can be explicitly unhidden. New activity may make a hidden chat visible again.
- Text and attachment drafts remain in memory when hiding. Sending to a hidden chat is disabled until it is unhidden. Signing out clears session drafts as before.
- Deleting an attachment message does not delete uploaded OneDrive files. Microsoft 365 retention policies still apply.
- Failed or ambiguous writes retain the dialog and do not silently update the UI or retry. Check status performs reads; a second write requires another explicit confirmation. Graph may briefly report stale state, so check official Teams before retrying an uncertain operation.

## Graph operations

- Read identity: `GET /me?$select=id`.
- Verify message: `GET /chats/{chatId}/messages/{messageId}`.
- Delete/restore: `POST /users/{ownId}/chats/{chatId}/messages/{messageId}/softDelete` or `/undoSoftDelete`, no body and explicit `Content-Length: 0`; only HTTP 204 confirms success.
- Verify chat: `GET /chats/{chatId}?$select=id,chatType`.
- Hide/unhide: `POST /chats/{chatId}/hideForUser` or `/unhideForUser`, with only the signed-in user's `{user:{id,tenantId}}`; HTTP 204 confirms success.
- Check visibility: paginated `GET /me/chats?$top=50&$select=id,viewpoint`, bounded to ten pages and same-origin Graph list continuations. `viewpoint.isHidden` is available on chat lists.

Sources: [softDelete](https://learn.microsoft.com/en-us/graph/api/chatmessage-softdelete?view=graph-rest-1.0), [undoSoftDelete](https://learn.microsoft.com/en-us/graph/api/chatmessage-undosoftdelete?view=graph-rest-1.0), [hideForUser](https://learn.microsoft.com/en-us/graph/api/chat-hideforuser?view=graph-rest-1.0), [unhideForUser](https://learn.microsoft.com/en-us/graph/api/chat-unhideforuser?view=graph-rest-1.0), [chatViewpoint](https://learn.microsoft.com/en-us/graph/api/resources/chatviewpoint?view=graph-rest-1.0), [administrative shared-chat deletion](https://learn.microsoft.com/en-us/graph/api/chat-delete?view=graph-rest-1.0).

## Verification

Automated tests inject mock Graph HTTP responses in Rust and mock native IPC in Chromium/WebKit. External browser requests are blocked. No real chats, messages, files, membership, or tenant data are mutated by these checks. The user manually confirmed successful message deletion/restoration and hide/unhide with the unsent draft preserved on 2026-11-03. These manual checks are separate from automated testing.

HTTP 411 is a request-framing error, not evidence of tenant policy restrictions. Empty action POSTs explicitly send `Content-Length: 0`; request-builder regression checks cover both deletion and restoration while preserving JSON action payloads.
