# Alpha 1.2.1 — Message ordering fix

Replaces the assumption that Graph returns newest-first messages with an explicit chronological sort by `createdDateTime`.

Use the included `src/App.svelte` as a drop-in replacement for Alpha 1.2, or use the full project. No Entra changes.
