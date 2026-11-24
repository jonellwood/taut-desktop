# Files: OneDrive browsing and search

Development milestone, November 24, 2026. Existing delegated Files.ReadWrite covers the implemented reads; no new Graph scopes are requested. Uploads are a later milestone.

## Included

- Files rail opens the signed-in user's OneDrive root; folders, breadcrumb navigation, pagination, and sorting loaded items by name or modified date.
- Compact List view shows Name, Type, Modified and Size columns; Icons view uses a Finder-style grid with type-specific vector icons and filenames. Both keep Open/Download actions, folder-first sorting and responsive layout. The view choice is saved on this device.
- Filter loaded items by folders, documents, PDF, images, video, audio or archives. Filtering is local and explicitly limited to fetched items; Load more remains available. File type uses available MIME metadata and filename extension. No thumbnails or file-content requests are needed for icons.
- Search all of My OneDrive from Files, or search chats, mail and files together in unified search. Source errors and paging remain independent. File results show their folder and can navigate to the containing folder, open in the browser, or download.
- Explicit local Download with native Save dialog on macOS/Windows. Cancel saves nothing. First-pass limit is 100 MiB; larger files and remote/shared shortcuts offer browser opening.
- No auto-download, upload, delete, move, rename, sharing changes, or tenant-wide search. No automatic reading of chat/media history.

## Boundaries

Rust builds own-drive routes after `/me/drive`, constrains pagination to the same Graph route, and strips all download URLs from IPC responses. Search text is OData-escaped and URL-encoded. Only bounded metadata is sent to the frontend. Reads use GET.

Download metadata comes from Graph; temporary download URLs are used in Rust without an OAuth bearer header. HTTPS hosts and each redirect are restricted to supported Microsoft file hosts. Responses are bounded to 100 MiB, and downloads stage to a flushed temporary file beside the user-chosen destination before replacement. Account identity is checked before and after transfer. No partial bytes are committed on network failure. Existing platform Save dialog conventions are retained; no native Linux Save implementation yet.

Shared shortcuts are labeled, not followed as if owned by the user. Their browser links may be opened, but direct download/navigation is deferred. The collection of files shared across chats/mail will be a separate source; it is not equivalent to a user's own drive. Do not use the deprecated sharedWithMe endpoint.

## Validation and acceptance

Automated checks use mocked Graph/IPC only. Native tests cover own-drive routing, response sanitization, scope refusal, search escaping and continuation/download destination restrictions. Browser checks cover browsing, explicit local download, search without Mail consent, error/retry and navigation away. Frontend build/type checks run before delivery.

Manual acceptance: browse your actual root/subfolders; check folder pagination and search, compare against OneDrive web, explicitly download a small file and cancel another Save dialog, open a file in OneDrive, and confirm unified search returns the same file. No automated Microsoft 365 mutation or native Save dialog interaction is permitted.

References: [folder listing](https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0), [drive search](https://learn.microsoft.com/en-us/graph/api/driveitem-search?view=graph-rest-1.0), [download content](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0).
