# Presence, membership and away replies milestone

Proposal prepared 2026-11-05. User approved all five proposed delegated scopes on 2026-11-05; TAUT now requests them. Entra consent and fresh sign-in remain necessary.

## Delegated permissions proposed

| Scope | Purpose | Limits |
| --- | --- | --- |
| Presence.Read.All | Read presence for people represented in TAUT chats and member lists. | Batch only known Entra user IDs; no directory crawl. |
| Presence.ReadWrite | Set/clear the signed-in user's preferred availability and optional status message. | Only the authenticated identity; explicit changes and expiry. |
| TeamMember.Read.All | Read the actual parent-team roster and ownership before managing inherited standard-channel access. | A channel roster is not a substitute for the team roster. |
| TeamMember.ReadWriteNonOwnerRole.All | Add/remove ordinary team members, affecting their standard-channel access. | No team owner promotion, demotion or removal; those require a future broader-scope proposal. |
| ChannelMember.ReadWrite.All | Add/remove direct private/shared channel members, including explicit leave where permitted. | Already reported admin-consented in Entra; adding it to TAUT's requested scopes still needs approval. Inherited shared access is not directly removable. |

No application permissions, Group.ReadWrite.All, directory-write, mailbox, calendar or team/channel creation scopes are proposed. Existing ChatMessage.Send and ChannelMessage.Send cover the explicitly enabled TAUT away replies. Entra delegated consent and a fresh sign-in will be needed for new scopes. Actual token scopes, ownership, tenant policy and Graph responses remain authoritative.

## Product behavior

### Presence

Read presence into an account-scoped cache with bounded batched polling, stale-response protection and retry/backoff. Render real availability consistently in the rail profile, chat list, header and member details. A group has no aggregate person presence. Unknown/expired/denied presence is neutral, never falsely Offline.

Own status menu offers supported preferred states, duration and Return to automatic. Do not claim that setting a preference alone makes an offline user online: Graph requires an active presence session. If TAUT needs its own session, session lifetime/renewal must be explicit and reflect actual running/idle behavior; never renew indefinitely while asleep or silently force Available at sign-in. Read back after an explicit change, report unconfirmed outcomes, and never retry writes automatically. Out of office is not an ordinary availability setter.

### Membership

Standard channels: present team membership, with a clear warning that changes affect the team and all its standard channels. Private/shared channels: manage only direct membership through the resolved host team/channel. Show read-only owners and inherited memberships where unsupported by this milestone's scopes.

Preflight account identity, current ownership, complete roster and target identity in Rust before a mutation. Fail closed on incomplete pagination or unknown roles. Use actual opaque membership IDs, never URL-follow an originalSourceMembershipUrl. Confirm adding/removing and leaving explicitly, protect the last owner, and re-read server state after changes. Display unavailable operations with a reason. No write retries following ambiguous outcomes; refresh is read-only.

### TAUT away replies

Off by default, explicit enable with message and optional start/end. Direct chats only by default; group/channel sending requires separate explicit opt-in. Channel responses belong in the triggering post's reply thread, never a new top-level post. Broad opt-in means eligible incoming human messages in conversations TAUT actively monitors, not an organization-wide auto-responder.

This feature works only while TAUT is running, connected and able to sync; it is not Outlook automatic replies, and does not configure Exchange or guarantee an Out of Office presence badge. No mailbox/calendar permission is requested. Settings explain the limits before enabling.

Once per stable sender identity across enabled scopes per account/tenant/away period. Persist the ledger across rebuild/restart; changing wording does not reset eligibility. A new explicitly enabled period resets it. Never mark a sender delivered merely because a message was fetched.

Seed/reseed conversation baselines without sending; only process newly observed incoming messages after enablement. Exclude own, system, bot/application, historical backlog, edits and reaction-only changes. Add an identifying automatic-reply marker and skip it on receipt, with rate limits and a visible disable control. Unknown authors/unsupported payloads fail closed.

Persist a reservation atomically before sending, serializing workers and rechecking configuration/account/period immediately before dispatch. Failure to persist blocks sending. Crash, timeout or uncertain delivery leaves a reservation that prevents automatic repeats; show status rather than silently retrying. Explicit disable/sign-out cancels pending work; no replays on reconnect or wake. Store no OAuth token in settings or ledger and avoid logging content/identifiers.

## Delivery and testing

One milestone implemented in sequential slices: read presence; own-status controls; membership; away-reply settings/ledger/dispatch. Keep existing drafts, pending conversations, sync, media, notifications, formatting and account isolation working throughout. Completion requires UI integration and meaningful mocked native/browser tests for each slice, not just policy modules.

All automated network writes must use mocked Graph transports. Cover denied/missing scopes, account switches, stale reads, owner restrictions, standard/private/shared routing, partial pagination, duplicate polling, restart/crash reservations, offline catch-up, loops and ambiguous sends. No real chats, messages, files, status or membership changes during automated tests. Live tenant validation remains manual after the user rebuilds/signs in.

## Primary references

- https://learn.microsoft.com/en-us/graph/api/cloudcommunications-getpresencesbyuserid?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/presence-setuserpreferredpresence?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/presence-clearuserpreferredpresence?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/presence-setpresence?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/presence-setstatusmessage?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/cloud-communications-manage-presence-state
- https://learn.microsoft.com/en-us/graph/api/team-list-members?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/team-post-members?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/team-delete-members?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/channel-post-members?view=graph-rest-1.0

## Approval rule

AGENTS.md: “Do not broaden Graph permissions without a documented reason and user approval.” The table above documents the reasons; user approval is required before editing TAUT's OAuth scope list.


## Implemented behavior and practical limits

Own status controls and away replies live in Preferences, also reachable through the profile button. A persistent footer indicator and disable action appear while an away configuration is enabled. Presence is read for known chat participants and loaded rosters with 30-second polling, neutral failures and bounded batches. The current own-status implementation sets a preference only; it does not create or renew a session to force online presence. Teams must already provide a presence session for online preferences to take effect. Own status-message editing is reserved for a later UI pass.

Channel details includes Manage members. The management panel re-reads the full direct roster and Rust preflights every change. Ordinary members can leave where the delegated operation is permitted; owners must use Teams to transfer ownership before leaving. External/guest additions and all owner-role changes are deliberately unavailable. Team creation and channel creation remain separate backlog items.

Away replies use a native worker every 30 seconds even when the main window is unfocused. It reads up to 50 most recent chats and up to 50 messages in each recently changed eligible chat; channel opt-in monitors up to 20 channels visited during the current session, with the latest 50 posts and expanded replies returned by Graph. This is bounded monitoring, not a guaranteed organization-wide or complete-history responder. Identifiable human accounts resolvable in the tenant directory, excluding guest-style #EXT# UPNs; no guest invitations. Basic profile access does not expose userType, so validation uses id/userPrincipalName without broader directory-read scope. Deduplication spans groups, direct chats and monitored channels. The ledger is account/tenant scoped, saved atomically with mode 0600 on macOS, and capped at 5000 senders per period. More than five dispatches within a minute blocks further dispatches that cycle. Failed storage blocks sending; uncertain outcomes retain reservations. There is no queue replay after sleep, network errors or restart. An explicit new period begins only after disable then enable; editing text while enabled retains sender reservations. A completed request already in flight cannot be recalled by disabling or signing out.

All implementation tests inject Graph/IPC responses. No actual presence, membership or message changes were performed during development.

Validation: 136 native Rust tests, 68 Node unit tests and 370 browser tests across Chromium/WebKit pass. Build, UI TypeScript and git diff --check pass; three pre-existing App.svelte accessibility warnings remain. Final native tests include injected membership writes and away dispatch for groups and channel threads, uncertain replies, basic-profile verification, persisted reservation/restart and account isolation. The own-status settings screenshot was visually inspected. Live tenant behavior has not been tested by automation.
