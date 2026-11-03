# TAUT 1.4.4 — Searchable coworker picker

- Delegated scope `User.ReadBasic.All` added to OAuth request; sign out and in after upgrade.
- Rust Graph directory search with a short debounce; displays profile names and emails.
- Selection uses Entra object IDs instead of constructed email addresses.
- Full email/UPN entry remains a fallback.
- Prevents one-on-one self-chat by object ID at the Rust boundary.

Manual test: search by name, pick a coworker, verify old chats reuse and new ones create; test manual email fallback. No message is automatically sent.
