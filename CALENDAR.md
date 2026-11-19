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
meeting edits/cancellations, Teams meeting links or calendar attachments yet.
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
