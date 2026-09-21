# Durable autosave design

**Date:** 2026-09-21  
**Projects:** Ledger and Plaintext Web  
**Status:** Approved for implementation planning

## Goal

Users must not lose their work when Chrome clears, migrates, corrupts, or replaces
site storage. Browser-owned storage is a working cache. A user-selected location
on the local filesystem is the durable source of truth.

This design targets installed Chrome apps and browsers that implement the File
System Access API. A browser that cannot write to a user-selected location cannot
provide the required guarantee and must remain read-only.

## Shared durability contract

1. Editing is locked until the user selects or reconnects a durable backup
   directory.
2. The directory selection is initiated by an explicit user action, as required
   by browser security.
3. Every persisted revision has a stable revision ID, timestamp, schema version,
   and content digest.
4. A revision is reported as saved only after the external write is closed and
   verified and the browser cache records the same revision.
5. The UI always exposes one of four states: `Connecting`, `Saving`, `Saved to
   disk`, or `Backup disconnected`.
6. Permission loss or an I/O failure immediately changes the state to `Backup
   disconnected`; further edits are locked until reconnection.
7. On startup, the app compares valid disk and browser revisions. It restores the
   newer revision when ancestry is clear. Divergent revisions are presented to
   the user; neither copy is overwritten silently.
8. Immutable recovery snapshots are created at session start, before conflict
   resolution, and at least daily while changes continue. The first release does
   not delete snapshots automatically.
9. Manual export remains available as an additional portable backup mechanism.

The directory handle may be cached in IndexedDB for convenience. Losing browser
storage can therefore require the user to select the directory again, but it
cannot destroy the external files.

## Ledger layout and behavior

The selected directory contains:

```text
Ledger/
  latest.json
  snapshots/
    2026-09-21T19-30-00.000Z-<revision>.json
```

`latest.json` uses Ledger's portable backup envelope, extended with revision and
digest metadata. Snapshots use the same format. Existing version-1 imports remain
readable; the durable writer emits the new version.

Creating, deleting, undoing, importing, or purging a fragment produces a complete
immutable state revision. Writes are serialized. A newer edit cannot be marked
saved by completion of an older write. A committed external revision is written
using `createWritable()` and becomes authoritative only after `close()` succeeds
and a read-back validates its envelope and digest. IndexedDB is then updated to
the same revision. If either side fails, the UI does not claim success and startup
reconciliation preserves both valid copies.

The composer draft remains a draft and may use browser storage between keystrokes.
Keeping a fragment is disabled without a connected backup and is acknowledged
only after durable persistence. Import never replaces a valid disk copy before a
pre-import snapshot has been verified.

## Plaintext Web contract

Plaintext Web implements the same contract in its own repository. Its selected
workspace contains a human-readable Markdown document and recovery metadata with
immutable Markdown snapshots. The document UI may update immediately while
typing, but it must never display `Saved to disk` until the debounced disk write
closes successfully. Navigation and visibility changes trigger an immediate flush
attempt.

## Recovery and conflicts

Startup considers four cases:

- Disk only: restore disk into the browser cache.
- Browser only: require a directory, snapshot the browser revision, then write it
  to disk before enabling edits.
- Same revision: open normally.
- Different revisions: preserve both, show timestamps and summaries, and require
  an explicit choice or merge.

Malformed or digest-invalid files are never imported automatically. They remain
untouched for manual recovery. A valid snapshot can restore `latest.json`, but
restoration first snapshots every valid conflicting state.

## Tests

Implementation follows red-to-green TDD. Automated tests cover:

- first launch and reconnection gating;
- unsupported File System Access API behavior;
- successful dual persistence and truthful status transitions;
- rapid edits and out-of-order write completion;
- permission revocation and external I/O failure;
- interruption before `close()` and failed read-back validation;
- browser storage deletion followed by disk restoration;
- disk deletion with a valid browser revision;
- equal, newer, stale, divergent, malformed, and digest-invalid revisions;
- pre-import and daily snapshot creation;
- existing version-1 import compatibility;
- multi-tab writes without lost updates;
- page-hide and visibility flush behavior.

Browser-level tests use fake filesystem handles for deterministic failure cases
and a real temporary directory where the harness supports it. Existing persistence,
import, export, deletion, and recovery suites remain green.

## Non-goals

- Cloud synchronization.
- Silent writes without user-granted filesystem access.
- Treating OPFS, IndexedDB, localStorage, or Cache Storage as backups.
- Automatic snapshot deletion in the first release.
- A native companion process or browser extension.
