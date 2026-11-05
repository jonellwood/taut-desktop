# Attachment sending

## Behavior

The paperclip opens the system file chooser through the webview file input. Files
are staged in memory per conversation. Selection, preview, removal, navigation,
and synchronization do not upload files, grant access, or create conversations.
Small PNG/JPEG/GIF/WebP files have local previews. Other files show their name and
size. Version one allows five nonempty files per message, 10 MiB per file and
25 MiB total. Files can also be dropped onto the main chat composer, and raster images can be pasted into its message input.

Explicit Send validates permission before creating a pending conversation. New
conversations still require nonempty text; existing conversations accept files
without text. Rust verifies current members, uploads a distinct copy of each file
to the signed-in user's OneDrive root, grants verified members read access without
email invitations, and sends one Teams message with reference attachments. Stored
filenames have a random `TAUT-…-` prefix and an ASCII-safe filename suffix to
avoid macOS Unicode/whitespace normalization mismatches; attachment cards retain
the original name.
This avoids overwriting an existing named document. Upload/share HTTP work runs on
blocking worker threads rather than the macOS UI thread.

File access follows OneDrive's existing inherited permissions as well as the
explicit read grants; TAUT does not create anonymous or organization-wide links or
remove inherited access. Large/paginated membership lists and members without a
verified Entra user ID are rejected before upload in this version. New members do
not automatically receive access to previously shared files.

## Permission — user approved 2026-11-03

The user explicitly approved adding **delegated `Files.ReadWrite`** to the Rust OAuth scope list on 2026-11-03; it is now requested. Microsoft documents
this as the least-privileged delegated permission for both file upload and
`driveItem: invite`. Sending a Teams reference message continues to use the
existing `ChatMessage.Send` permission. No `Files.ReadWrite.All`,
`Sites.ReadWrite.All`, or application permissions are proposed.

The consent grants the app the ability to read, create, update, and delete the
signed-in user's files, even though this implementation only creates new upload
copies, verifies their metadata, and grants read access. The OAuth permission is
broader than the files selected in TAUT; there is no claim of a per-file OAuth
restriction. The implementation contains no file-deletion operation.

Local staging is available without a file grant, but a missing file grant blocks
Send before chat creation or upload. Only a Boolean
permission result reaches Svelte; tokens and granted-scope handling remain in Rust.
Add the delegated permission to the Entra app registration as required by tenant
policy, grant consent as needed, and sign out/in to obtain a fresh grant. Code cannot grant tenant consent itself.

## Failure recovery

Upload, access grants, and message delivery are separate, non-atomic operations.
Rust keeps a session-only record bound to file identity, bytes, conversation, and
verified recipients. An explicit retry reuses a confirmed upload; an uncertain
upload is looked up at its preallocated random destination before uploading again.
Incomplete or mismatched upload metadata is re-read by item ID before rejection.
Persistent name, size, or file-type mismatches stop sharing/sending with a specific
error. Explicit retry re-reads rejected metadata without repeating the upload.
Sharing failures retain the upload record; partial sharing responses do not mark a
file ready. No message is sent until every attachment is prepared. Text is HTML
escaped before adding the Graph attachment placeholders.

An uncertain message result retains both text and files and requires checking
Teams before explicit retry. TAUT does not automatically retry writes. Changed
membership blocks reuse rather than silently sharing the same uploaded copy with
a different recipient list. Removing a draft file does not revoke access or delete
an already uploaded copy. Uploaded/shared files can remain after failed Send.
Signing out or quitting discards local recovery records and drafts, not remote
files; check OneDrive/Teams before starting a replacement send in a new session.

## Verification

Node tests validate file constraints and first-message ordering. Rust tests mock
all Graph requests and exercise permission guards, upload recovery, partial
sharing, membership changes, reference payload escaping, and uncertain delivery.
Playwright runs the real Svelte app in Chromium and WebKit with mocked IPC and
blocked external browser requests. Tests never access the actual Office 365 tenant.
The user confirmed tenant consent and successful manual attachment sending on
2026-11-03. No live upload/send has been performed by automation. The user reported
a slightly soft image appearance; the upload path sends original selected bytes
without resizing, so preview/rendering quality remains a low-priority investigation.

## Microsoft references

- [Upload file contents](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0)
- [Grant file access with invite](https://learn.microsoft.com/en-us/graph/api/driveitem-invite?view=graph-rest-1.0)
- [Reference attachment example](https://learn.microsoft.com/en-us/graph/api/chatmessage-post?view=graph-rest-1.0#example-4-file-attachments)
- [Send a chat message](https://learn.microsoft.com/en-us/graph/api/chat-post-messages?view=graph-rest-1.0)
- [Files.ReadWrite permission](https://learn.microsoft.com/en-us/graph/permissions-reference#filesreadwrite)

## Clipboard images and file drops — 2026-11-05

The main chat composer accepts user-triggered PNG/JPEG/GIF/WebP clipboard image paste and file drops. This includes pending individual/group drafts and existing chats. Pasted images receive a unique OneDrive-safe filename; original bytes and MIME type are retained without resizing or recompression. Paste reads only the ClipboardEvent supplied by the user action, never an async clipboard read or polling. Text/code paste stays under normal textarea behavior, and HTML/remote image URLs are never fetched or turned into attachments.

File drops show an amber composer overlay that does not shift the layout. Dropping elsewhere in the window is prevented from navigating the webview and displays a notice directing the user to the main composer. Folder drops are rejected, as are empty files, invalid names, excess counts and oversized batches. A rejected batch leaves previously staged files intact. The paperclip, paste and drop paths share the same validation and local staging function. Upload consent is checked at Send, so staging remains available without Files.ReadWrite consent.

Staging captures the original chat and account session before creating previews. Navigating during preview work retains the files with that original draft. Busy/signed-out/hidden/unselected destinations reject ingestion, and stale account-session work cannot restore cleared attachments. Global event handlers are removed when the app component unmounts. Attachment errors from outside the composer use the existing global status area; validation failures during active staging stay beside the draft.

This pass adds attachment ingestion to the main chat composer only. Quoted replies and channel posts/replies keep their existing text-only attachment behavior. No new Graph scope, native filesystem read permission or clipboard permission is added. Tauri's native drag/drop interception is disabled in window configuration so DOM file-drop handling can receive user-selected files; this does not grant access to arbitrary paths. Reference: https://v2.tauri.app/reference/config/#windowconfig

Manual macOS acceptance after rebuilding:
- Copy a screenshot to the clipboard and paste into Message. Confirm the local thumbnail and removal work before Send.
- Drop a Finder file onto the composer. Confirm the amber cue, existing attachment limits and preserved text.
- Stage files in two different chats and return to each; verify they remain separate.
- In a new conversation, attachment-only Send remains disabled until first-message text is entered. Sending remains an explicit tenant mutation performed by the user.

Automated coverage uses synthetic clipboard/drag events with actual File/DataTransfer objects and mocked Graph/clipboard boundaries. It cannot establish Finder/WKWebView or system screenshot-clipboard integration; those require the manual macOS checks above.

Verification: full Chromium/WebKit suite 356 passed; Node tests 67 passed; Rust tests 118 passed. UI TypeScript, Svelte/Vite build, cargo check and git diff --check passed. Three pre-existing Svelte accessibility warnings remain. Browser events, Graph calls and clipboard content were mocked; no real Microsoft 365 data or system clipboard was changed.

Manual acceptance — 2026-11-05: user confirms both clipboard images and drag-and-drop work perfectly in the native app after rebuilding.
