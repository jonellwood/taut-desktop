# TAUT Desktop Alpha 1.4.2

- Opens known Microsoft 365 attachment URLs in the system browser using Tauri opener.
- Shows actionable errors for rejected/unavailable links; attachment availability still depends on Graph links and Microsoft permissions.
- Tries participant display name, email, then user principal name for legacy chats.
- Adds participant lookup diagnostics for unnamed chats in the details panel, with a unavailable-participant fallback when records exist without names.

Requires `npm install` for the Tauri opener JavaScript plugin and a Rust rebuild for `tauri-plugin-opener`.

No extra Microsoft Graph scopes.
