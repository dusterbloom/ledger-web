# Ledger Web v2 Design

**Status:** Approved in conversation on 2026-09-01  
**Product:** Ledger, a private append-only fragment notebook  
**Delivery:** One self-contained `index.html`, usable offline in a browser

## Purpose

Ledger v2 should make capturing small pieces of text feel immediate and safe. It preserves the original application's quiet, single-purpose character while fixing its data-loss, security, scale, recovery, and cross-browser weaknesses.

The app is local-first in the literal sense: after the HTML file is present, normal use performs no network requests and requires no server, account, installation, build process, or dependency download.

## Product principles

1. **Capture first.** The composer is the primary control and saving requires one deliberate action.
2. **Append only.** Saved fragments cannot be edited. A correction is another fragment.
3. **Never silently lose text.** The composer clears only after a durable write succeeds.
4. **Offline means offline.** All runtime code and assets live in `index.html`.
5. **Portable by default.** The user can create a lossless JSON backup and a readable Markdown archive.
6. **Calm at every size.** The interface remains legible and usable on narrow phones, wide desktops, touchscreens, and keyboards.

## Scope

### Included in v2

- IndexedDB storage
- One-time migration from the original `ledger.fragments` localStorage value
- Append-only fragment capture
- Automatically recovered composer draft
- Case-insensitive multi-token search
- Immediate deletion with a persistent 30-second Undo window
- Lossless JSON backup and merge restore
- Chronological Markdown export
- Plain-text and Markdown import as new fragments
- Bounded DOM rendering for large collections
- Accessible feedback, focus, motion, and touch behavior
- Removal of the original cross-frame message bus
- Static GitHub Pages publication

### Deliberately excluded

- Editing saved fragments
- Accounts, sync, sharing, collaboration, or encryption
- RSS or other publishing feeds
- Murmurations integration
- Speech-to-text or model downloads
- Service workers, install prompts, manifests, frameworks, packages, and build tooling

Murmurations may be reconsidered in v3 as a discovery/index layer for a separately hosted public feed. It is not a storage or data-availability layer for v2.

## Repository and publication strategy

- The repository is named `ledger-web`.
- The original `ledger.html` from `OneFileApps.zip` is preserved byte-for-byte as `index.html` in the first commit on `main`.
- Design and planning documents live only on an unpushed internal branch.
- Product commits are applied to public `main` without `docs/`, `.superpowers/`, or other internal artifacts entering public history.
- GitHub Pages serves `index.html` directly from `main`.
- The deployed page must work without a runtime application server. A local static server is used only for browser testing where browser security rules make `file://` behavior differ.

## Information architecture

The page has four persistent areas:

1. A compact header with product name and actions.
2. A prominent multiline composer.
3. Search and result counts.
4. The fragment stream, grouped by local calendar day.

Transient feedback uses a status region or a single unobtrusive toast. Deletion feedback contains the Undo action and remaining opportunity without showing a distracting second-by-second countdown.

## Data model

IndexedDB database: `ledger-web`  
Schema version: `1`

### `fragments` object store

Key path: `id`

```text
{
  id: string,
  createdAt: number,
  text: string,
  source?: string,
  deletedAt?: number,
  undoUntil?: number
}
```

- `id` is generated with `crypto.randomUUID()` when available, with a timestamp-plus-random fallback for older browsers.
- `createdAt`, `deletedAt`, and `undoUntil` are integer Unix timestamps in milliseconds.
- `text` is the captured Unicode text with trailing whitespace removed. Leading whitespace and internal line breaks are preserved.
- `source` is optional user-visible provenance, primarily for imported files.
- A fragment with `deletedAt` is a temporary tombstone and is excluded from normal display and search.
- Indexes support newest-first creation order and cleanup by Undo expiry.

### `meta` object store

Key path: `key`; values use `{ key, value }` records.

Initial keys:

- `draft`: current unfinished composer text
- `localStorageMigration`: migration completion marker and result summary
- `schema`: application data-schema version

No preferences framework is introduced. Additional keys are added only when a shipped feature needs them.

## Storage lifecycle

### Startup

1. Open IndexedDB and create missing stores/indexes during upgrade.
2. Run the localStorage migration if no completion marker exists.
3. Permanently remove tombstones whose `undoUntil` has expired.
4. Load the draft and live fragments.
5. Render the first bounded batch and focus the composer on fine-pointer devices.

If IndexedDB is unavailable or blocked, the app enters a visible read-only recovery state. It may display data already loaded in the current session, but it must not pretend a write succeeded.

### Original-data migration

The legacy key is `ledger.fragments`, containing an array of records shaped like `{ id, at, text, src? }`.

- Validate the top-level value and each record.
- Preserve valid IDs when they are unique; generate an ID for missing or duplicate IDs.
- Map `at` to `createdAt`, `src` to `source`, and preserve text.
- Import all valid records and write the migration marker in one IndexedDB transaction.
- If the transaction fails, leave both IndexedDB and localStorage unchanged and offer Retry.
- Remove `ledger.fragments` only after the complete transaction is confirmed.
- A malformed legacy value is not deleted. Show a warning and allow the user to download the raw value before retrying or dismissing migration.
- Reopening the page is idempotent: a completed migration never runs twice.

### Append

- Enter inserts a newline in the multiline composer.
- `Command+Enter` on macOS and `Control+Enter` elsewhere appends.
- A visible Save control provides the equivalent touch/pointer action.
- Empty or whitespace-only input is not saved.
- The fragment write and draft clearing occur in one transaction.
- The composer UI clears only after transaction completion.
- On failure, the exact composer text remains visible and stored as the latest recoverable draft where possible. The UI explains that the fragment was not saved and offers Retry.

### Draft recovery

- Input changes schedule a short debounced write to `meta.draft`.
- Page hiding and loss of focus trigger an immediate best-effort flush.
- Reloading restores the draft exactly, including whitespace and line breaks.
- A successful append clears both the visible composer and persisted draft atomically.
- Draft persistence failure is announced once and does not erase the visible text.

### Delete and Undo

- Delete immediately removes the fragment from the visible stream.
- The same transaction sets `deletedAt = now` and `undoUntil = now + 30,000`.
- A toast offers Undo for that fragment.
- Undo clears both tombstone fields transactionally and restores the fragment to its chronological position.
- Reloading during the window reconstructs the Undo action from the tombstone.
- Expired tombstones are permanently removed at startup and during later successful write operations.
- If deletion fails, the fragment stays visible and an error is announced.
- If Undo fails, the tombstone stays recoverable until its original deadline and the user may retry.
- One toast represents the most recent deletion. Older unexpired deletions remain recoverable through a compact “Recently deleted” control so rapid consecutive deletes do not remove an Undo opportunity.

## Search and rendering

- Search splits the trimmed query on whitespace and lowercases tokens using the browser locale-neutral lowercase operation.
- A fragment matches only when every token occurs in its text or source.
- Search never includes tombstones.
- Results are newest first and remain grouped by local calendar day.
- Matching text is highlighted with DOM text nodes and `<mark>`; imported text is never interpreted as HTML.
- Search responds immediately from an in-memory collection loaded from IndexedDB.
- Render at most 100 matching fragments initially. A sentinel/Load more control adds the next 100 without creating thousands of DOM nodes.
- The visible count distinguishes matches shown from total matches when results are bounded.

This approach intentionally keeps search linear. A dedicated index is unnecessary until measured collections make in-memory search slow.

## Import and export

### JSON backup

The JSON document is versioned and contains the exact stored fields for all live fragments and all unexpired tombstones:

```text
{
  "format": "ledger-web",
  "version": 1,
  "exportedAt": 1788280000000,
  "fragments": [...]
}
```

The composer draft is excluded because importing it could overwrite current unsaved work. “Lossless” refers to all Ledger records and their timestamps, IDs, provenance, and pending Undo state.

### JSON restore

- Validate format, supported version, field types, timestamp ranges, and text before opening a write transaction.
- Existing records are never replaced or deleted.
- A missing ID is imported with a newly generated ID.
- A new ID is appended with its original fields.
- An existing ID with identical fields is skipped as a duplicate.
- An existing ID with different fields is skipped as a conflict and reported to the user.
- Expired tombstones in a backup are skipped so restore cannot resurrect a completed deletion.
- All accepted records are written in one transaction. A failure adds none of them.
- The completion message reports added, duplicate, invalid, and conflicting counts.

### Text and Markdown import

- Plain text and unrecognized Markdown are split on blank-line boundaries.
- Each non-empty block becomes a new fragment, keeping file order and using the file modification time as a starting timestamp with stable millisecond offsets.
- `source` records the imported filename.
- Import is transactional and reports its result.

### Markdown export

- Export live fragments only, oldest to newest.
- Group them under local-date headings and include local time.
- Preserve multiline text with readable indentation.
- Escape Markdown control characters where necessary so fragment content cannot alter archive structure.
- Use a date-stamped filename such as `ledger-2026-09-01.md`.

## Interaction and responsive behavior

- The composer and search field use at least 16px text on narrow screens to prevent unwanted mobile zoom.
- Tap targets are at least 44 by 44 CSS pixels where space permits.
- Layout respects safe-area insets and dynamic viewport units, with fallbacks.
- Long unbroken text wraps without widening the page.
- Fragment controls remain reachable without hover; fine-pointer devices may reduce their visual emphasis until focus/hover.
- Keyboard focus is always visible.
- `Escape` clears an active search first, then returns focus to the composer.
- `Command/Control+F` focuses Ledger search instead of opening a custom modal.
- Reduced-motion preferences disable nonessential transitions.
- High-contrast and forced-color modes retain readable borders, focus, and controls.
- Dates and times use the browser locale; stored timestamps remain locale independent.

## Accessibility

- Use native elements before ARIA: buttons, textarea, search input, headings, articles, and time elements.
- The composer has a persistent accessible label even if its visual design relies on placeholder text.
- Save, Delete, Undo, import, and export controls have unambiguous accessible names.
- A polite live region announces saves, search counts, imports, exports, and recoverable errors.
- Destructive and storage-failure messages are not conveyed by color alone.
- Focus remains predictable after save, delete, Undo, dialogs, and file selection.
- Day headings maintain a logical document outline.

## Error handling and recovery

Errors are actionable and specific without exposing implementation jargon:

- **Database blocked:** ask the user to close other Ledger tabs and retry.
- **Private/restricted storage:** explain that this browser is not allowing durable storage; keep composer text visible.
- **Quota reached:** refuse the write, retain the composer, and offer JSON/Markdown export. Never trim old fragments automatically.
- **Migration malformed:** preserve and offer the raw legacy data.
- **Migration failed:** preserve localStorage and offer Retry.
- **Import malformed/unsupported:** add nothing and explain the expected Ledger JSON or text formats.
- **Transaction failed:** leave prior durable state unchanged and make Retry possible.
- **Download blocked:** keep data unchanged and explain how to allow the download.

There is no silent in-memory persistence fallback. Such a fallback would make temporary data appear safely stored.

## Security and privacy

- Remove the entire original `postMessage` family bus and its wildcard origin behavior.
- Make no network requests during normal operation.
- Do not load remote fonts, scripts, styles, sounds, analytics, or favicons.
- Render all fragment and source content with text nodes, never `innerHTML`.
- Treat imported files and legacy localStorage as untrusted input.
- Add a restrictive Content Security Policy compatible with the single inline document and required blob downloads.
- Avoid exposing fragment content in URLs, document titles, console output, or thrown error messages.

## Browser support

Target current stable releases of:

- Chrome and Chromium-based browsers
- Safari on macOS and iOS
- Firefox

The app uses progressive enhancement for `crypto.randomUUID`, dynamic viewport units, and file picker conveniences. Core capture, storage, search, delete/Undo, and export rely only on broadly supported browser APIs.

Opening `index.html` directly should work in browsers that permit IndexedDB for `file://`. GitHub Pages is the canonical shareable experience and requires no application server.

## Verification strategy

Because the shipped app has no build system, verification also remains dependency-free where practical.

### Automated behavior checks

- Fresh database creation
- Append commits before composer clearing
- Failed append retains text
- Draft save, reload recovery, and atomic clearing
- Valid legacy migration and localStorage removal after commit
- Failed and malformed migration preservation
- Delete, Undo, reload during Undo, and expiry cleanup
- Consecutive deletion recovery
- Search token semantics and HTML-safe highlighting
- Initial and incremental render bounds
- JSON round trip preserving exact fragment fields
- Restore deduplication, conflicts, invalid rows, and all-or-nothing writes
- Markdown chronological ordering and escaping
- Cross-browser ID fallback

### Manual browser checks

- Chrome, Safari, and Firefox desktop
- Narrow phone and tablet viewport sizes
- Touch-only and keyboard-only operation
- Reload/crash simulation with a non-empty draft
- Reload inside and outside the deletion window
- Large seeded collection for scrolling, search, and DOM bounds
- Restricted/quota storage simulations
- Reduced motion, increased text size, and forced/high contrast where supported
- Direct-file and GitHub Pages operation
- Network panel confirms zero runtime requests
- Console remains free of errors

## Acceptance criteria

Ledger v2 is ready to publish when:

1. A user can capture, find, delete, undo, back up, restore, and export fragments without instructions.
2. No successful-looking action can lose composer text or existing fragments when storage fails.
3. Legacy Ledger data migrates exactly once and is removed only after confirmed success.
4. Undo remains available for the remainder of 30 seconds after reload.
5. JSON restore merges and deduplicates without replacing any existing record.
6. Large collections do not create an unbounded number of DOM nodes.
7. The original wildcard cross-frame API is absent.
8. The page makes zero runtime network requests.
9. Current Chrome, Safari, Firefox, and narrow mobile layouts pass the behavior checks.
10. Public Git history contains the original artifact and product work, but no internal design/planning artifacts.

## Future considerations

Only measured demand should open these decisions:

- Offline speech-to-text with a one-time local model download
- Encrypted export or local vault integration
- Device sync or conflict-free event history
- Public feeds and Murmurations-based discovery
- Full-text indexing beyond the current linear search

None of these should shape or complicate the v2 storage schema beyond retaining stable fragment IDs and timestamps.
