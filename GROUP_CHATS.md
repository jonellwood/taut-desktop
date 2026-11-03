# Group chats

## Entra permissions

Add Microsoft Graph **Delegated `ChatMember.ReadWrite`** to the existing app
registration and grant consent according to tenant policy. This permits TAUT to
read and change membership of chats on behalf of the signed-in user, including
adding/removing people and leaving a group. It remains subject to service and
organization policy. It is the only additional permission proposed for this step.

The user explicitly approved this delegated scope on 2026-11-03, and Rust now
requests it. The user confirmed the delegated permission and tenant admin consent
on 2026-11-03. Sign out/in to obtain a fresh grant. Membership changes stay disabled
without the grant; group creation
and read-only member lists can use the existing permissions.

| Capability | Delegated permission |
| --- | --- |
| Create a named or unnamed group | Existing `Chat.Create` |
| List members | Existing `Chat.Read` |
| Send text/reference messages | Existing `ChatMessage.Send` |
| Upload/share attachment files | Existing `Files.ReadWrite` |
| Add/remove members or leave | New `ChatMember.ReadWrite` |
| Rename an existing group | `Chat.ReadWrite`; deferred and not requested |

No application permissions, `.All` membership permissions, additional directory
permissions, or client secrets are proposed.

## Creating a group

In New conversation, enable Group conversation, choose 2–19 coworkers, optionally
name the group, and open its draft. Selecting/removing people, opening a draft,
switching chats, and synchronization stay local/read-only. First Send still
requires nonempty text and is the first operation that can create the group.
Attachment sending uses the same explicit first-Send flow.

The app limit is 20 total participants in this initial version. This is an
implementation limit, not a claim about the Teams service limit. Names allow up
to 250 characters without colons. The existing one-on-one picker remains available,
including its email fallback; group recipients must be selected from directory
results so the app has verified Entra object IDs.

The backend verifies the signed-in identity and each recipient before creation.
This version targets internal coworkers. Recognized B2B guest (`#EXT#`) principal
names are rejected before group creation or addition; broader guest/federated role
handling is deferred. No `User.Read.All` expansion is requested to inspect userType.
The service may reject unsupported guest accounts or other tenant restrictions.

A local draft is keyed by selected IDs and group name; separate existing groups
are not assumed to be duplicates just because their memberships match. If creation
is unconfirmed, TAUT retains the draft and blocks another create until the user
explicitly acknowledges checking Teams. If creation succeeds but message delivery
fails, the server chat ID is retained and explicit retry sends to that group
without creating another one. There are no automatic write retries.

## Managing members

The conversation detail sidebar shows member names/roles, Refresh members, and
permission-gated Add/Remove/Leave actions. Selection in the add-member picker is
local. Confirm add member is required to write, with an explicit history choice:
No previous messages (default) or All previous messages. The backend uses the
Graph-documented omitted history field for no history, and year 0001 for all history.

Remove and Leave each require confirmation. Rust checks the chat type and current
membership before writing and uses the opaque membership ID returned by Graph,
not the person's Entra ID. Missing or paginated member lists block management.
A current-member add is a read-only no-op to avoid duplicate additions after a
previous ambiguous outcome. Unconfirmed changes require a successful member
refresh before further changes. Tenant/service failures remain visible.

Confirmed leave removes the chat from this app session, preserving other drafts,
and excludes it from subsequent polling results in this session. It does not delete
messages or remote chat history. A new sign-in may show historical conversations
again according to Graph's results.

Adding someone does not automatically share previously uploaded files with them.
Removing/leaving does not revoke already granted OneDrive file access. File sharing
for a new Send always verifies the current recipient list; prepared uploads with a
changed member set are blocked rather than silently reused for different recipients.
Group message bubbles display the actual sender where Graph supplies a name.

## Activity in message history

Confirmed Graph system events appear as quiet icon/text rows in chronological
order alongside user messages, with their original timestamps and date separators.
Supported notices are members added/removed, members joined/left, and group-name
changes. A single-person removal initiated by that same person is shown as leaving.
Where Graph supplies visibleHistoryStartDateTime, additions include the reported
history boundary or an all-previous-messages note; missing values do not imply a
history policy.

Message reads opt into `Prefer: include-unknown-enum-members` to receive the
`systemEventMessage` enum. Unknown events and missing event details remain hidden
rather than becoming unsupported-content bubbles. The UI uses eventDetail, never
scrapes raw event HTML or invents an event after a local button click. The same
notices can therefore reflect changes made through official Teams.

Historical identities use event-provided names, cached known participants, and
bounded read-only `/users/{id}?$select=id,displayName` lookups under the existing
`User.ReadBasic.All` permission. Foreign-tenant IDs are not resolved in the local
directory. Missing/inaccessible identities use neutral labels. Names are cached
only for this sign-in and loaded in the background; no tokens reach Svelte.

Activity is not counted as newly received user messages and does not replace the
latest actual-message sidebar preview. Rendering does not change drafts or media
behavior. The history window remains the same newest 50 messages returned by the
existing reader. This adds no requested permissions or Graph writes.

## Testing

All Graph writes are mocked in Rust and browser tests; no live group creation,
messages, membership changes, or uploads are performed by automation. Coverage
includes pure selection, empty-send guards, create/send sequencing, unconfirmed
creation, retained IDs after failed sends, empty 201 member-add responses, opaque
membership IDs, self-leave, permissions, history defaults, incomplete lists, and
preserving text/file drafts. The user manually verified named group creation,
first-message sending, member addition with history choices, and member removal
on 2026-11-03. Self-leave and the activity timeline still need manual validation.

## Microsoft references

- [Create chat](https://learn.microsoft.com/en-us/graph/api/chat-post?view=graph-rest-1.0)
- [List members](https://learn.microsoft.com/en-us/graph/api/chat-list-members?view=graph-rest-1.0)
- [Add member and history options](https://learn.microsoft.com/en-us/graph/api/chat-post-members?view=graph-rest-1.0)
- [Remove member](https://learn.microsoft.com/en-us/graph/api/chat-delete-members?view=graph-rest-1.0)
- [Update group name](https://learn.microsoft.com/en-us/graph/api/chat-patch?view=graph-rest-1.0)

- [Structured system messages](https://learn.microsoft.com/en-us/graph/system-messages)
- [Message enum preference header](https://learn.microsoft.com/en-us/graph/api/resources/chatmessage?view=graph-rest-1.0)
