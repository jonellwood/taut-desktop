# Attachment sending

## Behavior

The paperclip opens the system file chooser through the webview file input. Files
are staged in memory per conversation. Selection, preview, removal, navigation,
and synchronization do not upload files, grant access, or create conversations.
Small PNG/JPEG/GIF/WebP files have local previews. Other files show their name and
size. Version one allows five nonempty files per message, 10 MiB per file and
25 MiB total. Drag/drop and clipboard pasting remain future work.

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
