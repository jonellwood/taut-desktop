# Teams and Channels — first release proposal

Status: user approved all three delegated read permissions on 2026-11-04. The scopes are now requested by TAUT. Entra consent, a fresh sign-in and manual tenant validation remain required. Automated development uses mocked Graph calls.

## User experience

Add a dedicated Teams and Channels destination to the existing navigation rail. Show joined teams and accessible channels, with standard/private/shared labels, filtering, refresh, and explicit loading, empty, permission and access-denied states. Keep Chats and its selected conversation/drafts intact when changing destinations.

Opening a channel shows root posts as threads with subject, author, timestamp and content; replies load when the user opens a thread. Keep channel navigation independent from chat selection/read-state handling. Channel browsing must not call chat read-state actions, create chats, post messages, or send notifications. This first release reads content; posting/replying, attachment upload, channel reactions and channel unread synchronization follow separately.

Treat message HTML as untrusted. Start with text-safe rendering that preserves paragraph breaks, display deleted-message markers, and provide descriptive placeholders for content/attachments not yet rendered. Retain the existing chat image viewer and attachment behavior.

## Requested delegated permissions

| Permission | Why it is needed | Proposed use |
| --- | --- | --- |
| Team.ReadBasic.All | Read team names and descriptions on the signed-in user's behalf | Discover joined teams and associated teams for shared-channel access |
| Channel.ReadBasic.All | Read channel names and descriptions on the signed-in user's behalf | Discover channels in a team and channels shared with a team |
| ChannelMessage.Read.All | Read channel messages on the signed-in user's behalf | Read root posts and threaded replies |

These permissions grant read access beyond current chat scopes. They do not grant team/channel creation, membership changes or message sending. This proposal adds no application permissions, Group.Read.All, Directory.Read.All, or channel write scopes. Existing chat permissions stay unchanged. Runtime capability checks use scopes actually granted in the Rust-held token, not the configured Entra permission list.

Approval is required before appending these three scopes to the OAuth request. After approval, add them as Microsoft Graph **Delegated** permissions in the Entra registered app, grant the appropriate tenant consent, then obtain a fresh sign-in to include them in the token. Cached credentials alone do not prove the new scopes were granted.

AGENTS.md: “Do not broaden Graph permissions without a documented reason and user approval.”

## Read-only Graph operations

Use Microsoft Graph v1.0, through Rust:

- `GET /me/joinedTeams`: direct team memberships. This endpoint does not include host teams reachable only through shared-channel membership.
- `GET /me/teamwork/associatedTeams`: associated teams, including shared-channel host teams; merge with direct memberships by team ID.
- `GET /teams/{team-id}/channels`: channels belonging to that team, constrained by delegated access.
- `GET /teams/{team-id}/allChannels`: includes incoming shared channels; resolve shared channels using their host-team/channel identity rather than assuming the listing team owns them.
- `GET /teams/{host-team-id}/channels/{channel-id}/messages?$top=50`: root posts; Graph orders these by activity of the whole thread, including replies. Do not send an unsupported order-by parameter or interpret this as creation order.
- `GET /teams/{host-team-id}/channels/{channel-id}/messages/{message-id}/replies?$top=50`: thread replies, paginated independently from roots.

Shared-channel metadata visibility does not guarantee message access. Use Graph's delegated response as authority and show access errors without probing broader permissions. Cross-tenant shared channels may be restricted by tenant policy; do not promise complete federation coverage or silently treat access denial as an empty channel.

Follow pagination explicitly. Continuations must stay on HTTPS graph.microsoft.com, v1.0, and the exact expected collection path; reject credentials, fragments, alternate hosts, cross-resource paths and repeated/cyclic continuation URLs. Never accept an arbitrary URL from Svelte as a bearer-authenticated request target. Encode opaque IDs as path segments. Keep tokens in Rust; do not log message text, token values or private Graph responses.

## Implementation and validation

Add a separate Rust module for validated GET-only collection operations and permission checks, with request injection for mocks. Expose narrowly scoped Tauri commands for discovery, root posts and replies. Run blocking Graph work away from the UI thread. Surface HTTP 403/404/429 and expired-auth conditions without write retries or changing chat read state.

Use a Svelte 5 workspace component with account/session generation checks so late responses cannot populate the wrong team, channel, thread or account. Reset channel caches on account change/sign-out; leave chat drafts and pending conversations intact when merely switching navigation destinations.

Mocked Rust coverage: scopes, opaque ID escaping, GET-only behavior, direct/associated membership discovery, host channel identity, pagination boundaries/cycles, partial failures and access-denied responses.

Mocked browser coverage: teams/channel/thread navigation, pagination, safe content rendering, loading/empty/error states, missing consent, rapid selection and account-switch races, preserved chat drafts, and no Microsoft 365 mutation while browsing. Run existing chat regressions, Node tests, UI type checks, Svelte build, cargo tests/checks. Real tenant browsing is left to explicit manual validation after consent; automated tests never mutate real data.

## Official references

- [Joined teams](https://learn.microsoft.com/en-us/graph/api/user-list-joinedteams?view=graph-rest-1.0)
- [Associated teams](https://learn.microsoft.com/en-us/graph/api/associatedteaminfo-list?view=graph-rest-1.0)
- [Channels](https://learn.microsoft.com/en-us/graph/api/channel-list?view=graph-rest-1.0)
- [All channels, including incoming shared channels](https://learn.microsoft.com/en-us/graph/api/team-list-allchannels?view=graph-rest-1.0)
- [Channel messages](https://learn.microsoft.com/en-us/graph/api/channel-list-messages?view=graph-rest-1.0)
- [Thread replies](https://learn.microsoft.com/en-us/graph/api/chatmessage-list-replies?view=graph-rest-1.0)
- [Delegated permission descriptions](https://learn.microsoft.com/en-us/graph/permissions-reference)


## First implementation notes

The rail has a dedicated Teams and Channels destination. Read-only discovery merges joined and associated teams, then merges team channels and incoming shared channels. Pagination is explicit through More/Load more actions for each collection. Message bodies render as inert text with paragraph breaks; no remote image auto-load or untrusted HTML insertion is used. Thread selection, refresh and account changes invalidate stale responses. The layout toolbar controls the channel browser and reply pane; switching back to Chats restores the existing draft and staged files.

No channel posting, attachment preview/upload, message editing, channel read-position synchronization or channel notifications are included. Channel data is refreshed explicitly. Navigating away from Teams clears its in-memory workspace; returning fetches current discovery again. Cross-tenant shared-channel listing/content access remains subject to Microsoft Graph and tenant restrictions. Unavailable host metadata disables opening a channel rather than guessing a team ID.

Manual validation after consent: open Teams and Channels; verify your IT Development, myBerkeley and Uniform Order Dev Team entries where still members; open General and inspect a post/replies; try a private/shared channel if available; switch to Chats and confirm drafts survive. Check layout/focus controls and pagination where populated. Do not treat mocked coverage as proof of real tenant permissions or federation support.

## Verification — 2026-11-04

Passed: 92 Rust tests, 40 Node tests, the full 240-case Chromium/WebKit regression suite, and a final 24-case Teams/Channels browser run after tightening deleted-subject masking. `cargo check`, UI TypeScript checks, Svelte/Vite build and `git diff --check` passed. Three pre-existing Svelte accessibility warnings remain. No real Microsoft 365 data was mutated or live Graph feature requests made by automated tests. Native tenant permissions, standard/private/shared channel coverage and cross-tenant access await manual validation after consent.

## Activity and comparison follow-up — 2026-11-04

System activity is now collapsed into compact Channel activity/Thread activity sections without conversation cards or reply buttons. Unknown message enum values retain readable content unless event metadata identifies them as activity. Pages containing only activity keep Load more reachable and explain that older conversation posts may be on later pages. Team/channel breadcrumbs and timestamps including the year make comparisons with Teams clearer. Normal replies remain grouped under their root post in the thread pane. Passed 30 focused browser checks and 46 Node tests, plus UI types/build; existing three accessibility warnings remain. Automated Graph calls stayed mocked.

## Channel posting and replies — proposed next release

Status: user approved delegated ChannelMessage.Send on 2026-11-04. It is now requested by TAUT. Entra consent and a fresh sign-in are needed before manual testing. All automated sends remain mocked.

### Permission requested

Add Microsoft Graph **delegated ChannelMessage.Send**. It permits sending channel messages on the signed-in user's behalf, subject to the user's channel access, posting rights and tenant policies. Existing ChatMessage.Send covers chat sending; channel posts/replies require this separate permission. Microsoft documents ChannelMessage.Send as the least-privileged delegated permission for both operations. No Group.ReadWrite.All, application permission, team/channel creation or membership-management scope is proposed.

After approval, configure ChannelMessage.Send under Microsoft Graph → Delegated permissions in the Entra registered app, grant tenant consent as appropriate, then sign out/in to acquire a token containing it. TAUT must inspect actual Rust-held token scopes rather than assuming Entra configuration equals token permission.

AGENTS.md requires: “Do not broaden Graph permissions without a documented reason and user approval.”

### Concrete implementation scope

- Add an explicit New post composer in the selected channel and a Reply composer within its thread pane. First pass is plain text, up to 4000 characters, with a required nonempty body. Rich text, attachments, announcements and mentions remain separate follow-ups.
- Keep drafts separate per signed-in account, verified host team, channel and root post; preserve them when changing channels/threads and navigating between Chats and Teams. Sign-out/account changes clear private drafts. Normal chat text/file drafts remain intact.
- New post sends POST /teams/{host-team-id}/channels/{channel-id}/messages with an itemBody containing contentType text. A thread reply sends POST /teams/{host-team-id}/channels/{channel-id}/messages/{root-post-id}/replies. Never use chat creation or chat replyWithQuote for a channel thread.
- Validate and percent-encode all resource identifiers in Rust. Verify current account and actual permission before sending. Use the resolved shared-channel host, never infer the host from a listing team. Disable sending for known archived resources, missing host identity and deleted/activity roots; Graph remains authority for posting rights and moderation restrictions.
- Capture the destination and submitted draft before the request. Navigation must not redirect an in-flight send or clear a different draft. Prevent duplicate Send while pending.
- Require a 201 response and valid returned message identity before clearing the submitted draft. Retain drafts on rejection; treat network failures, server failures and incomplete confirmations as uncertain. Never automatically retry a write. Provide read-only refresh and explicit checked-status acknowledgement before another attempt.
- Render posted content through the existing inert text parser and refresh thread/root collections safely. Keep pagination and stale-response guards.

### Verification and manual review

Automated verification uses injected Graph requests and mocked Tauri IPC only. Cover exact new-post/reply paths and payloads, missing permission/account mismatch/invalid IDs/blank text with no POST, shared-host routing, archived/deleted safeguards, single-write behavior, rejection and uncertainty, draft isolation, navigation/unmount races and normal chat regressions. Do not exercise real channel writes in automation.

After consent and rebuilding, the user can manually create a short post in a designated test channel, reply from its thread pane, confirm both in official Teams, and check that switching channels/threads preserves separate drafts.

Official operation references:
- https://learn.microsoft.com/en-us/graph/api/channel-post-messages?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/chatmessage-post-replies?view=graph-rest-1.0

### Implementation status — 2026-11-04

Plain-text channel posts and replies are implemented. Drafts and delivery-warning state live in the account workspace above the Teams component, so they survive navigation to Chats and back. They are in-memory only and are cleared on sign-out/account changes, not persisted across app restarts. The global send guard also prevents concurrent chat/file/channel sends and sign-out while a channel request is pending. Switching destinations during a send never retargets it.

Rust preflight reads /me, the host team, channel and (for replies) original post; identity mismatches, archives, deleted/activity roots and missing token scope block the POST. All IDs are encoded segments. Shared-channel metadata or posting access can still be denied by Graph/tenant policy. No broader permissions are requested to bypass that restriction.

Confirmed posts/replies appear in the current matching collection, and the submitted draft clears only when unchanged. Late responses cannot insert content into a different selected channel/thread; unmounted requests still settle their captured draft and release the global guard. Uncertain state survives navigation; refreshing or acknowledging never sends. A fresh explicit Send is always required to retry.

Attachments, formatting, mentions, announcements, channel reactions, unread tracking, and team/channel administration remain future work.

Verification: 282 Chromium/WebKit browser checks, 107 Rust tests and 52 Node tests passed. UI TypeScript, Svelte/Vite build, cargo check and git diff --check passed. The same three existing Svelte accessibility warnings remain. Browser writes and native Graph requests were mocked; real channel posting and tenant-specific moderation/shared-channel behavior await user testing.

## Channel details and member list proposal — 2026-11-04

User requested a real right-hand details panel with membership and history, replaced temporarily by a reply thread. Implement channel/team identity, channel type and description, archive status, and loaded channel activity using current approved read scopes. Closing a thread returns to details; hiding details updates the layout toggle. History is loaded channel activity, not a complete audit log.

To show who can access the selected channel, request **delegated ChannelMember.Read.All** after user approval. Microsoft Graph v1.0 GET /teams/{host-team-id}/channels/{channel-id}/allMembers supports standard, private and shared channels. For shared channels it includes direct and indirect memberships. Use the resolved host identity, existing strict pagination validation, and actual token-scope checks. Treat membership IDs as opaque; never fetch originalSourceMembershipUrl as an authenticated target. Display names/roles returned by Graph, neutral fallback for unavailable names, and inherited membership labels where supplied. List counts describe loaded membership records, not an unverified total number of people.

This is read-only channel membership access on the signed-in user's behalf. No membership mutation, TeamMember.Read.All, directory-wide or application permission is proposed. Tenant/federation restrictions can still deny the list. Do not infer membership from message authors or substitute a parent team's roster for a private/shared channel.

AGENTS.md requires “Do not broaden Graph permissions without a documented reason and user approval.” User approved delegated ChannelMember.Read.All on 2026-11-04; it is now appended to the requested OAuth scopes. After approval it requires Entra delegated configuration/consent and a fresh sign-in. If the actual token lacks this scope, the details panel explains the missing member-list permission and shows available metadata/history.

Verification will use mocked GET/IPC calls for the roster and cover pagination, stale selection/account responses, permission failures, host routing, names/roles, details/thread transitions and draft preservation. No real Microsoft 365 writes are needed.

Official reference: https://learn.microsoft.com/en-us/graph/api/channel-list-allmembers?view=graph-rest-1.0

### Details implementation

The layout control now corresponds to an actual channel/team details panel, even before a thread is selected. Details contain channel/team descriptions, channel type/archive state, paginated read-only channel membership and activity from loaded channel history. A selected thread replaces details; closing the thread restores them. Hiding/restoring the panel and focus mode keep drafts intact. Narrow layouts show details as an overlay.

Member requests use the same validated Graph collection reader as channel history, resolved host identity and exact-collection continuation checks. ChannelMember.Read.All is checked independently from message/discovery/write scopes. Closing the details component or changing channel/account invalidates outstanding membership responses. Names render as text, source-membership URLs are never followed, unknown people retain neutral labels, and counts explicitly describe loaded records rather than a total roster. Loaded channel history can be paged further from the panel and remains distinct from a complete audit log.

Details verification: 294 browser checks across Chromium/WebKit, 110 Rust tests and 52 Node tests passed. UI types, Svelte/Vite build, cargo check and git diff --check passed; the same three pre-existing accessibility warnings remain. A pagination fixture key error was corrected before the final passing run. User confirmed real channel posting succeeded after ChannelMessage.Send consent; real member-list validation awaits ChannelMember.Read.All consent/fresh sign-in.

## History cleanup and membership administration status — 2026-11-04

Channel activity history now appears only in the details panel; the duplicate central Channel activity section was removed. Thread-specific activity remains within its own reply pane. The central feed still provides Load more posts when an activity-only page is returned.

User reports ChannelMember.ReadWrite.All is configured with admin consent in Entra. TAUT currently requests ChannelMember.Read.All for read-only rosters; it does not yet offer membership writes or request ChannelMember.ReadWrite.All. Entra configuration alone does not implement management UI or grant additional user ownership rights.

Future administration must distinguish standard-channel membership inherited from its parent team from direct private/shared membership. Graph channel-member mutation endpoints support private/shared channels; standard membership changes require team membership operations with separate scope review. Inherited shared access must be changed at its membership source, never by guessing a channel membership ID or following originalSourceMembershipUrl as an authenticated arbitrary URL. Channel owners normally manage private/shared rosters; parent-team ownership alone does not make someone an owner of every private/shared channel. Graph and tenant policy remain authoritative. Protect last owners, confirm removals/leaving explicitly and test only with mocked writes.

References:
- https://learn.microsoft.com/en-us/graph/api/channel-post-members?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/microsoftteams/private-channels
- https://learn.microsoft.com/en-us/microsoftteams/shared-channels
