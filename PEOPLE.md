# People directory and shared context

## Permission approval

Delegated User.Read.All is requested for the directory, richer coworker contact/job details, and manager lookup. User.ReadBasic.All remains used by lightweight recipient lookup. The user explicitly approved the expansion by adding User.Read.All and granting tenant admin consent before implementation. A fresh sign-in is needed so the token contains the new scope.

No directory write permission is requested. Selecting a person performs only GET requests. Chat stages a local pending conversation or opens an existing chat; Email opens a local draft. Neither sends anything.

## Directory and privacy

The left pane filters names, addresses, roles and departments locally, with name or department sorting. Directory pages are read through Rust, restricted to the Microsoft Graph users endpoint. A complete refresh replaces the roster atomically; failed refreshes retain cached results. Refresh runs on opening People, every 15 minutes while open, and explicitly. Profiles and manager details refresh on selection.

Allowlisted profile fields are cached in localStorage, scoped to tenant and account. This is local directory data, not OAuth credentials. Explicit sign-out clears the current account directory. Another account uses a separate key and cannot see the previous roster. Tokens remain in Rust/Keychain. Cache limits are 10,000 people and 100 pages; incomplete refreshes are not represented as complete.

The center shows available contact/job fields and manager. Missing or inaccessible manager data does not hide the profile. Presence samples are refreshed separately and expire normally.

The right pane shows known shared chat membership and file references from loaded chat history. It does not claim to be a complete relationship graph. Shared email uses an explicit mailbox search, limited to its first page, and opens the existing Mail view. No automatic mailbox writes or sends occur.

## Verification

Tests mock native IPC and Graph request functions; they never contact or mutate a tenant. Coverage includes restricted pagination destinations, absent consent, invalid IDs, optional managers, cache field allowlisting, filtering/sorting, cache recovery and sign-out, profile details, layout, and safe Chat/Email navigation.

### Directory polish and hidden people

Department options include counts from the current visible directory; names remain exactly as provided by the tenant. Right-click a directory row (or use its options button) to hide a person locally. Hidden people can be restored from the Hidden people view. This account-scoped preference persists on this Mac across refreshes and restarts; it does not change directory records or conversation membership. Profile cards separate contact information, organization details, and manager navigation from shared connections.

Manager navigation keeps a local deck of profile snapshots. Earlier cards are clickable; the front card’s X closes it and reveals the previous card. Selecting a directory row clears the stack. Returning restores profile details without another Graph request; shared-mail results reset for the selected person. Card motion respects Reduce Motion. The email copy control uses a centered 32px square hit area.

The profile deck now keeps the front card anchored: backing cards offset equally up and left, with a constant-height horizontal selector. Switching brings a card forward without discarding others; X closes only the current card. Directory selection resets the deck. At most 12 profiles are retained (oldest backing profile is evicted at the cap).

## V1 checkpoint

User acceptance confirmed November 10, 2026. People v1 is complete; custom local sections, member/guest grouping and group-member decks remain future enhancements.
