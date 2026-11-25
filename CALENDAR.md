# Calendar

## First pass — approved 2026-11-12

The user approved delegated `Calendars.Read`. It reads the signed-in user's
calendar including event descriptions, attendees and response status. ReadBasic
excludes descriptions; no write, shared-calendar or application scope is added.
Entra consent and fresh interactive sign-in are required. Existing chat/mail
sessions remain usable without the calendar grant.

Three panes: date/range navigation, chronological agenda, selected event details.
Use calendarView so recurring occurrences and exceptions are included. Fetch only
on opening Calendar/navigation/explicit refresh; no event writes or RSVP sends.
Show recorded response, cancellation and organizer status. An unread invitation
is not an unanswered meeting. Outlook links are explicit and validated. Event
description previews are plain text; no remote content executes or loads.

Follow-up: meeting Mail reconciliation, RSVP/change response, creation/editing,
shared calendars and quiet refresh require separately scoped work. Do not infer
that every meeting update needs a new response.

References:
- https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/permissions-reference#calendarsread

Validation uses mocked Graph/IPC only; never launch the signed-in app or modify
real Microsoft365 data in automated tests.

## Invitation responses — approved 2026-11-12

User explicitly approved delegated `Calendars.ReadWrite` and confirmed tenant admin
consent. Added to requested OAuth scopes alongside Calendars.Read; fresh sign-in
is required. This grants calendar write access; this implementation uses only the
accept, tentativelyAccept and decline actions on the signed-in user's events.
No application or shared-calendar scopes are added.

Mail event messages resolve their Graph event relationship, then fetch current
calendar status. No subject matching. Previous start time is shown when Graph
provides it. Already answered meetings offer Change response. Read/unread and RSVP
remain separate. Calendar details use the same response component.

A modal reviews subject, time, response, optional note and whether to email the
organizer (on by default). Recurring occurrences affect only that occurrence;
series masters, cancelled events and organizer responses are blocked. A current
changeKey and matching account are verified before a single POST. HTTP 202 means
accepted for processing, not confirmed delivery. Read-only status refresh follows.
Persistent local attempt markers and a Rust process ledger prevent repeating an
uncertain attempt for the same event version. No automatic mutation retries.
If an attempt stays uncertain, use Outlook; a fresh event version can be reviewed.
No real tenant requests were used for automated validation.

- https://learn.microsoft.com/en-us/graph/api/eventmessage-get?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/event-accept?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/event-tentativelyaccept?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/event-decline?view=graph-rest-1.0

### Mail invitation navigation

Mail displays and refreshes recorded calendar status, then offers Respond in Calendar
(or View in Calendar for non-actionable events). This opens the exact Graph event,
selects its date and opens the Calendar details panel. RSVP review and sending now
live only in Calendar. Navigation and retry are read-only; existing uncertain-attempt
markers remain intact. No scope changes. The reported Mail HTTP 400 is not diagnosed
as a permission failure by this UI change.

## Room discovery — approved 2026-11-12

User explicitly approved adding delegated `Place.Read.All` to TAUT's requested
OAuth scopes and confirmed Entra admin consent. This reads organization places,
including room names, email addresses, room lists and available room metadata,
for the planned meeting composer and room picker. A fresh interactive sign-in is
needed to obtain the expanded grant. No application or place-write permission is
requested.

Meeting creation will use the already approved Calendars.ReadWrite permission;
room and attendee availability can use the existing calendar permissions. Rooms
must be invited as resource attendees from the organizer's calendar. Exchange
retains control of automatic acceptance, rejection and delegate approval. An
available slot is not a confirmed booking: show room requested until its response
confirms acceptance. Local drafting and room selection must not create events or
send invitations; creation requires explicit review and send. Automated tests
must use mocked Graph calls only.

The scope is used by the room picker described below.

References:
- https://learn.microsoft.com/en-us/graph/api/place-list?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/calendar-getschedule?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0

### Meeting composer and room picker — implemented 2026-11-12

Calendar now offers New meeting with an account-specific local draft, subject,
local start/end times, attendee email addresses, plain-text description, searchable
room metadata and paginated discovery. Dates convert explicitly to UTC for Graph.
Optional getSchedule checks are read-only and advisory; unknown/error results
never imply a free room. A changed time or attendee list invalidates the result.

Review displays the subject, times/time zone, recipients and requested room.
Only Create & send invitations posts to /me/events. Rust validates the payload,
checks the current account and scope, uses a transaction ID and guards against
repeat attempts. The local attempt marker survives restart; uncertain results
require checking Calendar/Outlook before discarding and creating a replacement.
Discarding a local draft never cancels an event. Successful creation opens event
details and refreshes the agenda. Resource attendees show requested/pending until
Exchange returns their response; room delegate approval remains with Exchange.

First pass: single-occurrence meetings, one room, up to 20 person addresses;
availability checks cover at most 20 addresses including the room. No recurrence,
Teams meeting links or calendar attachments yet. Organizer edits/cancellation were added in the follow-up below.
All automated creation/discovery tests use mocked requests, never the live tenant.

### Composer layout follow-up

The right details panel now shows the live draft summary: times, attendees,
selected room metadata and advisory availability. The workspace panel toggle and
close controls apply to this summary. Attendees reuse Mail's keyboard-accessible
autocomplete against the account's cached People directory; manual addresses
remain supported. Changing time, attendees or room invalidates old availability.

User verified free/busy checks and creation without a room against their tenant.
Actual room booking was manually tested and confirmed successful by the user on November 19, 2026. Automated follow-up validation:
22 mocked Calendar/meeting browser checks in Chromium and WebKit, UI TypeScript
check and production build passed (three existing App accessibility warnings).


## Mail/Calendar response reconciliation — November 19, 2026

Expanded meeting mail now classifies invitation/update, cancellation and response messages using Graph metadata. Historical request details (outdated flag, previous start/end/location and response-request flag) are kept separate from the freshly read calendar event. Superseded mail, response receipts, answered events and events without a requested response do not offer a new-response prompt. Mail offers View in Calendar for those events; Calendar retains explicit Change response for answered, eligible events. No subject matching, unread-state inference, changeKey-based attention, notification feed or sender-wide state is added.

Mail Refresh and Calendar Refresh now refresh their open response cards as well as lists. Returning focus/visibility to an open card checks its current status unless a response is being edited or sent. Failed reads leave old status non-actionable until a successful refresh. Event version/account mutation guards remain in Rust.

After an accepted RSVP request, TAUT immediately reads calendar status and makes at most three follow-up reads after 2, 5 and 10 seconds, stopping on the requested recorded status. Navigation/unmount cancels scheduled checks; hidden pages do not continue them. HTTP 202 is still submission acceptance, not delivery. If confirmation does not appear, TAUT says so and offers manual status refresh; it never repeats the write. Existing attempt locks survive uncertain outcomes.

Meeting response/cancellation mail can retain its classified card even if its associated event is absent or unavailable; TAUT does not infer the user's RSVP from an acceptance email. Teams meeting association and a future unified attention feed remain separate work.

References: https://learn.microsoft.com/en-us/graph/api/resources/eventmessagerequest?view=graph-rest-1.0 and https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0.


## Organizer editing and cancellation — November 20, 2026

Calendar details offer Edit meeting and Cancel meeting for active single meetings the signed-in user organizes. Recurring events remain in Outlook. Local drafts survive closing/reopening; a review is required before sending updates or cancellation, including an optional cancellation note. Only changed fields are patched. Existing optional attendees, resource attendees, names and untouched descriptions are preserved. Formatted/online descriptions support an appended note instead of replacement, preserving the original meeting content. A room change is explicit; keeping the same room sends no room change. Multiple rooms/locations and all-day time changes stay in Outlook.

Rust uses the existing approved Calendars.ReadWrite permission, rereads identity and the event, checks organizer eligibility and changeKey, and forwards an available ETag for updates. This preflight does not make cancellation atomic with concurrent Outlook edits. Cancellation uses POST /me/events/{id}/cancel, never DELETE; 202 means submitted, not confirmed delivery. Neither mutation is automatically retried. Account/event/version attempt locks persist locally, with an additional native process guard; uncertain outcomes require checking Outlook. Preflight rejection preserves the draft and sends nothing. These locks are local safety guards, not server idempotency guarantees.

User confirmed incoming invitations from another person can be accepted successfully, and organizer cancellation appeared in both the email subject/status and Calendar. New organizer editing/cancellation awaits deliberate manual testing. Automated tests use mocked IPC/Graph only.

References: https://learn.microsoft.com/en-us/graph/api/event-update?view=graph-rest-1.0 and https://learn.microsoft.com/en-us/graph/api/event-cancel?view=graph-rest-1.0.


## Calendar alpha acceptance

Automated checks use mocked Graph/IPC. The user performs the following deliberate live checks on a disposable single meeting they organize:

1. Create a test meeting with a room; confirm Outlook receives the invitation and the room reports accepted or declined correctly.
2. Edit its subject and time, review the changes, then send. Confirm the same event changes in Outlook and the room's new response appears after refreshing meeting status. A changed room/time still needs its own booking response.
3. Add an optional attendee or change the room; confirm the review and resulting Outlook attendee types/location. Keep an existing Teams/formatted description intact; an appended note must preserve its original join content.
4. Start another edit, choose Save & close, then reopen: the draft should return without sending. Choose Keep editing in the review to verify no update is submitted.
5. Cancel the disposable meeting with a note, review, and confirm once. Check Outlook and the attendee/room cancellation. TAUT reports submission until Microsoft 365 reconciles; use Refresh calendar if needed.

Incoming invitation acceptance, organizer cancellation received through Mail/Calendar, and initial room booking have already been user-validated. New organizer edits/cancellation remain pending live acceptance. Recurring events can be viewed/responded to where eligible, but creating/editing/cancelling recurring meetings remains in Outlook. Creating Teams meeting links is deferred; existing online meeting descriptions are protected. These limitations do not block the focused desktop alpha.


User confirmed organizer meeting edits passed live testing. TAUT-initiated organizer cancellation remains pending live acceptance. Organizer attendee rows display Organizer · No RSVP needed using organizer email identity, rather than interpreting Graph's none status as an unanswered RSVP or manufacturing accepted. See https://learn.microsoft.com/en-us/graph/api/resources/responsestatus?view=graph-rest-1.0.


Organizer cancellation live follow-up: user observed the event removed in TAUT and later Outlook, matching the cancel action's Deleted Items behavior. Cancellation delivery to attendees remains unverified. A separate native workspace-switching issue is under investigation; mocked development and production navigation regressions currently pass.

## Shared mailbox calendar views — November 25 (development)

Implemented the approved My view / temporary Focus controls. Larger labeled visibility switches persist selected calendar IDs per account on this device (up to 12). Separate Focus buttons toggle focus off as well as on; the banner also returns to My view. Entering focus snapshots date, range, selected event, detail visibility and agenda scroll; switching between focused calendars does not replace that snapshot. Date/range navigation and meeting creation stay disabled during focus so the original view remains intact.

Read-only discovery uses `/me/calendars` and reads `/me/calendars/{id}/calendarView` under the existing Calendars.Read / Calendars.ReadWrite consent. The default calendar retains its existing `/me/calendarView` path and existing create/edit/RSVP behavior. Other calendars remain read-only in TAUT even when Microsoft grants edit access; their events never mount MeetingResponse or invoke primary-calendar edit actions. Reminders and composer conflict checks remain primary-calendar-only. No OAuth scopes were added.

Microsoft documents that shared calendars exposed in a recipient mailbox can be read using these existing permissions. Direct access through another owner's `/users/{owner}/calendar` requires Calendars.Read.Shared (or its write counterpart) and is **not** implemented/requested here. Accept/add calendars through Outlook first; listing is limited to what Graph exposes, not an assertion that every Outlook shared/resource/group calendar will appear. Directory-based owner lookup, direct-owner access and busy-only schedule discovery remain follow-ups requiring separate design/permission approval.

Each source has independent loading, error, paging and retry states. Source IDs plus event IDs form UI identity; no subject-based deduplication across mailboxes. New calendars start hidden. Missing/denied calendars do not imply free time. Calendar ownership/name labels and stable theme-aware color accents accompany events. Paging URLs are bound to their exact Graph calendar route; ranges are bounded to 32 days. Current calendar metadata is re-read before each secondary event page. Private events are reduced to Busy/time/status fields unless canViewPrivateItems explicitly allows details. Refresh failure clears stale selected secondary details. Access checks are read-only; no test mutates Microsoft 365.

Validation: production frontend build/UI type check, 118 Node tests and 276 Rust tests passed. Initial changed Calendar/editor browser run passed 84 checks; final privacy/refresh Calendar regression run passed 50 Chromium/WebKit checks, including new shared visibility, source-scoped identity, read-only controls, both focus exits/date/scroll/selection restoration, persistence, paging, denied access and clearing stale details. Native tenant discovery/manual acceptance pending. Restart local dev app for the new commands; no installer build.

Sources: https://learn.microsoft.com/en-us/graph/outlook-get-shared-events-calendars and https://learn.microsoft.com/en-us/graph/api/resources/calendar?view=graph-rest-1.0

### Next discovery scope and permission review

User identified missing sources: Michael Gaskins (person), IT Admin, IT Development and Library Team - IT (likely Teams-backed Microsoft 365 groups). County Store and Dashboard are explicitly excluded; additional mailbox/account support is separate.

For Teams-backed groups, reuse `/me/joinedTeams` under existing Team.ReadBasic.All to obtain verified IDs/names, and load selected sources through `/groups/{id}/calendarView`. Microsoft's current v1.0 permission table includes existing Calendars.Read/Calendars.ReadWrite for that read. This does not establish tenant acceptance: denied/unavailable groups must show an independent access error, never empty/free availability. Non-Teams groups require separate discovery; do not add Group.Read.All merely to enumerate these three candidates. Group routes are not implemented yet.

For a person's primary calendar missing from the recipient list, provide explicit directory selection and read `/users/{verified-id}/calendar` and its calendarView. Microsoft documents delegated Calendars.Read.Shared for this route. Proposed additional scope is **Calendars.Read.Shared only**, allowing reads of calendars already shared/delegated to the signed-in user; no shared write scope, tenant-wide application permission, or creation of calendar shares. User approval is required before adding the scope; currently pending. Keep secondary sources view-only, source-bound paging/private-item redaction and existing My view/Focus restoration. No reminders or writes for these sources.

References checked November 25: https://learn.microsoft.com/en-us/graph/api/user-list-joinedteams?view=graph-rest-1.0 and https://learn.microsoft.com/en-us/graph/api/group-list-calendarview?view=graph-rest-1.0 .


### November 25 — People and Teams calendar expansion (development)

User explicitly approved delegated Calendars.Read.Shared and is updating Entra consent. Added that single scope to the authorization request. No shared write or group-directory scope added. Existing signed-in sessions need a fresh sign-in after consent; merely rebuilding does not add a scope to an existing access token.

Added Teams calendars from bounded `/me/joinedTeams` discovery (10 pages / 1,000 sources), with membership reverified on each `/groups/{id}/calendarView` read. The Teams calendars start hidden. Group calendar support under existing calendar permissions follows the current v1.0 table and still needs manual tenant verification; HTTP errors are independent of primary/calendar-list results. Non-Teams group discovery is deferred.

Added explicit coworker search and Add calendar: verified directory ID plus owner calendar read, no sharing invitation or server change. Up to 24 selected person IDs persist per account locally; names and access are resolved again on reopen. Remove from TAUT affects only local selection. Persons start hidden; enabling or Focus loads their events. Route-prefixed source IDs separate mailbox/person/group events. Metadata and page continuations are bound to the chosen route, private details remain redacted without explicit permission, group private events are conservatively redacted, and refresh/access errors clear selected secondary details. County Store/Dashboard accounts remain excluded. All secondary events stay view-only; reminders remain primary-only.

Automated tests use mocked IPC/HTTP only. Manual acceptance: restart dev app, sign out/in after Entra consent, use Add a person’s calendar to find Michael Gaskins, then enable/Focus; confirm IT Admin, IT Development and Library Team - IT under Teams calendars and open their events. Verify existing sharing restrictions and My view restoration. No installer build requested.

Expansion validation: frontend build and UI TypeScript checks passed (three existing App.svelte accessibility warnings); 118 Node tests, 279 Rust tests and 56 Chromium/WebKit Calendar/shared regressions passed. Visually inspected the people/Teams picker and read-only group details screenshot. No real Microsoft 365 calls or mutations during automated checks. Native source availability remains unverified.


### November 25 — Cards / Agenda presentation

Calendar defaults to Cards: responsive one/two/three-column event cards grouped under readable day headings and event counts. Agenda is a compact row alternative with time, title/location, source and recorded status. Both use the same loaded events and source-scoped identity; changing layout performs no Graph reads or writes, preserves selection/details/date/visible calendars/Focus, and anchors the currently visible event when possible. Layout preference is device-local (`taut-calendar-layout`), safely falling back to Cards when unavailable. Existing per-account calendar visibility is separate. Titles wrap; narrow Agenda rows stack. Calendar labels/colors, all-day/cancellation/read-only/overlap information and existing details actions are retained. No additional permissions or installer build.
