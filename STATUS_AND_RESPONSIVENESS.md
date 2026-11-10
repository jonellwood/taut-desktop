# Workspace status and responsiveness

The bottom workspace status bar is always present across Chats, Teams/Channels, welcome, navigation changes and focus mode. Recoverable sync warnings, authentication errors/reconnect notices, Keychain/session notices and read-state warnings share this location. A healthy state replaces the warning after the relevant operation succeeds. Sync status no longer floats over messages or the composer.

Send/attachment/deletion/membership/reaction errors remain beside their drafts or confirmation controls. In particular, uncertain delivery must stay contextual and must not be silently dismissed or automatically retried by a generic status mechanism.

Sync failures track message and chat-list reads independently. A healthy message poll cannot clear an outstanding chat-list failure; successful chat-list recovery clears that source. The existing 15-second network/server backoff and 60-second 429 backoff remain. Authentication requiring a fresh sign-in takes precedence and exposes Reconnect. No new Graph writes or permissions are introduced.

## Responsiveness work

The user reported an approximately ten-second macOS beachball while viewing a code message. No native trace of that exact event is available, so its precise cause is unconfirmed. Two concrete sources of avoidable work were found and addressed:

- The older profile, chat list, member list, directory search, messages and hosted-image read commands used blocking HTTP on the Tauri main thread. These reads now run on spawn_blocking workers. Request paths, validation, token handling and notification-generation guards are retained. A native test verifies the worker runs on a different thread using an injected closure, with no network request.
- The PowerShell display highlighter used a regex that scaled poorly on long escaped/unclosed quoted strings. It now uses a single-pass scanner and retains every source character. A synthetic 80,001-character escaped-string case took approximately 1 ms on the development host; this is a local lexer measurement, not a guarantee of whole-app latency.
- The message renderer derives primitive content/type values before parsing. Unchanged polls therefore retain the rendered code DOM rather than reparsing/replacing it merely because the raw body object is new. Browser coverage checks retained DOM and continued draft typing after polling.

All code remains escaped/inert. Copy preserves the original text, and oversized snippets still use plain code. PHP and other languages currently retain formatting without syntax highlighting; an absent language label is not inferred from code text. Additional lexical-language support remains backlog work.

## Validation and manual acceptance

Automated tests mock Graph and clipboard access. Cover persistent status position, no duplicate floating warning, focus/navigation, independent sync recovery, authentication notice placement, draft preservation and unchanged large formatted-message polling. The initial chat-list recovery test assumed a fixed wall-clock poll interval; its virtual-clock expectation was corrected to allow the existing backoff, then passed.

Manual review after rebuilding: scroll through the PowerShell and PHP chats while sync runs, confirm the status area remains at the bottom and updates when reads recover, and check that the beachball no longer reproduces. Long-lived HTTP waits should leave the native window responsive. Continue reporting any stall; further native profiling may be required if it persists.

Reference: https://v2.tauri.app/develop/calling-rust/#async-commands

Verification — 2026-11-04: full browser suite 316 passed across Chromium/WebKit; Rust 111 passed; Node 56 passed. UI types, Svelte/Vite build, cargo check and git diff --check passed. The same three existing Svelte accessibility warnings remain. A rendered status-bar screenshot was inspected. All automated Graph calls were mocked; the original native beachball still needs manual rechecking after rebuilding.

Navigation follow-up: clicking the Chats or Teams and Channels rail destination now reveals its sidebar if collapsed, including when already on that destination or exiting focus mode. It does not open the details panel, choose a new conversation, send anything, or clear drafts. Focus/sidebar controls still permit explicit collapse afterward. Passed 46 focused Chromium/WebKit layout, status and channel checks, UI types, build and diff checks.
