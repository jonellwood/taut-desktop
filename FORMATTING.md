# Received message formatting

Received formatting is shared across chat messages, quoted-chat originals/replies, channel posts and channel thread originals/replies. Received display is complemented by explicit opt-in composer formatting. No OAuth scopes are added.

## Supported content

- Teams Graph HTML codeblock/code, HTML pre/code and preformatted text.
- Language label, selectable monospace text, bounded vertical scrolling and horizontal scrolling for long lines.
- Copy code copies the underlying decoded source, including indentation, tabs, blank lines and trailing newlines. No line numbers or highlight markup enter the clipboard. Clipboard failure explains manual selection instead of claiming success.
- Lightweight PowerShell lexical highlighting for comments, strings, variables, control words, commands and numbers. This is a display lexer, not a PowerShell parser. Other languages retain their label and plain code; unknown languages safely fall back to plain display.
- Paragraphs, div line structure, explicit breaks, bold/italic/underline/strike, headings, ordered/unordered lists, inline code, blockquotes and explicit HTTP(S) links. Link opening requires a user click and uses the native opener.
- Body contentType text remains literal, including angle brackets and newlines. A missing body uses the existing text fallback.

Code is taken from the decoded Graph body. Highlight span wrappers in Teams code are ignored; br becomes a newline. HTML entities decode once; nonbreaking spaces remain nonbreaking spaces and ordinary tabs remain tabs. Code text is never executed. Excessively nested markup has a visible omission marker; very large PowerShell snippets use plain code without lexical highlighting.

## Safety and synchronization

The parser uses an inert HTML template and creates a small allowlisted data tree. Svelte renders text and approved elements; it never inserts received HTML into the active document. Event handlers, styles, arbitrary attributes, scripts, forms, frames, SVG and resource-bearing elements are discarded. Embedded images and attachment placeholders remain under the existing explicit media controls and are not auto-loaded by formatting.

Links accept only absolute credential-free HTTP(S) URLs. Unsafe schemes and relative URLs remain text. Link labels are flattened to text so untrusted link contents cannot wrap nested interactive Copy code buttons.

Deleted messages never parse/render their old body or code controls. Formatting-only changes participate in chat synchronization comparisons even when visible words are unchanged. Normal chat, reply and file drafts remain separate and untouched.

Legacy code-snippet card attachments without an inline codeblock/pre body, adaptive cards, arbitrary embedded resources, full WYSIWYG composition and broader syntax-language coverage remain follow-ups. Do not treat an attachment URL as permission to fetch arbitrary code content with a Graph bearer token.

## Verification and manual review

Mocked browser coverage checks exact decoded PowerShell source/copy, safe links, inert malicious HTML, rich structure, literal text bodies, unknown languages, deleted code, formatting-only refresh, clipboard failure and consistent chat/channel/thread display. Node tests check link/language validation and lossless token reconstruction. Graph and clipboard writes in automation are mocked.

Manual review: rebuild, open the PowerShell message previously flattened into a paragraph, verify its language/line breaks/indentation, and use Copy code into a local editor. Open a quoted chat thread and a channel thread with formatted content. Existing sent messages are not modified by viewing them.

Official references:
- https://learn.microsoft.com/en-us/graph/api/chatmessage-post?view=graph-rest-1.0#example-14-send-a-message-with-a-code-block
- https://learn.microsoft.com/en-us/graph/teams-messaging-overview#card-attachment

Verification — 2026-11-04: final full Chromium/WebKit suite 308 passed; Node tests 55 passed; Rust tests 110 passed. UI TypeScript, Svelte/Vite build, cargo check and git diff --check passed. The same three pre-existing Svelte accessibility warnings remain. No real Microsoft 365 data or system clipboard was mutated during automated testing. Native macOS clipboard behavior and the user's original PowerShell message await manual validation after rebuilding.

Manual follow-up — 2026-11-04: user confirms PowerShell renders well and Copy code appears correct. PHP displays formatted code without highlighting, as expected for the current language fallback. User also reported a brief beachball and intermittent auto-recovering sync warning; subsequent work is documented in STATUS_AND_RESPONSIVENESS.md.

## Composer formatting — 2026-11-04

Use **Format** above a composer to reveal Bold, Inline code, List, Link, a code language selector and Code block. These controls insert editable formatting markers around the current selection. Preview shows the rendered message without sending. The source editor supports `**bold**`, backtick inline code, `- ` bullet lists, numbered lists, HTTP(S) links and fenced code blocks. Raw HTML is always literal text. This is a lightweight source editor with preview, not a WYSIWYG editor.

Chat formatted mode uses Enter for a newline and Command+Enter (Control+Enter) for explicit Send. Plain mode retains Enter to send / Shift+Enter for a newline. Reply and channel composers retain explicit send buttons. Formatting flags belong to their individual conversation or thread drafts and follow pending chats when their server ID is retained. Attachments and ambiguity/retry safeguards remain in place. Drafts are in memory, as before; authentication persistence does not persist drafts across quitting.

Rust independently compiles source into the small escaped HTML vocabulary. The frontend never supplies trusted HTML. Empty formatted code cannot create a pending conversation, prepare files, or send a text-only message. Existing attachment-only messages remain permitted. Outgoing code uses Graph's documented codeblock element and a validated language class; Graph/Teams may normalize language highlighting. TAUT locally highlights PowerShell and labels other supported languages, including PHP, with the existing plain-code fallback.

Manual acceptance after rebuilding: send a short PowerShell code block to the test chat, check Teams line breaks/indentation and copy the received code back into an editor. Try a bold/list/link message, then a quoted reply and a channel post/reply. Automated tests use mocked IPC/Graph requests exclusively; tenant rendering still requires this manual round-trip.

Verification: 60 Node tests and 117 Rust tests passed; full Chromium/WebKit suite 326 passed. After the final documented-codeblock markup and toolbar alignment change, all 30 focused formatting/layout browser tests passed again. UI TypeScript, Svelte/Vite build, cargo check and git diff --check passed. Three pre-existing Svelte accessibility warnings remain. No automated requests touched the real tenant.

List editing: in formatted composers, Enter at the end of a bullet inserts the next `- `; Enter on an empty bullet removes that marker and moves to column one of a new blank line. Shift+Enter inserts a plain newline. Code fences, selected text, IME composition and send shortcuts are excluded from bullet continuation.
