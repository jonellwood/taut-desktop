# Mail and unified discovery

## First release: optional, read-only Mail preview

Add an optional Mail destination using the existing Microsoft 365 sign-in. It shows Inbox and Sent mail, paginated message summaries, a conversation reader, explicit attachment viewing/downloading, and mailbox search. Keep source labels and Open in Outlook links. Mail access begins only after opening Mail; existing chat use remains functional without mailbox consent. Selecting a message does not mark it read or change Microsoft 365 data in this first release.

Reuse TAUT themes, layout conventions, safe link handling and Rust-only token storage. Email bodies must be safely parsed/sanitized; no executable HTML, remote images, tracking pixels or automatic attachment downloads. Prefer a readable text representation initially with a clear fallback for unsupported content. Handle paging, stale responses, account changes, large attachments, permission failures, throttling and retries without wiping the current selection. Show whether history/search is partial. Search covers the signed-in user's own mailbox, not shared/delegated mailboxes.

## Permission proposal — approved 2026-11-05

Add only Microsoft Graph **delegated `Mail.Read`** for this release. This permits reading the signed-in user's email, including bodies and attachments, and mailbox search. `Mail.ReadBasic` is insufficient because it excludes bodies and attachments. This is sensitive mailbox access even though TAUT will only fetch content on explicit Mail use.

No application permissions, Mail.ReadWrite, Mail.Send, shared-mailbox permissions or mailbox-settings permissions are requested. Adding the scope to TAUT requires explicit user approval under AGENTS.md, Entra delegated permission/admin consent as applicable, and a fresh sign-in. Existing saved sessions lacking the scope should show a reconnect explanation without disrupting chats. The user explicitly approved delegated Mail.Read on 2026-11-05.

## Later milestones, separately scoped

1. Unified search across mail and chats/channels using distinct providers, source badges, sender/date filters and honest coverage labels. Teams server search API availability/permissions must be verified separately; current Teams search documentation uses beta examples. Do not claim current loaded-history search covers all tenant history.
2. Unified file discovery: retain source message IDs and links; email file attachments and OneDrive/SharePoint references are different storage models. Do not upload or copy files just to index them or merge unrelated files by filename.
3. Mail composing/replies and chat-to-mail/mail-to-chat drafts: explicit recipients, source attribution and quote/attachment review before Send. Mail.ReadWrite is needed for mailbox draft/read-state/organization changes; Mail.Send is separate for sending. Require a new documented scope proposal and approval before implementing those permissions. No automatic cross-posting.

## Validation

Mock Graph/IPC only. Verify no mailbox or Teams mutations on navigation, search, reading or attachment fetch. Unit tests for validated IDs, pagination routes, query encoding and permission guards; browser tests for navigation, selection, safe content, empty/error states, paging/search, account transitions, themes and retained chat drafts. Never launch the real signed-in app in automated tests.

## Microsoft references

- https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/search-concept-messages
- https://learn.microsoft.com/en-us/graph/permissions-reference#mailread
- https://learn.microsoft.com/en-us/graph/api/message-update?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0

## Implementation notes — 2026-11-05

- Mail.Read added after explicit approval. Refresh-token exchanges omit new scope requests, retaining their original grant; interactive sign-in is the path to new consent.
- First version uses GET `/me/messages?$search=…` for mailbox search and GET per-folder lists/conversation filters/details/attachment collections. Native code restricts continuation hosts, paths and query predicates. Search is the mailbox provider only; it does not yet merge chat/channel results.
- Conversations show 25 summaries per page and expand bodies individually. The reader requests Graph text bodies and safely extracts text from an inert template if Graph supplies HTML anyway. Long previews are bounded and identified; remote images/active content are not rendered.
- Metadata is separate from attachment contents. Explicit Preview supports raster images and text; explicit Save uses a native macOS save dialog, preserves bytes, and never executes the file. File previews/downloads are limited to 10 MB; reference/item attachments and unsupported presentations can be opened in Outlook. Save dialog cancellation is reported without repeating the action.
- Mail fetches begin only upon entering Mail. This version refreshes on request. Selecting messages does not change isRead; sending, mailbox organization, mailbox drafts and automatic mail notifications are not implemented.
- Session/account changes destroy the reader and discard its in-memory content; stale requests cannot populate the new workspace. Existing chat drafts are preserved when moving between destinations.

Automated validation: 143 Rust tests, 72 Node tests and all 400 Chromium/WebKit browser tests passed; production build and UI TypeScript check passed with the three existing App.svelte accessibility warnings. Mail screenshots reviewed in the browser. Native save-dialog and tenant behavior await the user's manual test; no real Microsoft 365 mutations or native app launch during automated checks.

## Unified discovery first pass
The workspace toolbar now opens Search chats and mail, also available through the Command Palette. Explicit search combines local loaded chat message text, attachment names and conversation names with the Mail.Read mailbox search provider. Results are source-labeled; mailbox paging and errors are independent of chat results. Hidden and pending chats and deleted/system messages are excluded. Chats are limited to 100 loaded-history matches, not server-wide Teams history; channels and sender/date filters remain future work. No new scopes, search persistence, attachment downloads or mailbox writes. Opening a chat result does not mark it read.

## Rendered HTML email — 2026-11-09
Graph reads now request HTML bodies using the existing Mail.Read permission. MailBody defaults to HTML for HTML messages with a per-message Plain text toggle; the default is now configurable in Preferences → Mail. Text messages keep the existing view. The renderer parses an inert template, reconstructs an allowlisted HTML tree (tables, headings, lists, quotes, code, emphasis), strips active elements and resource attributes, bounds size/depth/node count, and copies only bounded semantic attributes and a small fixed set of safe formatting values. Sender fonts and arbitrary sizing are discarded. Valid literal inline/legacy text, background and border colors are preserved; resource URLs, CSS variables and arbitrary CSS remain blocked.

Sanitized output is displayed in a sandboxed srcdoc iframe with no sandbox allowances, no scripts and a restrictive CSP (default-src none, no base/form destinations). No changes to application CSP or native capabilities. Remote/data/CID images remain placeholders; inline files can be previewed/saved through existing explicit attachment controls. Numbered HTTP(S) links appear in a separate list with their full destination and require review plus explicit Open link before the existing native opener runs. Email does not navigate the frame. Formatted messages scroll within their bounded frame. Plain text and Open in Outlook remain available for unsupported presentation; native WKWebView validation is still manual.

References: https://learn.microsoft.com/en-us/graph/api/message-get?view=graph-rest-1.0 and https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe

## Approved and implemented Mail away replies — 2026-11-09

Add delegated `Mail.Send` so the existing opt-in away period can also reply to newly received internal coworker email while TAUT runs. Microsoft Graph's message reply API requires Mail.Send: https://learn.microsoft.com/en-us/graph/api/message-reply?view=graph-rest-1.0 . This permission permits sending mail as the signed-in user; no Mail.ReadWrite, shared-mailbox or application permission is proposed. The user explicitly approved delegated Mail.Send on 2026-11-09; it is now in requested OAuth scopes. Entra consent and a fresh sign-in are required before enabling the Mail destination.

Mail will be a separate, off-by-default destination in Away replies, using the same message/schedule and durable once-per-coworker ledger across enabled destinations. Only newly observed Inbox mail addressed directly to the signed-in user, from a resolved internal user, qualifies. Skip automated/list/notification messages and suppression headers, self-mail, historical catch-up and ambiguous senders; never reply-all. Reserve durably before sending and never retry an uncertain send. This does not configure Exchange/Outlook automatic replies and works only while TAUT is running. Automated checks use mocked requests exclusively.

Mail monitoring shares the existing 30-second native worker and reads at most the newest 50 Inbox summaries per cycle, then only recent qualifying details. It does not replay missed mail after startup, sleep or a monitoring error. Directory resolution must match a non-guest internal user and exact mailbox/UPN address; aliases that cannot be resolved safely are skipped. A validated original Internet message ID keeps replies associated with the source. MIME replies use UTF-8/base64, single-recipient addressing, encoded/folded subjects, Auto-Submitted: auto-replied and X-Auto-Response-Suppress: All. HTTP 202 is recorded as accepted, not proof of delivery. Existing ledger/storage/rate limits and account/generation guards apply to Mail too. Outlook automatic replies are independent; avoid enabling both responders for the same purpose.

Reading controls now show a filled accent on the selected HTML/Plain text option. Preferences → Mail saves the default locally, separately from any message's temporary override. This requires no Graph permission.

### Mail readability and thread clarity
Expanded mail checks attachment metadata (including inline-only files) and displays controls only for available files. Preview/Save remain explicit; opening mail does not fetch attachment bytes or remote images. Inbox/Sent filter the conversation list; opening a thread includes both directions, labeled using the signed-in mail/UPN addresses. Unknown account identity is left unlabeled.

HTML colors are checked against their inherited/composited background. Readable sender colors remain; low-contrast text receives a black/white fallback plus progressive CSS `contrast-color()` support. Nested white backgrounds retain dark ink. This improves readability without claiming exact Outlook rendering; images and active content remain blocked.

## New Mail composer — 2026-11-09

New email provides To/Cc/Bcc, explicit coworker lookup or manually entered addresses, subject, the existing formatting/preview controls, and a recipient review before Send. Plain text remains available. Formatted code uses portable pre/code HTML for mail. Email attachments, reply/forward and cross-source bridges remain follow-up work.

Drafts are automatically saved locally under an account-specific `taut.mail.drafts.v1.<account>` key and survive navigation/restarts; Save & close returns to reading. Up to 20 drafts and 2 MB of serialized local storage are supported. These contain message content, not credentials; they are not Outlook drafts or synchronized to another device. Explicit discard asks for confirmation. Storage failure is surfaced and stops sending if the pre-send marker cannot be persisted.

The existing approved delegated Mail.Send authorizes POST /me/sendMail; no scope changes. Native validation checks recipients/duplicates, subject, body size/type and account identity; identity verification and send use one captured token. A per-attempt native reservation and a persisted local uncertain marker prevent double invocation/restart retries. Only explicit Review & send → Send email calls Graph. A 202 response is labeled accepted for sending, never proof of delivery; saveToSentItems is true. Other outcomes preserve a locked draft and require checking Outlook plus explicit acknowledgement before a new attempt. Mailbox-synced drafts would require separate Mail.ReadWrite approval.

Automated tests use mocked IPC/HTTP callbacks exclusively, covering validation, acceptance, uncertainty, local persistence, navigation/restart, account isolation and consent gating. Native tenant sending remains user-tested.

## Conversation media pane — 2026-11-09

Mail now uses the right details panel for participants, the loaded conversation's date range, and Files/Images/Links. Entire conversation is the default scope; Selected email explicitly filters to the last opened email. Source buttons open the original email. The global panel button reflects availability while reading and is disabled while composing.

Opening the pane collects readable bodies and attachment metadata from up to 25 loaded messages per pass; Collect more continues, and existing history controls load older messages. Attachment paging remains explicit. Binary files are downloaded only through Preview or Save. Inline images are excluded by default and available through Include inline images; TAUT does not guess which images are signatures. Images are grouped only after explicit previews establish equal SHA-256 hashes, with every source retained. Existing image preview/save and mailbox read state are preserved. No new permissions are requested.

## Reply, Reply all and Forward — 2026-11-09

Expanded messages offer Reply, Reply all and Forward. Each action reopens its existing local draft for that source message, with editable recipients/subject/body and collapsible plain-text original context. Reply-To takes precedence over From; replies to your own sent message start with its To recipients. Reply all deduplicates To/Cc and removes your known profile addresses. Bcc is never copied from a source. Forward starts without recipients. Original context is escaped independently of new formatting, included in the outgoing body and counted toward the size limit. A nonempty new message is required.

Only Review & send → Send email invokes Graph, using `/me/messages/{encoded-id}/reply`, `/replyAll` or `/forward` with reviewed message properties. No server draft is created and no Mail.ReadWrite permission is needed. Existing account binding, attempt reservation, durable uncertain marker, explicit acknowledgement and accepted-not-delivered wording apply. Graph forward includes original attachments; recipients see this warning in both composing and review. Reply does not reattach originals. Drafts are local to this Mac. Attachment editing and signatures were added in the November 10 pass below. Live thread association and forward attachment fidelity require manual tenant validation; automated tests use mocks.

## November 10: local file composition, signatures and chat bridge

Selecting email files, dropping files, or pasting a raster image stays local. Metadata is stored with the per-account draft; file bytes are copied to account/draft-scoped IndexedDB. Up to five nonempty files, totaling 2 MiB, are supported in this pass. Inline PNG/JPEG/GIF/WebP images insert visible `[image:identifier]` placement lines; removing an image removes its marker. Moving a marker into a code block or deleting it prevents sending. Review lists names, sizes and inline/attachment status. Native validation independently verifies identifiers, decoded byte sizes, MIME types, total request size and CID placement. Explicit Send includes Graph fileAttachment objects under the existing delegated Mail.Send permission. No OneDrive upload or server draft is used. Large upload sessions remain deferred.

Missing local file copies stop sending before a send-attempt reservation. Failed/uncertain sends retain the local draft and copies; accepted sends and explicit draft discard remove the copies. Original files are never changed. Browser storage clearing removes local drafts/files; these are not Outlook-synced drafts. Live attachment and inline sending were user-validated November 10; automated tests use mocks.

Signature defaults live in Settings → Mail. The composer keeps only a per-draft Include signature switch. Save formatted text and independent defaults for new emails, replies and forwards per account. Applying a signature makes a per-draft copy, separate from message text; changing saved defaults does not rewrite existing drafts. Preview and final review show it, and a draft can omit it. Defaults initially apply to new mail only, with an empty signature. No new scope.

Respond by email on a chat message creates an editable local Mail draft quoting that message and loaded replies, with sender/time attribution. The To field resolves the message sender from known membership or a read-only profile lookup; unresolved addresses remain blank. File names are noted but bytes are not copied; attach deliberately and review before sending. Selection performs no Microsoft 365 write.

Next: per-image approval for received inline images (remembered per account/message/image, HTML inline versus plain-text modal), then Mail read-state controls. Mark read/unread and timed read updates require separately approved Mail.ReadWrite; this change does not request it. Sender-wide trust and remote image loading remain separate decisions.

Chat email references appear in the composer body area and in the outgoing HTML body above the reply under “In reference to”, with an indented, left-bordered HTML quote. Sender addresses come from the message user ID and known chat membership or a read-only profile lookup; recipients remain editable. No email is sent until review and explicit Send.

Self-addressed mail (your known profile mail or UPN in To) requires an additional confirmation before any send attempt. “Don’t ask again on this Mac” persists per account. Cancel preserves the draft. Draft discard uses a centered native modal with Cancel focused and focus restored without scrolling; no animation is used. Quoted references use explicit HTML line breaks for email-client portability.

Review & send now opens a centered confirmation dialog with Keep editing focused. The confirmation footer stays visible while lengthy review details scroll within the dialog. Escape returns to the unchanged draft. Verified 40 mocked Mail composer browser cases (Chromium/WebKit), including a small viewport, plus 85 Node tests, UI TypeScript and production build. Build retains three existing App accessibility warnings. No real Microsoft 365 writes.

### Cached recipient suggestions and quieter review
To/Cc/Bcc suggest up to five matching names/email addresses from the current account’s People cache after two characters. Keyboard arrows/Enter or pointer selection replaces the current comma/semicolon-delimited address fragment; Escape dismisses suggestions. No lookup requests are made while typing; explicit Find a coworker remains available when the cache has no match. Review shows only Signature included/not included; the outgoing signature is unchanged. Multiple named signatures with separate action defaults are on TODO.md.
Validation: 70 mocked Mail/People/formatting browser tests passed in Chromium and WebKit, plus 85 Node tests, UI TypeScript and production build (three existing App accessibility warnings). No automated Microsoft 365 writes or new scopes.


## Mail read-state permission approval — November 10, 2026

The user explicitly approved delegated `Mail.ReadWrite` and confirmed that it was added in Entra with tenant admin consent. The documented purpose is explicit Mark read / Mark unread and an optional mark-read-after-viewing delay with focus/visibility guards and server reconciliation. This delegated scope broadly permits reading and changing the signed-in user's mail; approval here does not expand the implementation queue to deletion, organization or mailbox-synced drafts. No application permissions are proposed. Requested OAuth scope changes and read-state implementation are now included; a fresh interactive sign-in will be needed when that scope is added to TAUT. Automated validation must use mocked Graph requests and must never change real mailbox state. Received inline image approval remains next in the queue.

## Received image approval and read state — November 10, 2026

Preview of a matching inline CID attachment renders it inside HTML email and remembers that approval per account/message/attachment. Plain-text Preview remains a modal. Block again revokes approval; approved images are re-fetched on reopening (up to ten per attachment page). Remote images remain blocked, and this grants no sender-wide trust. Only approval flags are persisted, not image bytes.

The approved delegated Mail.ReadWrite scope is now requested. A fresh interactive sign-in is required. Explicit Mark read / Mark unread controls and a right-click menu change individual messages or the loaded messages in a sidebar conversation. Rust verifies account identity, patches only isRead, then reads it back before confirming UI state; ambiguous writes are never retried. Settings → Mail offers Off (default), 3, 5 or 10 seconds. The timer requires the open message, visible marker, focused document and no overlay; manual unread holds until reopening. Deletion and mailbox-synced drafts remain deferred. No real mailbox changes are made in automated validation.


### Manual acceptance and importance indicators — November 10, 2026
The user confirmed individual received-image approval, linked signature images, and image display sizing. The sanitizer preserves bounded literal dimensions and omits numbered markers beside rendered image-only links; destinations remain available for review in Email links. Remote images stay blocked.

Mark read / Mark unread was user-validated across TAUT, Outlook web and Outlook native. Outlook-originated read changes appear on returning to Mail or explicit refresh; this behavior is accepted. Actual Graph importance metadata is now selected for list, conversation and message reads; high importance appears on the latest loaded message row and the relevant message header, never inferred from the subject. See Microsoft's message resource documentation for the low/normal/high enum: https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0.
