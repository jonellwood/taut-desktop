# Files: OneDrive browsing and search

Development milestone, November 24, 2026. Existing delegated Files.ReadWrite covers the implemented reads; no new Graph scopes are requested. Reviewed small-file uploads are now implemented in development.

## Included

- Files rail opens the signed-in user's OneDrive root; folders, breadcrumb navigation, pagination, and sorting loaded items by name or modified date.
- Compact List view shows Name, Type, Modified and Size columns; Icons view uses a Finder-style grid with type-specific vector icons and filenames. Both keep Open/Download actions, folder-first sorting and responsive layout. The view choice is saved on this device.
- Filter loaded items by folders, documents, PDF, images, video, audio or archives. Filtering is local and explicitly limited to fetched items; Load more remains available. File type uses available MIME metadata and filename extension. No thumbnails or file-content requests are needed for icons.
- Search all of My OneDrive from Files, or search chats, mail and files together in unified search. Source errors and paging remain independent. File results show their folder and can navigate to the containing folder, open in the browser, or download.
- Explicit local Download with native Save dialog on macOS/Windows. Cancel saves nothing. First-pass limit is 100 MiB; larger files and remote/shared shortcuts offer browser opening.
- No auto-download, delete, move, existing-file rename, sharing changes, or tenant-wide search. No automatic reading of chat/media history.

## Boundaries

Rust builds own-drive routes after `/me/drive`, constrains pagination to the same Graph route, and strips all download URLs from IPC responses. Search text is OData-escaped and URL-encoded. Only bounded metadata is sent to the frontend. Reads use GET.

Download metadata comes from Graph; temporary download URLs are used in Rust without an OAuth bearer header. HTTPS hosts and each redirect are restricted to supported Microsoft file hosts. Responses are bounded to 100 MiB, and downloads stage to a flushed temporary file beside the user-chosen destination before replacement. Account identity is checked before and after transfer. No partial bytes are committed on network failure. Existing platform Save dialog conventions are retained; no native Linux Save implementation yet.

Shared shortcuts are labeled, not followed as if owned by the user. Their browser links may be opened, but direct download/navigation is deferred. The collection of files shared across chats/mail will be a separate source; it is not equivalent to a user's own drive. Do not use the deprecated sharedWithMe endpoint.

## Validation and acceptance

Automated checks use mocked Graph/IPC only. Native tests cover own-drive routing, response sanitization, scope refusal, search escaping and continuation/download destination restrictions. Browser checks cover browsing, explicit local download, search without Mail consent, error/retry and navigation away. Frontend build/type checks run before delivery.

Manual acceptance: browse your actual root/subfolders; check folder pagination and search, compare against OneDrive web, explicitly download a small file and cancel another Save dialog, open a file in OneDrive, and confirm unified search returns the same file. No automated Microsoft 365 mutation or native Save dialog interaction is permitted.

References: [folder listing](https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0), [drive search](https://learn.microsoft.com/en-us/graph/api/driveitem-search?view=graph-rest-1.0), [download content](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0).

## Reviewed uploads

Choose or drop up to five individual files, at most 10 MiB each and 25 MiB total. Selection is local/in-memory. Uploads are available in a browsed own-drive folder, not search results or shared shortcuts. Review lists the exact destination, selected files and duplicate-name policy. Files inherit the destination folder’s existing access; TAUT does not alter sharing.

Explicit Upload files sends one file at a time using an authenticated Graph createUploadSession call and 1.25 MiB fragments to a validated preauthenticated Microsoft URL without OAuth headers. Keep both requests server-side rename; Stop on conflict requests fail. Replacing an existing file is not offered. Account identity is verified before each chunk; completion requires verified item metadata/size. A progress command reports acknowledged bytes without exposing session URLs. No write is retried automatically.

Before a write, a per-account local attempt marker is saved (ID/name only, no bytes or URLs). If the UI reloads or a response is lost, it checks the native attempt status rather than repeating the upload. Confirmed completion removes that file from the queue. Unconfirmed completion requires checking OneDrive before explicitly starting another attempt. Batches stop on the first failure and retain unattempted selections while the view remains open. File contents/selections are not persisted or automatically resumed across app restart; abandoned upload sessions expire server-side. Leaving Files does not cancel an in-flight file, but no additional batch files begin after the view is destroyed.

Automated coverage uses mocks only: local selection/drop, review cancellation, destination/conflict choice, single submission, progress, partial batches, reload/lost-response recovery and local-storage failure. Rust tests cover input limits, host checks, sequential ranges, confirmed size, duplicate attempt exclusion and no automatic retries. The user confirmed a successful manual upload on November 24; no automated live upload was made.


## Folder creation and Recently added

Recently added sorts loaded items by OneDrive `createdDateTime`, newest first, with folders first and missing dates last. It does not claim to track when an existing file was moved into this folder.

New folder opens a dialog showing the current own-drive destination and editable name. Explicit Create folder performs one Graph POST under the existing Files.ReadWrite consent. The backend verifies the signed-in account and own-drive parent, refuses shared shortcuts, and uses conflictBehavior=fail: duplicate names are never replaced or renamed. Unconfirmed responses require checking/refreshing OneDrive; no automatic retry. New folders inherit existing destination access. Delete and sharing remain roadmap items.

Validation: four mocked Rust folder tests, six Chromium/WebKit folder/sorting checks, existing browse/upload regression checks, Node sorting tests, frontend build and type checks. Manual new-folder acceptance remains pending. No installer build or live Microsoft 365 write was performed by automation.

## Reviewed deletion and selection — development

Files supports checkboxes, Shift-click ranges, Clear selection and Select all loaded items in the current filtered view (up to 100). Selection clears on navigation/refresh and hidden items are removed when filtering. Shared shortcuts are excluded. Unified search remains read-only until opening Files.

Delete selected shows exact names and locations. Folder review explicitly warns that all contents, including unlisted files/subfolders, are included. This uses Graph's ordinary [Recycle Bin deletion](https://learn.microsoft.com/en-us/graph/api/driveitem-delete?view=graph-rest-1.0), under existing Files.ReadWrite. Restore remains in OneDrive and is subject to organization retention.

Before writes, Rust verifies own account/drive, current item name/type/version and bounded parent ancestry. Root and remote items are refused. A selected descendant is covered by its selected folder; it is never independently deleted. Each DELETE uses If-Match and no lock bypass, permanent-delete endpoint or automatic retry. The account is rechecked before each write. Per-item success/failure is reported; failed/unconfirmed items remain selected. An uncertain write stops the remaining writes and requires checking/refreshing OneDrive before another explicit attempt. There is no persistent automatic batch replay.

Automated tests use only mocked Graph/IPC: review/cancel, folder warning, ranges/list/icons, filters, partial batches, uncertain response, version/account/root/shortcut refusals and ancestor deduplication. Manual deletion acceptance is pending; use disposable test items. No installer build was triggered.

## Share via Email or Chat (development)

Select 1–5 own-drive files/folders and choose Share selected. Email supports up to 25 verified coworkers selected from the directory; Chat targets an existing loaded conversation and reviews every current participant. New chats and guest/external recipients are outside this first version. Sharing folders includes their contents, stated before confirmation.

Review performs reads only: current own account/drive, item identities/versions, recipient profiles and permissions. Native memory holds the reviewed plan and item URLs; IPC exposes names, recipients and proposed view grants only. Plans expire after ten minutes and are single-use. Existing direct edit access is preserved; missing named-recipient access is granted read-only with requireSignIn=true, sendInvitation=false and inherited access retained. No public or organization-wide link is created. Links point to the existing originals; files are not copied or uploaded.

Explicit Share and send revalidates account, item versions and chat membership, grants access, verifies every recipient, then submits one email or existing-chat message. No automatic retry. Partial access grants remain if delivery fails; the UI explains that sharing or delivery may already have occurred and requires a new explicit review. Existing permission scopes suffice. No automated live Microsoft 365 changes were performed. Manual email/chat recipient-open acceptance is pending.

Reference: [Microsoft Graph named-recipient sharing](https://learn.microsoft.com/en-us/graph/api/driveitem-invite?view=graph-rest-1.0).

## Persistent selection details

Files now uses a right-hand Selection details panel with selected names, type/size, single-item modified date, per-item deselection, Share, Delete and Clear. The selected-item list scrolls independently of both the actions and the main browser. The workspace details toggle hides/shows it; choosing another item opens it. Loading another page preserves existing selection; refresh/navigation clears selection, and filtering removes hidden selections. In narrow windows the panel becomes a compact lower section. Existing review/send/delete operations are unchanged.
