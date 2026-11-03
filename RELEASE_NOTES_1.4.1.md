# TAUT Alpha 1.4.1 — Images, dates & legacy conversations

- Inline image preview with full-viewport lightbox, zoom and Esc.
- Local-date separators between messages, using source timestamps.
- Attempts to resolve unnamed conversations via Graph chat members when needed (up to 12 per synchronization). Missing participants remain safely unnamed.
- Existing file-reference cards preserved. Opening still depends on access to the underlying SharePoint/OneDrive file.
- No additional Entra permissions: Chat.Read covers chat members.

Note: native compilation and live Graph behavior require testing on macOS.
