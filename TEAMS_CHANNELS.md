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
