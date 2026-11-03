# Persistent sign-in

TAUT stores the Microsoft refresh token in **macOS Keychain** after interactive sign-in, then silently exchanges it for an access token on the next launch. Closing/rebuilding the app keeps this saved session. Explicit Sign out removes it.

No additional Entra or Graph permissions are needed. The existing `offline_access` scope allows Microsoft to issue refresh tokens. Microsoft can still require interactive authentication because of expiry, revocation, MFA, consent changes, or tenant sign-in policy.

## Storage and lifecycle

- Rust calls Security.framework directly through the macOS-only `security-framework` dependency. No shell command, plaintext file, browser storage, or Svelte state holds credentials.
- Only the refresh token is persisted. Access tokens remain in Rust process memory. UI IPC returns only session/saved status and sanitized notices.
- Stable Keychain service: `app.taut.desktop.microsoft365`; account: `{tenant-id}:{client-id}`. This supports one saved account for this configured app/tenant and survives rebuilds. A different tenant or Entra app gets a separate entry.
- Successful refreshes save replacement refresh tokens. If Microsoft omits a replacement, the existing one is retained. Startup does not invent granted scopes; write controls continue to check actual grants in Rust.
- Session refresh, Keychain updates, and sign-out are serialized. Sign-out clears memory and prevents delayed interactive-login completion from recreating the saved session.
- A revoked/expired grant clears the saved refresh token and asks for fresh sign-in. Network/server errors preserve the saved credential for a later retry rather than opening a browser or deleting it automatically.
- Keychain denial or lock does not trigger insecure storage. Interactive sign-in can remain temporary, with a visible notice. A failed Keychain deletion clears the current memory session but explicitly warns that a saved sign-in may remain.
- Preferences offers **Retry saved sign-in** and **Clear saved sign-in** when disconnected. Connected preferences reports whether sign-in was saved.
- If a running session needs fresh authentication, Reconnect preserves text/file drafts for the same account. Switching accounts clears the old account's drafts and cached media. Drafts themselves are still session-only and do not survive quitting.
- Sign-out clears TAUT's local credentials; it does not revoke Microsoft browser cookies or sign out other applications.
- macOS may ask to unlock Keychain or authorize TAUT to access its item, especially after rebuilding or changing signing identity. Allow access only for the TAUT build you launched. Non-macOS builds use temporary sign-in without a plaintext fallback.

## Verification

Rust tests inject fake credential storage and fake OAuth responses. Browser tests mock native IPC and block external network access. Automated tests never read/write the user's real Keychain, launch OAuth, or mutate Microsoft 365 data.

Coverage includes initial save, startup restoration, token rotation/omitted replacement, exact scope checks, transient/revoked grants, invalid responses, Keychain failures, logout cleanup, delayed-login cancellation, refresh/logout concurrency, UI startup/manual fallback, retry/clear controls, and draft preservation during reconnect.

Manual validation after building:

1. Sign in once to let TAUT save the refresh token. Allow a macOS Keychain prompt if shown.
2. Quit and reopen/rebuild TAUT. It should connect without opening the authorization browser.
3. Sign out, quit, and reopen. It should stay disconnected and offer Sign in.

Sources: [Microsoft refresh-token lifecycle](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens), [Security.framework password API](https://docs.rs/security-framework/latest/security_framework/passwords/index.html).
