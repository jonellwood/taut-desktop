# Local chat pins

Open the three-dot options beside a conversation and choose **Pin chat**. **Unpin chat** returns it to Recent. Pinning does not open a chat, load messages, mark it read, send anything, or change Microsoft 365 data. Existing unread indicators, search and hidden-chat filtering apply in either section. Hidden pins remain hidden until you open the hidden list.

Pins are TAUT-only on this device, separate from Teams favorites. Browser/WebView local storage holds only chat IDs under the signed-in account's Entra object ID. No message text, names, drafts or credentials are saved with pins. Sign-out clears active pin state; returning to the same account loads its saved pins. Another account has its own pin list. Clearing application website data removes pins.

At most 500 IDs are retained per account. The current Graph chat-list implementation loads the latest 50 conversations; a saved pin outside that loaded set will not appear until the conversation is loaded again. Its stored pin is retained. Pins follow the existing conversation ordering within Pinned; manual ordering is not implemented.

Storage errors are reported without silently changing pins. No new Graph permissions or network writes are involved. Automated UI tests mock Graph and cover persistence, account separation, unread preservation, groups/drafts, hidden pins, Escape and storage failures.
