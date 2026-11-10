# Shared Media

Conversation details indexes images, reference attachments and web links from the selected chat's loaded messages. Tabs show counts, with twelve items initially and Show more. Deleted messages and system activity are excluded; code blocks and inline code do not contribute links. Repeated file/link URLs are deduplicated, and links already listed as files are omitted from Links.

Opening this panel makes no Graph request. Selecting an image uses the existing Rust hosted-content reader and image viewer, with conversation/session checks before displaying the result. Files retain the existing Microsoft-host URL policy. Web links accept only HTTP(S) without embedded credentials and open through the native opener on explicit click. No tokens, remote image auto-loading, new scopes, uploads or writes are involved.

This is a loaded-history view, not a complete conversation file archive. Loading older chat messages expands the available collection. It currently covers chats, including groups; channel media browsing remains future work.

Signed-out startup and sign-out show the welcome screen with Connect Microsoft 365 and no sample conversations. Authenticated startup still selects no conversation automatically.
