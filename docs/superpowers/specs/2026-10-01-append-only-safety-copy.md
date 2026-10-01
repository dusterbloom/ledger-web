# Append-only safety copy

**Date:** 2026-10-01
**Supersedes:** the Ledger parts of `2026-09-21-durable-autosave-design.md`

## Why

On 2026-09-24 a connected backup folder went from 3 fragments to 0: when disk and
browser differed, choosing *Cancel* wrote the (empty) browser state over
`latest.json`. Any design that rewrites the whole state can erase data the same
way. Locking editing until a folder is connected also made Ledger tiring to use.

## Rules

1. **Never locked.** Ledger is always editable. The browser (IndexedDB, written
   with `durability: "strict"`) is the working copy; `navigator.storage.persist()`
   is requested at startup.
2. **The safety copy only grows.** The folder holds `Ledger/ledger.jsonl`, one
   event per line: `keep` (full fragment), `delete`, `restore`. Ledger only ever
   appends to it. `Ledger/ledger.md` is a readable copy regenerated from it.
3. **Sync is a union.** Folding the log gives live and deleted ids. Sync adds disk
   fragments missing from the browser, appends events for browser changes missing
   from disk, and is idempotent. When the two disagree about a deletion, the
   fragment stays live: a deletion may come back, a note never vanishes.
4. **Tombstones are never purged** from the browser; they are hidden after the
   30-second Undo window and appended as `delete` events on the next sync.
5. **One click, remembered.** The folder handle is kept in IndexedDB. If the
   browser asks again, the next click or keypress in Ledger re-grants it. Picking
   a folder already named `Ledger` uses it directly (no `Ledger/Ledger`).
6. **Restore is the same button.** With no remembered folder and an empty
   browser, the button reads *Restore from safety copy…*; connecting merges the
   log back in.
7. **Old backups are folded in once.** If `ledger.jsonl` is empty, valid
   fragments from `latest.json` and `snapshots/*.json` are imported first.

## Non-goals

Cloud sync, conflict dialogs, read-back verification (`createWritable()` swaps
the file in atomically on `close()`), snapshot folders.
