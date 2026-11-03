# TAUT Desktop Alpha 1.3.0 — Automatic Sync

- Active chat updates every 5 seconds (while window is visible).
- Chat list metadata refreshes every 30 seconds.
- Incoming messages are deduplicated by Graph ID and sorted by UTC timestamp.
- New chat opens scroll to latest; background refresh only scrolls if already near bottom.
- Jump to latest appears while reading older messages.
- Failed sync attempts back off; send failures are not auto-retried.
- In-flight requests do not overwrite another conversation.
- Drafts remain untouched by polling.

Polling does not provide true push notifications; background/sleep behavior may pause it. No attachment support yet.
