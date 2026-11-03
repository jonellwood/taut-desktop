# Codex instructions for TAUT Desktop

Read `TAUT_HANDOFF.md` before modifying the project. Treat current repository source as the authority and the handoff as historical context.

Priorities: safety of real Microsoft Teams interactions, correct Rust/Graph operations, Svelte 5 UI behavior, macOS compatibility, and keeping the current features functional.

**Never create a chat, send a message, upload a file, or otherwise mutate real Microsoft 365 data during automated testing.** Use mocked Graph HTTP calls, unless the user explicitly authorizes a particular real-world test.

Selecting a person in New Conversation must be read-only and local. Delay Graph chat creation until explicit Send with nonempty text, and surface failure states. Do not confuse creating a chat with sending a normal message. Handle possible partial success if chat creation succeeds but the message send fails.

Keep OAuth tokens and secrets only in Rust or secure storage; do not expose them to Svelte/URLs/logs. Do not broaden Graph permissions without a documented reason and user approval. Before editing, inspect the actual files, `git status`, and existing tests. Make small changes, check/build where possible, report clearly what was verified.
