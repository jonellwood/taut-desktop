# Received message reactions

TAUT displays the `reactions` array already returned with Graph chat messages. No new Graph permissions are needed; explicit reaction changes use the existing delegated Chat.ReadWrite grant.

- Compact chips group reaction types and show counts. Click a chip, or focus it and press Enter/Space, to expand who reacted. Your own entry is labeled You and highlighted.
- Legacy reaction names and matching standard Unicode forms are grouped, including presentation/skin-tone variants of the same emoji. Duplicate records for the same identified user/type do not inflate counts. Different tenant identities remain distinct.
- Names come from Graph's reaction data, existing member/message identity caches, or the existing bounded read-only basic-directory lookup. Missing/unsupported identities show Participant unavailable; raw directory IDs are not displayed.
- Custom reactions show a text label and neutral symbol. Their hosted images are not fetched. Unknown types also retain their counts with a neutral fallback.
- Polling and Refresh update additions/removals, counts and names. Reaction-only changes do not become new messages, alter sidebar previews, lose drafts, or create unread indicators/notifications.
- Deleted messages and system notices do not render reaction chips. Deleting a message clears cached reaction data with its content.
- Clicking a chip expands participant details. A separate Add reaction button opens the picker; Remove mine inside the details removes only the signed-in user's matching reaction. Custom/unsupported reactions remain display-only.
- The searchable picker contains 64 standard Unicode emoji across Common, Faces, People, Symbols, and Objects. Rust and Svelte share this bundled catalog. Selecting a reaction is the explicit write action; opening/searching/cancelling makes no reaction change.
- Rust checks permission, message identity/type/deletion state, and the signed-in user's actual reactions before POSTing setReaction or unsetReaction with `{reactionType: Unicode}`. Legacy Graph types such as like map to Unicode for removal; skin-tone variants keep their original value when removed. Only HTTP 204 confirms success.
- Already-set or already-absent reactions produce no duplicate write. Other people's reactions cannot be unset by selecting a target user. Choosing another emoji delegates the resulting reaction state to Graph; TAUT does not silently remove other reactions first.
- Unconfirmed changes keep the picker open and block further writes, including after closing/reopening. Refresh reaction status performs reads; another change needs an explicit emoji choice/removal. There are no automatic mutation retries.
- In the composer, the same picker inserts emoji at the saved caret or replaces selected text, updates only that conversation's draft, and restores the caret/focus. Inserting emoji never creates a chat, uploads a file, or sends a message. Normal explicit Send is still required.
- The user manually confirmed received-reaction changes syncing from Teams within about 15-20 seconds on 2026-11-03. The user subsequently confirmed adding/removing reactions and composer emoji insertion all perform as expected (2026-11-03).

Automated Node and Chromium/WebKit tests use fake message data and native IPC. All external browser requests are blocked; no actual Microsoft 365 writes or custom-image downloads occur.

Source: [Microsoft Graph chatMessageReaction](https://learn.microsoft.com/en-us/graph/api/resources/chatmessagereaction?view=graph-rest-1.0).

Write API sources: [setReaction](https://learn.microsoft.com/en-us/graph/api/chatmessage-setreaction?view=graph-rest-1.0), [unsetReaction](https://learn.microsoft.com/en-us/graph/api/chatmessage-unsetreaction?view=graph-rest-1.0).
