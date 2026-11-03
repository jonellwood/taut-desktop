# TAUT Entra registration — preparation

1. Entra admin center → App registrations → New registration.
2. Name: **TAUT Desktop**; supported account types: **Accounts in this organizational directory only**.
3. Record **Application (client) ID** and **Directory (tenant) ID**. These are identifiers, not secrets.
4. Authentication → Add a platform → **Mobile and desktop applications** → add `http://localhost` (native system-browser loopback redirect). Avoid using an SPA platform for native sign-in.
5. API permissions → Microsoft Graph → **Delegated** → `User.Read`, `Chat.Read`. Add `ChatMessage.Send` in the later write-enabled phase.
6. Grant organization admin consent as appropriate to your tenant's policy and test with an ordinary authorized account, not only a Global Admin account.
7. No client secret or certificate is required in the shipped desktop public client.

**Important:** This starter does not yet perform an OAuth flow. The next milestone is to implement Authorization Code + PKCE, a local loopback listener, nonce/state validation, system browser launch, token refresh, and macOS Keychain storage. We should not replace that with a token pasted manually into the UI.

For a US Government cloud tenant, confirm the correct Entra and Graph endpoints before implementing auth. Global cloud endpoints are currently placeholders in `src/lib/graph.ts`.

Microsoft documentation:
- https://learn.microsoft.com/en-us/azure/active-directory/develop/scenario-desktop-app-registration
- https://learn.microsoft.com/en-us/graph/api/chat-list-messages?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/chat-post-messages?view=graph-rest-1.0

## Attachment permission — approved 2026-11-03

See [ATTACHMENTS.md](ATTACHMENTS.md) for the implemented flow and the proposed
additional delegated `Files.ReadWrite` permission. The user explicitly approved
this scope on 2026-11-03 and Rust now requests it. Add Microsoft Graph → Delegated
→ `Files.ReadWrite` to the existing registration, complete consent as required by
your tenant, then sign out/in. No application permissions or client secrets are
needed. Existing sessions without this grant can still stage files locally, but
cannot upload or send them.

## Group chat membership — approved 2026-11-03

Add Microsoft Graph → **Delegated** → `ChatMember.ReadWrite`, then complete consent
as required by your tenant. This is the only proposed addition for adding/removing
members and leaving groups. Creation already uses `Chat.Create`; existing
`Chat.Read` is sufficient for member lists. Existing-group renaming would require
`Chat.ReadWrite` and is deferred. See [GROUP_CHATS.md](GROUP_CHATS.md).

The user approved requesting this scope on 2026-11-03, and Rust now requests it.
Sign out/in after consent to enable membership controls. Never add application
permissions or broader `.All` scopes for this implementation.
