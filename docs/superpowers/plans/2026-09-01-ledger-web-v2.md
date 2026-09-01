# Ledger Web v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the original Ledger with a reliable, accessible, self-contained offline app using IndexedDB, crash-safe capture, reload-safe deletion Undo, portable backups, and bounded rendering.

**Architecture:** Production remains one `index.html` containing all HTML, CSS, fonts, and JavaScript. A small dependency-free Node verification script checks pure logic and release invariants, while a browser harness drives the real page in headless Chromium to verify IndexedDB and reload behavior. Internal design/plan documents remain on `design/ledger-v2`; only product and test commits are applied to public `main`.

**Tech Stack:** HTML5, CSS, vanilla JavaScript, IndexedDB, File/Blob APIs, Node.js built-ins (`node:test`, `assert`, `http`, `child_process`), headless Chromium.

## Global Constraints

- The shipped app is one self-contained `index.html`.
- Normal use performs zero network requests and requires no server, account, installation, package download, framework, build tool, or service worker.
- Saved fragments are immutable; correction means appending another fragment.
- Never clear visible composer text before its durable IndexedDB transaction succeeds.
- IndexedDB database name is `ledger-web`, version `1`.
- IDs use `crypto.randomUUID()` with a timestamp-plus-random fallback.
- Delete is immediate with a persistent 30,000ms Undo window.
- JSON restore merges and deduplicates; it never replaces or deletes existing records.
- Search and display exclude tombstones and render in batches of 100.
- Treat legacy storage, imported files, fragment text, and source labels as untrusted input.
- Current stable Chrome/Chromium, Safari/iOS Safari, and Firefox are target browsers.
- Public history must not contain `docs/`, `.superpowers/`, or internal planning artifacts.
- Do not simplify away storage error handling, migration rollback, accessibility, or input validation.

## File structure

- Modify: `index.html` — complete production application and embedded legal notices.
- Create: `tests/verify.mjs` — dependency-free static checks and tests for pure data/search/import/export helpers extracted from `index.html`.
- Create: `tests/browser-harness.html` — same-origin UI/IndexedDB/reload scenarios executed inside Chromium.
- Create: `tests/browser-smoke.mjs` — temporary local HTTP server and Chromium runner for the browser harness.
- Create: `README.md` — purpose, use, privacy, keyboard controls, backup instructions, original-project credit, and demo link.
- Create: `LICENSE` — MIT license for this adaptation.
- Create: `THIRD_PARTY_NOTICES.md` — Plaintext inspiration and bundled-font notices.
- Create: `ThirdPartyLicenses/Literata-OFL.txt` — Literata license text.
- Create: `ThirdPartyLicenses/WorkSans-OFL.txt` — Work Sans license text.

---

### Task 1: Release invariants and safe application shell

**Files:**
- Create: `tests/verify.mjs`
- Modify: `index.html`

**Interfaces:**
- Consumes: the original single-file Ledger on `main` commit `361df21`.
- Produces: one parseable offline page with required semantic elements; `extractTestableLogic(html, names)` for later pure-logic tests.

- [ ] **Step 1: Write the failing release-invariant tests**

Create `tests/verify.mjs` using only Node built-ins. Include helpers that read `index.html`, extract its one inline script, and evaluate code between `/* @testable:start */` and `/* @testable:end */`.

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appPath = resolve(root, "index.html");
const readApp = () => readFileSync(appPath, "utf8");

function inlineScript(html) {
  const matches = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(matches.length, 1, "expected one inline application script");
  return matches[0][1];
}

function extractTestableLogic(html, names) {
  const match = html.match(/\/\* @testable:start \*\/([\s\S]*?)\/\* @testable:end \*\//);
  assert.ok(match, "testable logic block missing");
  return new Function(match[1] + "; return { " + names.join(", ") + " }; ")();
}

test("release is one offline HTML file with no cross-frame API", () => {
  const html = readApp();
  const script = inlineScript(html);
  assert.doesNotMatch(html, /<(?:script|link|img|audio|video|source)\b[^>]*(?:src|href)\s*=\s*["']https?:/i);
  assert.doesNotMatch(html, /url\(\s*["']?https?:/i);
  assert.doesNotMatch(script, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b|sendBeacon/);
  assert.doesNotMatch(script, /postMessage|addEventListener\(["']message/);
  assert.doesNotThrow(() => new Function(script));
});

test("capture, search, stream, status, and recovery controls are semantic", () => {
  const html = readApp();
  for (const id of ["entry", "save", "search", "stream", "status", "recentlyDeleted"]) {
    assert.match(html, new RegExp('id="' + id + '"'), id + " missing");
  }
  assert.match(html, /<label[^>]*for="entry"/);
  assert.match(html, /aria-live="polite"/);
});
```

- [ ] **Step 2: Run the tests and verify the original fails**

Run: `node --test tests/verify.mjs`  
Expected: FAIL because the original contains `postMessage`, lacks the new controls/status region, and has no testable block.

- [ ] **Step 3: Replace the shared app framework with the minimal Ledger shell**

Keep the embedded fonts and visual character, but remove all generic dialogs, command palette, settings, family-bus code, memory storage fallback, and unused helpers. Build the page around these exact persistent elements:

```html
<header class="topbar">
  <h1>Ledger</h1>
  <div class="actions">
    <button id="import" type="button">Import</button>
    <button id="exportJson" type="button">Backup</button>
    <button id="exportMarkdown" type="button">Markdown</button>
  </div>
</header>
<main class="wrap">
  <section id="compose" aria-labelledby="composeLabel">
    <label id="composeLabel" for="entry">New fragment</label>
    <textarea id="entry" rows="1" placeholder="What just occurred to you?"></textarea>
    <div class="composeFoot">
      <span>⌘/Ctrl + Enter to keep</span>
      <button id="save" type="button">Keep</button>
    </div>
  </section>
  <label class="searchLabel" for="search">Search fragments</label>
  <input id="search" type="search" autocomplete="off" spellcheck="false">
  <p id="counts" aria-live="polite"></p>
  <div id="stream"></div>
  <button id="loadMore" type="button" hidden>Load more</button>
</main>
<div id="status" role="status" aria-live="polite" aria-atomic="true"></div>
<aside id="undoToast" hidden>
  <span id="undoMessage"></span><button id="undo" type="button">Undo</button>
</aside>
<button id="recentlyDeleted" type="button" hidden>Recently deleted</button>
<dialog id="deletedDialog" aria-labelledby="deletedTitle"></dialog>
<input id="fileInput" type="file" accept=".json,.md,.txt,application/json,text/plain" hidden>
```

Add an empty `/* @testable:start */ ... /* @testable:end */` block inside the single inline script. Do not add another production file or external asset.

- [ ] **Step 4: Add baseline responsive and accessibility CSS**

Preserve the existing palette and typography while adding:

```css
:root{color-scheme:light dark}
html,body{min-height:100%;min-height:100dvh}
body{margin:0;overflow:hidden}
button,input,textarea{font:inherit;color:inherit}
button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
#entry,#search{font-size:max(16px,1rem)}
.wrap{padding-left:max(18px,env(safe-area-inset-left));padding-right:max(18px,env(safe-area-inset-right))}
.body{white-space:pre-wrap;overflow-wrap:anywhere}
@media (pointer:coarse){button{min-width:44px;min-height:44px}.drop{opacity:1}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
@media (forced-colors:active){button,input,textarea,.frag{border:1px solid CanvasText}}
```

- [ ] **Step 5: Run the invariant tests**

Run: `node --test tests/verify.mjs`  
Expected: PASS for both initial tests.

- [ ] **Step 6: Commit the safe shell**

```bash
git add index.html tests/verify.mjs
git commit -m "refactor: reduce Ledger to a safe offline shell"
```

---

### Task 2: Pure model rules and IndexedDB persistence

**Files:**
- Modify: `index.html`
- Modify: `tests/verify.mjs`

**Interfaces:**
- Produces pure helpers: `makeId(now, randomUUID, random) -> string`, `normalizeText(value) -> string`, `normalizeLegacyRecord(value, usedIds, now) -> Fragment|null`, `isLive(fragment) -> boolean`.
- Produces storage API: `openDatabase() -> Promise<IDBDatabase>`, `requestResult(request) -> Promise<any>`, `transactionDone(tx) -> Promise<void>`, `loadState(db, now) -> Promise<{fragments, draft}>`, `migrateLegacy(db) -> Promise<MigrationResult>`.
- Fragment fields are exactly `{id, createdAt, text, source?, deletedAt?, undoUntil?}`.

- [ ] **Step 1: Write failing pure model tests**

Append tests proving trailing-only trim, stable legacy mapping, unique IDs, and tombstone visibility:

```js
test("fragment helpers preserve meaningful whitespace and classify tombstones", () => {
  const { normalizeText, normalizeLegacyRecord, isLive } = extractTestableLogic(readApp(), [
    "normalizeText", "normalizeLegacyRecord", "isLive",
  ]);
  assert.equal(normalizeText("  first\nsecond  \n"), "  first\nsecond");
  assert.equal(normalizeText(" \n\t"), "");
  const used = new Set();
  assert.deepEqual(normalizeLegacyRecord({ id: "a", at: 42, text: "kept", src: "press" }, used, 99), {
    id: "a", createdAt: 42, text: "kept", source: "press",
  });
  assert.equal(isLive({ id: "a", createdAt: 1, text: "x" }), true);
  assert.equal(isLive({ id: "a", createdAt: 1, text: "x", deletedAt: 10, undoUntil: 200 }), false);
});
```

- [ ] **Step 2: Run the model test and verify failure**

Run: `node --test tests/verify.mjs --test-name-pattern="fragment helpers"`  
Expected: FAIL because the helpers do not exist.

- [ ] **Step 3: Implement the pure model helpers inside the testable block**

Use trailing whitespace removal only and validate finite non-negative timestamps. `normalizeLegacyRecord` must preserve the first valid unique legacy ID and call `makeId` for missing/duplicate IDs. Do not coerce objects into `"[object Object]"` text.

```js
function normalizeText(value) {
  return typeof value === "string" ? value.replace(/\s+$/u, "") : "";
}
function isLive(fragment) {
  return !Number.isFinite(fragment.deletedAt);
}
```

- [ ] **Step 4: Run the pure model test and verify pass**

Run: `node --test tests/verify.mjs --test-name-pattern="fragment helpers"`  
Expected: PASS.

- [ ] **Step 5: Add IndexedDB schema and promise adapters**

Implement `openDatabase()` with database `ledger-web`, version `1`, object store `fragments` using key path `id`, indexes `createdAt` and `undoUntil`, and `meta` using key path `key`. `requestResult` resolves `request.result`; `transactionDone` resolves only on `complete` and rejects on `abort`/`error`.

```js
const DB_NAME = "ledger-web";
const DB_VERSION = 1;
const LEGACY_KEY = "ledger.fragments";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const fragments = db.createObjectStore("fragments", { keyPath: "id" });
      fragments.createIndex("createdAt", "createdAt");
      fragments.createIndex("undoUntil", "undoUntil");
      db.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database-blocked"));
  });
}
```

- [ ] **Step 6: Implement transactional migration and initial loading**

`migrateLegacy(db)` must:

1. Return immediately if `meta.localStorageMigration` exists.
2. Read but not remove the localStorage string.
3. Parse and validate an array; on malformed data return `{status:"malformed", raw}` without writing a marker.
4. Put all valid mapped fragments and the completion marker in one readwrite transaction.
5. Await transaction completion, then remove the localStorage key.
6. On failure leave localStorage intact and propagate the error.

`loadState(db, now)` removes expired tombstones in one transaction, reads the remaining fragments and draft, sorts fragments newest-first, and returns them.

- [ ] **Step 7: Run all static/pure tests**

Run: `node --test tests/verify.mjs`  
Expected: PASS.

- [ ] **Step 8: Commit persistence foundations**

```bash
git add index.html tests/verify.mjs
git commit -m "feat: add transactional IndexedDB storage"
```

---

### Task 3: Browser harness, draft recovery, and atomic capture

**Files:**
- Create: `tests/browser-harness.html`
- Create: `tests/browser-smoke.mjs`
- Modify: `index.html`
- Modify: `tests/verify.mjs`

**Interfaces:**
- Consumes: `openDatabase`, `transactionDone`, and the `fragments`/`meta` stores.
- Produces: `saveDraft(db, text)`, `appendFragment(db, text, source?)`, `flushDraft()`, `announce(message)`, `start()`.
- Test-only interface when `new URL(location.href).searchParams.has("test")`: `window.__ledgerTest.ready`, `window.__ledgerTest.readAll()`, and `window.__ledgerTest.closeDatabase()`.

- [ ] **Step 1: Create the browser runner and a failing capture scenario**

`tests/browser-smoke.mjs` must start a loopback-only Node HTTP server rooted at the repository, spawn `/opt/homebrew/bin/chromium` (or `CHROMIUM_BIN`) with a fresh temporary user-data directory, `--headless=new`, `--disable-gpu`, and `--remote-debugging-port=0`. Parse Chromium's loopback DevTools URL, use Node's built-in `WebSocket` and `fetch` to connect to the harness page, and poll `document.body.dataset.status` under real wall-clock time until it is `pass`, `fail`, or the bounded timeout expires. Always close Chromium and the server and remove only the runner-created temporary directory in `finally`.

The CDP runner replaces the originally proposed `--dump-dom --virtual-time-budget` mechanism. A minimal reproduction confirmed that virtual-time dump-DOM mode advances timers while starving IndexedDB callbacks; the same page reaches `data-status="pass"` immediately under real-time CDP control. This correction was approved by the user on 2026-09-01.

`tests/browser-harness.html` must clear `indexedDB.deleteDatabase("ledger-web")` and localStorage, create an iframe for `../index.html?test=1`, await `frame.contentWindow.__ledgerTest.ready`, then perform:

```js
entry.value = "draft survives";
entry.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "s" }));
await wait(400);
await reloadFrame();
assert(frameDoc().querySelector("#entry").value === "draft survives", "draft did not survive reload");

const current = frameDoc().querySelector("#entry");
current.dispatchEvent(new KeyboardEvent("keydown", {
  key: "Enter", ctrlKey: true, bubbles: true, cancelable: true,
}));
await until(async () => (await frameWin().__ledgerTest.readAll()).fragments.length === 1);
assert(frameDoc().querySelector("#entry").value === "", "composer did not clear after commit");
```

- [ ] **Step 2: Run the browser test and verify failure**

Run: `node tests/browser-smoke.mjs`  
Expected: FAIL because capture, draft persistence, and the test interface do not exist.

- [ ] **Step 3: Implement debounced draft persistence**

Use one 250ms timer. `saveDraft` writes `{key:"draft", value:text}` in a readwrite transaction and awaits completion. Input schedules it; `visibilitychange` when hidden and `pagehide` call an immediate best-effort flush. A failed draft write leaves the visible value untouched and announces once per failure episode.

- [ ] **Step 4: Implement atomic append**

`appendFragment` validates normalized text, then in one readwrite transaction puts the fragment and `{key:"draft", value:""}`. Only after `transactionDone(tx)` succeeds may it update in-memory state, clear the textarea, resize it, rerender, and announce “Fragment kept.” A rejected transaction announces “Fragment not saved. Your text is still here. Retry.” and leaves the exact visible text intact.

Wire both `#save` and `Command/Control+Enter`; plain Enter remains a newline.

- [ ] **Step 5: Add startup and guarded test interface**

`start()` opens the database, runs migration, loads state, restores the draft exactly, renders, and resolves a shared readiness promise. Expose test helpers only when the `test` query parameter is present **and** `location.hostname` is `127.0.0.1` or `localhost`; normal and deployed sessions must not create `window.__ledgerTest`.

- [ ] **Step 6: Run static and browser tests**

Run: `node --test tests/verify.mjs`  
Expected: PASS.  
Run: `node tests/browser-smoke.mjs`  
Expected: PASS with a recovered draft and one committed fragment.

- [ ] **Step 7: Commit recovery and capture**

```bash
git add index.html tests/verify.mjs tests/browser-harness.html tests/browser-smoke.mjs
git commit -m "feat: recover drafts and commit captures atomically"
```

---

### Task 4: Persistent deletion and 30-second Undo

**Files:**
- Modify: `index.html`
- Modify: `tests/browser-harness.html`
- Modify: `tests/verify.mjs`

**Interfaces:**
- Consumes: loaded fragment state and IndexedDB transaction helpers.
- Produces: `deleteFragment(id, now)`, `undoDelete(id, now)`, `purgeExpired(db, now)`, `unexpiredTombstones(fragments, now)`.

- [ ] **Step 1: Extend the browser scenario with failing delete/reload/Undo checks**

After capture, click the fragment Delete button and assert it disappears. Reload the iframe before 30 seconds, assert `#recentlyDeleted` remains available, open it, click Undo, and assert the fragment returns. Add a test-only clock override through `window.__ledgerTest.setNow(value)` so expiry can be deterministic, then delete again, advance beyond 30,000ms, reload, and assert the database no longer contains the fragment.

Also add a pure test:

```js
test("only unexpired tombstones remain undoable", () => {
  const { unexpiredTombstones } = extractTestableLogic(readApp(), ["unexpiredTombstones"]);
  const rows = [
    { id: "live", text: "x", createdAt: 1 },
    { id: "old", text: "x", createdAt: 1, deletedAt: 2, undoUntil: 99 },
    { id: "new", text: "x", createdAt: 1, deletedAt: 2, undoUntil: 101 },
  ];
  assert.deepEqual(unexpiredTombstones(rows, 100).map(row => row.id), ["new"]);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/verify.mjs --test-name-pattern="tombstones"`  
Expected: FAIL because the helper is absent.  
Run: `node tests/browser-smoke.mjs`  
Expected: FAIL at Delete/Undo.

- [ ] **Step 3: Implement transactional delete and Undo**

`deleteFragment(id, now)` updates the durable record with `deletedAt:now` and `undoUntil:now+30000`, awaits completion, then hides it and displays the most-recent Undo toast. On failure it leaves the fragment visible.

`undoDelete(id, now)` refuses expired records, removes `deletedAt` and `undoUntil`, writes the restored record, awaits completion, then returns it to chronological position. On failure it preserves the tombstone and retry opportunity.

- [ ] **Step 4: Implement reload recovery and multiple-deletion access**

At render/startup, derive all unexpired tombstones. The toast points to the newest deletion. `#recentlyDeleted` opens a native dialog listing every unexpired tombstone with a short safe text preview and its own Undo button. Do not use a per-second timer; schedule only one timeout for the nearest expiry, then refresh controls and purge.

- [ ] **Step 5: Run static and browser tests**

Run: `node --test tests/verify.mjs`  
Expected: PASS.  
Run: `node tests/browser-smoke.mjs`  
Expected: PASS for Delete, reload-safe Undo, and expiry cleanup.

- [ ] **Step 6: Commit deletion safety**

```bash
git add index.html tests/verify.mjs tests/browser-harness.html
git commit -m "feat: add reload-safe deletion undo"
```

---

### Task 5: Search and bounded rendering

**Files:**
- Modify: `index.html`
- Modify: `tests/verify.mjs`
- Modify: `tests/browser-harness.html`

**Interfaces:**
- Produces: `queryTokens(query) -> string[]`, `matchesFragment(fragment, tokens) -> boolean`, `searchFragments(fragments, query, now) -> Fragment[]`, `visibleSlice(results, count=100) -> Fragment[]`, `render()`.

- [ ] **Step 1: Write failing search/model tests**

```js
test("search requires every token and excludes tombstones", () => {
  const { searchFragments } = extractTestableLogic(readApp(), ["searchFragments"]);
  const rows = [
    { id: "1", createdAt: 3, text: "Blue quiet sky" },
    { id: "2", createdAt: 2, text: "Blue sea", source: "notes.txt" },
    { id: "3", createdAt: 1, text: "Blue quiet", deletedAt: 4, undoUntil: 100 },
  ];
  assert.deepEqual(searchFragments(rows, "BLUE quiet", 50).map(row => row.id), ["1"]);
  assert.deepEqual(searchFragments(rows, "notes", 50).map(row => row.id), ["2"]);
});
```

Extend the browser harness by seeding 250 fragments through `__ledgerTest.seedFragments(rows)`. Assert initial `.frag` count is 100, Load more produces 200 then 250, a search shows only matching live records, and fragment text containing `<img src=x onerror=...>` appears as text without creating an image.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/verify.mjs --test-name-pattern="search"`  
Expected: FAIL.  
Run: `node tests/browser-smoke.mjs`  
Expected: FAIL at bounded rendering.

- [ ] **Step 3: Implement pure search and batch state**

Tokenize trimmed whitespace, lowercase without locale-dependent expansion, require every token in `text + source`, exclude all records containing `deletedAt`, and sort newest-first with ID as a stable tie-breaker. Reset `renderLimit` to 100 whenever the query changes; Load more adds exactly 100.

- [ ] **Step 4: Render with safe DOM APIs**

Build day headings, `<article class="frag">`, `<time datetime>`, body text/highlights, source, and Delete button using `createElement`, `createTextNode`, and `textContent` only. Use `<mark>` for matched ranges. Counts must say `100 of 250 fragments` or `12 matches` accurately.

- [ ] **Step 5: Run static and browser tests**

Run: `node --test tests/verify.mjs`  
Expected: PASS.  
Run: `node tests/browser-smoke.mjs`  
Expected: PASS with no more than the requested batch in the DOM.

- [ ] **Step 6: Commit search and rendering**

```bash
git add index.html tests/verify.mjs tests/browser-harness.html
git commit -m "feat: bound and search the fragment stream"
```

---

### Task 6: Lossless JSON backup, merge restore, and Markdown portability

**Files:**
- Modify: `index.html`
- Modify: `tests/verify.mjs`
- Modify: `tests/browser-harness.html`

**Interfaces:**
- Produces: `makeBackup(fragments, now) -> Backup`, `validateBackup(value, now) -> ValidationResult`, `planRestore(existing, incoming, now) -> RestorePlan`, `restoreBackup(db, plan) -> Promise<RestoreSummary>`, `markdownArchive(fragments, locale) -> string`, `textImportRecords(text, filename, modifiedAt) -> Fragment[]`, `downloadFile(name, text, type)`.

- [ ] **Step 1: Write failing backup/restore tests**

Test that backup preserves exact record fields, excludes expired tombstones, restore classifies new/duplicate/conflicting/invalid records, and never returns a replacement for an existing ID:

```js
test("restore plan appends unique records without replacement", () => {
  const { planRestore } = extractTestableLogic(readApp(), ["planRestore"]);
  const existing = [{ id: "same", createdAt: 1, text: "original" }];
  const incoming = [
    { id: "same", createdAt: 1, text: "original" },
    { id: "same", createdAt: 1, text: "changed" },
    { id: "new", createdAt: 2, text: "added" },
  ];
  const plan = planRestore(existing, incoming, 100);
  assert.deepEqual(plan.add.map(row => row.id), ["new"]);
  assert.equal(plan.duplicates, 1);
  assert.equal(plan.conflicts, 1);
});
```

Add a Markdown test with fragments deliberately out of order and containing `#`, `-`, `*`, brackets, and multiline text; assert chronological output and escaped structure.

- [ ] **Step 2: Run portability tests and verify failure**

Run: `node --test tests/verify.mjs --test-name-pattern="restore|Markdown|backup"`  
Expected: FAIL because the helpers are absent.

- [ ] **Step 3: Implement versioned JSON backup and validation**

Emit exactly:

```js
{
  format: "ledger-web",
  version: 1,
  exportedAt: now,
  fragments: liveAndUnexpiredRecords
}
```

Validate the top-level format/version and every field before any transaction. Accept only finite non-negative timestamps and non-empty normalized string text. Preserve valid incoming IDs; generate IDs only when missing. An expired imported tombstone is invalid/skipped, never converted to live.

- [ ] **Step 4: Implement transactional merge restore**

Compare identical records by all stored fields in canonical key order. Existing identical IDs increment duplicates; differing identical IDs increment conflicts; only new IDs enter `plan.add`. Write every accepted new record in one transaction and update in-memory state only after completion. Report added, duplicate, invalid, and conflict counts.

- [ ] **Step 5: Implement text/Markdown import and Markdown export**

Text import splits on blank lines, ignores empty blocks, preserves block content, assigns stable increasing millisecond timestamps beginning at `file.lastModified || Date.now()`, and records `source:"from " + file.name`. Import all generated records transactionally.

Markdown export includes live fragments oldest-first, local-date headings, local times, indented continuation lines, and escaped Markdown control characters. Use a Blob/object URL, click a temporary download link, and always revoke the URL.

- [ ] **Step 6: Wire the file input and export controls**

`#import` clicks the hidden input. `.json` invokes backup restore; other accepted files invoke block import. Always reset the input value so choosing the same file again fires `change`. Backup and Markdown actions announce successful download preparation or an actionable error without mutating data.

- [ ] **Step 7: Run static and browser tests**

Run: `node --test tests/verify.mjs`  
Expected: PASS.  
Run: `node tests/browser-smoke.mjs`  
Expected: PASS; extend the harness to call test-only restore with duplicate/conflict data and confirm existing text remains `original`.

- [ ] **Step 8: Commit portability features**

```bash
git add index.html tests/verify.mjs tests/browser-harness.html
git commit -m "feat: add safe backup restore and archives"
```

---

### Task 7: Failure recovery, accessibility, and browser hardening

**Files:**
- Modify: `index.html`
- Modify: `tests/verify.mjs`
- Modify: `tests/browser-harness.html`

**Interfaces:**
- Consumes: all storage and UI operations.
- Produces: `describeStorageError(error) -> string`, `setRecoveryState(kind, details?)`, `retryStartup()`, and complete keyboard/focus behavior.

- [ ] **Step 1: Write failing recovery and security assertions**

Add pure checks that `QuotaExceededError`, blocked startup, malformed legacy data, and generic transaction errors map to distinct actionable messages. Add static assertions for a restrictive CSP meta tag, reduced-motion and forced-color rules, `font-size` of at least 16px for narrow inputs, `env(safe-area-inset-*)`, no `innerHTML`, no in-memory persistence fallback, and no fragment content in logging calls.

```js
test("storage errors produce actionable recovery copy", () => {
  const { describeStorageError } = extractTestableLogic(readApp(), ["describeStorageError"]);
  assert.match(describeStorageError({ name: "QuotaExceededError" }), /export|backup/i);
  assert.match(describeStorageError(new Error("database-blocked")), /other Ledger tabs|retry/i);
});
```

- [ ] **Step 2: Run focused hardening tests and verify failure**

Run: `node --test tests/verify.mjs --test-name-pattern="storage errors|release|semantic"`  
Expected: FAIL on missing recovery mapping/CSP.

- [ ] **Step 3: Add startup recovery states**

When IndexedDB is blocked, unavailable, or restricted, keep the composer visible, disable actions that would falsely imply persistence, show the appropriate message, and offer Retry. For malformed migration, provide a button that downloads the untouched raw localStorage value; never delete it. For quota errors, retain the composer and surface Backup/Markdown actions.

- [ ] **Step 4: Add CSP and close trust boundaries**

Add a meta CSP that permits this document's inline CSS/script, data fonts, and blob downloads while denying network connections and framing:

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">
```

Verify that all user-controlled values enter the DOM through `textContent`/text nodes. Do not use `innerHTML`, string event handlers, `eval`, or remote URLs.

- [ ] **Step 5: Complete keyboard, focus, and responsive behavior**

- `Command/Control+F`: prevent default, focus/select Ledger search.
- `Command/Control+Enter`: save; plain Enter: newline.
- `Escape`: close open dialog, else clear search, else focus composer.
- Successful save: keep focus in composer.
- Delete: move focus to Undo; Undo: focus restored fragment's Delete control or composer if offscreen.
- Import dialog return: restore focus to Import.
- Fine pointer startup: focus composer; coarse pointer startup: do not raise the keyboard automatically.
- Keep all actions accessible without hover and preserve 44px coarse-pointer targets.

- [ ] **Step 6: Add failure injection to browser harness**

Through the test-only interface, make the next fragment transaction abort. Type `must remain`, invoke save, and assert the textarea still contains the exact text and the status says it was not saved. Restore normal operation, retry, and assert one durable fragment. Simulate malformed legacy JSON before first startup and assert localStorage remains unchanged.

- [ ] **Step 7: Run the complete test suite**

Run: `node --test tests/verify.mjs`  
Expected: all tests PASS.  
Run: `node tests/browser-smoke.mjs`  
Expected: PASS with no console/page errors reported by the harness.

- [ ] **Step 8: Commit hardening**

```bash
git add index.html tests/verify.mjs tests/browser-harness.html
git commit -m "fix: make Ledger failures recoverable"
```

---

### Task 8: Legal files, documentation, visual QA, and public release preparation

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `ThirdPartyLicenses/Literata-OFL.txt`
- Create: `ThirdPartyLicenses/WorkSans-OFL.txt`
- Modify: `index.html`
- Modify: `tests/verify.mjs`

**Interfaces:**
- Produces: publishable `main` history, repository documentation, license coverage, and GitHub Pages-ready root.

- [ ] **Step 1: Write failing notice/documentation checks**

Add a test that requires each repository notice, verifies its contents are embedded in a `<template id="legalNotices">` inside `index.html`, and checks README credit/link text for Jean-Philippe Aumasson's Plaintext repository.

```js
const legalFiles = [
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "ThirdPartyLicenses/Literata-OFL.txt",
  "ThirdPartyLicenses/WorkSans-OFL.txt",
];
for (const relative of legalFiles) {
  assert.ok(existsSync(resolve(root, relative)), relative + " missing");
}
assert.match(readFileSync(resolve(root, "README.md"), "utf8"), /github\.com\/veorq\/Plaintext/);
```

- [ ] **Step 2: Run notice tests and verify failure**

Run: `node --test tests/verify.mjs --test-name-pattern="notice|credit"`  
Expected: FAIL because release files do not exist.

- [ ] **Step 3: Add license, notices, embedded copies, and README**

Use the same verified MIT/OFL texts and attribution pattern already present in `/Users/peppi/Dev/plaintext-web` where licenses match. README must include:

- One-sentence purpose and demo link `https://dusterbloom.github.io/ledger-web/`.
- “Download `index.html` and open it” offline instructions, with the caveat that GitHub Pages is the canonical browser-compatible route.
- Keyboard controls.
- JSON Backup/Import and Markdown export explanation.
- Privacy statement: no account, analytics, or runtime network requests.
- Clear credit: inspired by [Plaintext](https://github.com/veorq/Plaintext) by Jean-Philippe Aumasson; unofficial adaptation.
- Browser support and test commands.

Embed repository notice text verbatim in a hidden `<template id="legalNotices">` so the one-file download retains its legal notices.

- [ ] **Step 4: Run automated verification**

Run: `node --test tests/verify.mjs`  
Expected: all tests PASS.  
Run: `node tests/browser-smoke.mjs`  
Expected: PASS.

- [ ] **Step 5: Perform visual/browser QA**

Serve locally with `python3 -m http.server 8765 --bind 127.0.0.1` from the repository and inspect in current Chrome, Safari, and Firefox where available. Check:

- 320×568, 390×844, 768×1024, 1440×900 viewports.
- 200% browser zoom and increased system text.
- Touch/coarse-pointer controls and keyboard-only workflow.
- Long unbroken strings and multiline fragments.
- Light/dark, reduced motion, and forced/high contrast where supported.
- Draft reload, delete/reload/Undo, migration, restore conflict, and storage failure states.
- Network panel after reload shows zero runtime requests.
- Console is error-free.

Record any visual defect as a failing assertion when practical, fix `index.html`, and repeat the relevant size/browser.

- [ ] **Step 6: Commit release files and final UI fixes**

```bash
git add index.html tests/verify.mjs README.md LICENSE THIRD_PARTY_NOTICES.md ThirdPartyLicenses
git commit -m "docs: prepare Ledger for public release"
```

- [ ] **Step 7: Verify clean product history before publication**

Create a temporary product branch from `main`, cherry-pick the Task 1–8 product commits but not commits `c281223` or this plan commit. Verify:

```bash
git ls-tree -r --name-only HEAD
git log product/ledger-v2 --oneline --decorate
git status --short
node --test tests/verify.mjs
node tests/browser-smoke.mjs
```

Expected tree: product, tests, README/license/notices only; no `docs/` or `.superpowers/`. Expected tests: PASS. Do not delete the internal design branch until public `main` is verified and the user has no further need for it.

- [ ] **Step 8: Publish the verified `main` branch and enable GitHub Pages**

Fast-forward `main` to the verified product branch, confirm `main` is checked out, then create and publish the explicitly requested public repository:

```bash
git switch main
git merge --ff-only product/ledger-v2
gh repo create dusterbloom/ledger-web --public --source=. --remote=origin --push
gh api -X POST repos/dusterbloom/ledger-web/pages -f 'source[branch]=main' -f 'source[path]=/'
gh api repos/dusterbloom/ledger-web/pages --jq '.html_url + " " + .status'
```

Poll the reported Pages URL until it returns HTTP 200, then compare its downloaded `index.html` hash with local `index.html`. Report the repository URL, demo URL, exact commit, test totals, and browser matrix. If the repository already exists or Pages is already configured, inspect the existing remote state and use the non-destructive equivalent instead of recreating it.

## Final verification checklist

- [ ] `node --test tests/verify.mjs` passes with no skipped tests.
- [ ] `node tests/browser-smoke.mjs` reports PASS.
- [ ] `git diff --check` is clean.
- [ ] `index.html` contains no runtime remote URL, network API, wildcard message bus, `innerHTML`, or silent memory persistence fallback.
- [ ] Browser QA covers Chrome, Safari, Firefox, and narrow mobile sizes.
- [ ] Network panel confirms zero runtime requests.
- [ ] The original commit remains the root of public `main`.
- [ ] Public history contains no `docs/` or `.superpowers/` path.
- [ ] GitHub repository and Pages deployment serve the exact verified `main` artifact.
