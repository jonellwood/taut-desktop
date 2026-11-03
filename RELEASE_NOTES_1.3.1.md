# TAUT Desktop Alpha 1.3.1

- Drafts are scoped by Graph chat ID. Switching conversations restores that chat’s draft and prevents leaking input into another recipient. Drafts are in memory only; restart clears them.
- A send only clears the submitted draft when its content has not changed during the request.
- Rename Jump to latest to **Snap to Now**.
- Empty HTML-only image/attachment messages show a clear placeholder. Authenticated media retrieval remains a separate feature.
- Unread state is shown only if Graph returns both a last-message timestamp and the user's last-read timestamp, and the last message is not their own. Missing data does not imply unread.

No Rust, Entra permissions, or dependencies changed.
