# Ledger Durable Autosave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a verified external JSON workspace mandatory before Ledger accepts mutations.

**Architecture:** Add small testable revision/envelope and filesystem-write helpers inside the existing single-file app. Keep IndexedDB as a cache; serialize complete-state writes to `Ledger/latest.json`, retain immutable snapshots, and gate mutation UI on a connected verified directory.

**Tech Stack:** HTML, browser JavaScript, IndexedDB, File System Access API, Web Crypto, Node test runner.

## Global Constraints

- No dependencies or native companion.
- Unsupported browsers are read-only.
- Never report saved before close and read-back validation.
- Never delete recovery snapshots in this release.
- Existing version-1 imports remain readable.

---

### Task 1: Durable revision envelope

**Files:** Modify `index.html`; test `tests/verify.mjs`.

**Interfaces:** Produce `canonicalFragments(rows)`, `digestText(text, subtle)`, `makeDurableBackup(rows, now, revision, digest)`, and `validateDurableBackup(value, now)`.

- [ ] Add a failing test with literal fixtures proving stable canonical ordering, schema version 2 metadata, digest rejection, and version-1 import compatibility.
- [ ] Run `node --test tests/verify.mjs`; confirm failure because the four functions are missing.
- [ ] Implement canonical JSON plus SHA-256 through injected `subtle.digest`; accept only exact v2 fields and reuse stored-record validation.
- [ ] Run `node --test tests/verify.mjs`; confirm green.
- [ ] Commit with `feat: add durable Ledger revisions`.

### Task 2: Verified filesystem writer

**Files:** Modify `index.html`; test `tests/verify.mjs`.

**Interfaces:** Consume v2 envelope; produce `writeVerifiedFile(handle, text)` and `createLedgerWorkspace(directory, now)` returning `{latest, snapshots}` handles.

- [ ] Add failing fakes that record `createWritable`, `write`, `close`, and `getFile`; prove read-back mismatch and rejected close fail.
- [ ] Run the focused Node test and confirm the missing writer failure.
- [ ] Implement write/close/read-back equality and directory creation for `Ledger`, `snapshots`, and `latest.json`.
- [ ] Run the focused test and full `node --test tests/verify.mjs`.
- [ ] Commit with `feat: verify Ledger disk writes`.

### Task 3: Serialized mirror and mutation gate

**Files:** Modify `index.html`; tests `tests/verify.mjs`, `tests/browser-harness.html`.

**Interfaces:** Produce `enqueueDurableState(rows)`, `connectWorkspace()`, and `durableState = {kind, directory, revision, queue}`.

- [ ] Add failing tests proving disconnected mutations are disabled, rapid revisions finish in order, failures lock editing, and stale completion cannot display saved.
- [ ] Run Node and browser export tests; confirm contract failures.
- [ ] Add a Connect backup control and four-state status; wire fragment keep/delete/undo/import/purge through one serialized complete-state mirror before success is announced.
- [ ] Run `node --test tests/verify.mjs` and `node tests/browser-smoke.mjs`.
- [ ] Commit with `feat: require Ledger disk backup`.

### Task 4: Startup recovery and snapshots

**Files:** Modify `index.html`, `README.md`; tests `tests/verify.mjs`, `tests/browser-harness.html`.

**Interfaces:** Produce `reconcileRevisions(disk, cache)` with literal outcomes `disk`, `cache`, `same`, `conflict` and `writeSnapshot(workspace, envelope)`.

- [ ] Add failing tests for disk-only, cache-only, equal, newer, divergent, malformed, and browser-storage-deleted cases.
- [ ] Run tests and confirm missing reconciliation behavior.
- [ ] Implement reconnect/startup reconciliation, immutable session/daily snapshots, and explicit conflict choice without overwriting either copy.
- [ ] Document workspace layout and recovery procedure.
- [ ] Run both complete suites and `git diff --check`.
- [ ] Commit with `feat: recover Ledger from disk`.

