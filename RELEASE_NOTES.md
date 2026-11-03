# TAUT Desktop Alpha 1.2

- Rust-backed **send plain-text chat message** command using delegated `ChatMessage.Send`.
- No optimistic success: only Graph `201 Created` counts as sent.
- Composer remains disabled during send; errors preserve the draft.
- Refresh button on the chat header fetches selected conversation messages.
- Changed OAuth scopes to request `ChatMessage.Send`; **sign out and sign in again** to get a new token with the permission.
- Mock mode remains functional.

## Limitations
- No background notifications, incoming updates, reactions, media, pagination, or delivery/read receipt tracking.
- Message list fetches up to 50, and existing rich message bodies render as plain text.
- This has not been compiled on macOS here; test with a low-risk conversation first.
- Network failure may mean Graph received a message despite the client not receiving confirmation. Check official Teams before retrying.
