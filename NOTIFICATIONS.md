# Message notifications

Enable **Settings → Message notifications**. Notifications default off and persist across restarts. Banners contain a generic new-message notice; optionally include conversation names. Message text is never included. No new Microsoft Graph permissions are requested.

Rust compares read-only chat-list snapshots, about every 30 seconds. Native polling continues while the running app is unfocused or minimized. Startup history establishes a baseline without banners. Own messages, hidden/already-read chats, system events, edits and reactions stay quiet. A focused conversation showing its latest messages also stays quiet. Each incoming message ID alerts at most once per session. The existing latest-50-chat snapshot limits coverage; multiple messages between snapshots can produce a single alert.

Notification preferences store only two booleans in the application configuration directory. Tokens remain in Rust/Keychain. Notification destinations stay in memory, bound to the signed-in session; sign-out invalidates them. Clicking a supported native notification brings TAUT forward and opens the conversation while preserving drafts. Already delivered macOS notification history is not removed on sign-out.

TAUT must remain running and the machine awake; this is polling, not a push service or background daemon. Closing/quitting TAUT stops alerts. macOS Notifications permissions and Focus settings control actual delivery. The desktop plugin reports permission as granted without verifying those OS settings, and dispatch does not acknowledge banner delivery. Development builds may be attributed to **Terminal**; bundled builds use TAUT's app identity. No sound is explicitly requested.

## Validation

Rust policy tests use synthetic Graph snapshots. Browser tests mock native commands, preferences, failures and click routing. Automated tests do not contact Microsoft 365 or display real OS notifications.

Manual macOS checks:

1. Enable notifications and click **Send test notification**. Each request has a distinct sequence number in its banner and status text so repeated attempts can be distinguished. Check Notifications/Focus settings if no banner appears (including Terminal for development builds).
2. Leave TAUT running in the background; have a coworker send a message. Expect a generic banner within the next polling interval.
3. Click it and confirm the correct conversation opens and another conversation's draft survives.
4. Confirm reactions and existing history remain quiet; test a focused conversation at its latest message versus one scrolled up.
5. Disable notifications, restart, and confirm they stay off. Verify bundled-app delivery separately from development builds.

Native banner delivery and OS click callbacks require these manual checks; mocked tests cannot verify them.
