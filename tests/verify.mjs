import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appPath = resolve(root, "index.html");
const browserPath = resolve(root, "tests/browser-smoke.mjs");
const readApp = () => readFileSync(appPath, "utf8");

function legalBlock(html) {
  const match = html.match(/<template id="legalNotices">([\s\S]*?)<\/template>/);
  assert.ok(match, "standalone legal-notices block missing");
  return match[1];
}

function normalizeNotice(source) {
  return source.replace(/[ \t]+$/gm, "").replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

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

function extractRunnerLogic(names) {
  const script = readFileSync(browserPath, "utf8");
  const match = script.match(/\/\* @testable-runner:start \*\/([\s\S]*?)\/\* @testable-runner:end \*\//);
  assert.ok(match, "testable runner block missing");
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

test("favicon matches the standalone Ledger icon", () => {
  const html = readApp();
  const source = readFileSync(resolve(root, "icon.svg"), "utf8").trim();
  const encoded = html.match(/<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,([^"]+)">/)?.[1];
  assert.ok(encoded, "SVG favicon missing");
  assert.equal(decodeURIComponent(encoded), source);
});

test("release closes document trust boundaries with a restrictive CSP", () => {
  const html = readApp();
  const script = inlineScript(html);
  const policy = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
  assert.ok(policy, "Content Security Policy meta tag missing");
  for (const directive of [
    "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'",
    "font-src data:", "img-src data:", "connect-src 'none'", "media-src 'none'",
    "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'",
  ]) assert.match(policy, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(script, /\binnerHTML\b|\beval\s*\(|new\s+Function\b/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(script, /\bconsole\s*\.|\b(?:localStorage|sessionStorage)\s*\.\s*setItem\([^)]*fragment/i);
});

test("repository and standalone app retain required legal notices and credit", () => {
  const html = readApp();
  const embedded = legalBlock(html);
  const notices = readFileSync(resolve(root, "THIRD_PARTY_NOTICES.md"), "utf8");
  const licenseDirectory = resolve(root, "ThirdPartyLicenses");
  const licenseNames = readdirSync(licenseDirectory).filter((name) => name.endsWith("-OFL.txt"));
  const fontFamilies = [...new Set([...html.matchAll(/@font-face\s*\{[^}]*font-family:"([^"]+)"/gu)]
    .map((match) => match[1]))];
  assert.ok(fontFamilies.length > 0, "embedded font inventory is empty");

  const fontFiles = fontFamilies.map((family) => {
    const normalizedFamily = family.replace(/[^a-z0-9]/giu, "").toLowerCase();
    const file = licenseNames.find((name) => name.replace(/-OFL\.txt$/u, "")
      .replace(/[^a-z0-9]/giu, "").toLowerCase() === normalizedFamily);
    assert.ok(file, family + " embedded font license missing");
    assert.match(notices, new RegExp(family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    return "ThirdPartyLicenses/" + file;
  });

  for (const relative of ["LICENSE", "THIRD_PARTY_NOTICES.md", ...fontFiles]) {
    const path = resolve(root, relative);
    assert.ok(existsSync(path), relative + " missing");
    const notice = normalizeNotice(readFileSync(path, "utf8"));
    assert.ok(notice.length > 100, relative + " is unexpectedly short");
    assert.ok(embedded.includes(notice), relative + " is not embedded verbatim in index.html");
  }

  const readmePath = resolve(root, "README.md");
  assert.ok(existsSync(readmePath), "README.md missing");
  const readme = readFileSync(readmePath, "utf8");
  assert.match(readme, /github\.com\/veorq\/Plaintext/);
  assert.match(readme, /Jean-Philippe Aumasson/);
  assert.match(readme, /unofficial adaptation/i);
});

test("storage errors produce distinct actionable recovery copy", () => {
  const { describeStorageError } = extractTestableLogic(readApp(), ["describeStorageError"]);
  const quotaWithBackup = describeStorageError({ name: "QuotaExceededError" }, true);
  const quotaWithoutBackup = describeStorageError({ name: "QuotaExceededError" }, false);
  const blocked = describeStorageError(new Error("database-blocked"));
  const restricted = describeStorageError({ name: "SecurityError" });
  const malformed = describeStorageError(new Error("legacy-malformed"));
  const generic = describeStorageError(new Error("transaction-failed"));
  assert.match(quotaWithBackup, /backup|markdown/i);
  assert.doesNotMatch(quotaWithoutBackup, /backup|markdown/i);
  assert.match(quotaWithoutBackup, /free|retry/i);
  assert.match(blocked, /other Ledger tabs/i);
  assert.match(blocked, /retry/i);
  assert.match(restricted, /browser|private|storage/i);
  assert.match(malformed, /legacy|download/i);
  assert.match(generic, /not saved|retry/i);
  assert.equal(new Set([quotaWithBackup, quotaWithoutBackup, blocked, restricted, malformed, generic]).size, 6);
});

test("responsive accessibility keeps controls visible and respects user settings", () => {
  const html = readApp();
  for (const id of ["recovery", "retryStartup", "downloadLegacy"]) {
    assert.match(html, new RegExp('id="' + id + '"'), id + " missing");
  }
  assert.match(html, /@media\s*\(prefers-color-scheme\s*:\s*dark\)[\s\S]*?--bg\s*:[^;}]+;[\s\S]*?--fg\s*:/i);
  assert.match(html, /@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/i);
  assert.match(html, /@media\s*\(forced-colors\s*:\s*active\)/i);
  assert.match(html, /@media\s*\(pointer\s*:\s*coarse\)[\s\S]*?min-(?:width|height)\s*:\s*44px/i);
  assert.match(html, /#entry,#search\s*\{[^}]*font-size\s*:\s*max\(16px/i);
  for (const side of ["top", "right", "bottom", "left"]) {
    assert.match(html, new RegExp("env\\(safe-area-inset-" + side + "\\)"));
  }
  assert.doesNotMatch(html, /\.drop\s*\{[^}]*opacity\s*:\s*0(?:[;}])/i);
});

test("narrow viewport header wraps before its controls overflow", () => {
  assert.match(
    readApp(),
    /@media\s*\(max-width\s*:\s*359px\)\s*\{[^}]*\.topbar\s*\{[^}]*flex-wrap\s*:\s*wrap/i,
  );
});

test("capture, search, stream, status, and recovery controls are semantic", () => {
  const html = readApp();
  for (const id of [
    "entry", "save", "search", "stream", "status", "recentlyDeleted", "retryStartup",
    "dismissLegacy", "showLegacyData",
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'), id + " missing");
  }
  assert.match(html, /<label[^>]*for="entry"/);
  assert.match(html, /aria-live="polite"/);
});

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

test("all record timestamps stay inside the safe ECMAScript Date domain", () => {
  const { hasValidTimestamp, validStoredRecord, boundedExpiryDelay } = extractTestableLogic(readApp(), [
    "hasValidTimestamp", "validStoredRecord", "boundedExpiryDelay",
  ]);
  const maxDate = 8_640_000_000_000_000;
  for (const value of [0, 1, maxDate]) assert.equal(hasValidTimestamp(value), true, String(value));
  for (const value of [-1, 0.5, maxDate + 1, Number.MAX_SAFE_INTEGER, 1e300, NaN, Infinity]) {
    assert.equal(hasValidTimestamp(value), false, String(value));
  }

  const live = { id: "live", createdAt: 1, text: "kept" };
  const tombstone = { id: "gone", createdAt: 1, text: "gone", deletedAt: 70, undoUntil: 100 };
  const futureDatedTombstone = { id: "future", createdAt: 100, text: "future", deletedAt: 70, undoUntil: 100 };
  assert.deepEqual(validStoredRecord(live), live);
  assert.deepEqual(validStoredRecord(tombstone), tombstone);
  assert.deepEqual(validStoredRecord(futureDatedTombstone), futureDatedTombstone);
  for (const invalid of [
    { ...live, createdAt: 1.5 },
    { ...live, createdAt: maxDate + 1 },
    { ...live, deletedAt: 2 },
    { ...tombstone, deletedAt: -1 },
    { ...tombstone, undoUntil: 69 },
    { ...tombstone, undoUntil: 30_071 },
  ]) assert.equal(validStoredRecord(invalid), null, JSON.stringify(invalid));
  assert.equal(boundedExpiryDelay(maxDate, 0), 2_147_483_647);
  assert.equal(boundedExpiryDelay(99, 100), 0);
});

test("only unexpired tombstones remain undoable", () => {
  const { unexpiredTombstones } = extractTestableLogic(readApp(), ["unexpiredTombstones"]);
  const rows = [
    { id: "live", text: "x", createdAt: 1 },
    { id: "old", text: "x", createdAt: 1, deletedAt: 69, undoUntil: 99 },
    { id: "new", text: "x", createdAt: 1, deletedAt: 71, undoUntil: 101 },
  ];
  assert.deepEqual(unexpiredTombstones(rows, 100).map(row => row.id), ["new"]);
});

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

test("search sorts matching live records and slices requested batches", () => {
  const { queryTokens, matchesFragment, searchFragments, visibleSlice } = extractTestableLogic(readApp(), [
    "queryTokens", "matchesFragment", "searchFragments", "visibleSlice",
  ]);
  const rows = [
    { id: "z", createdAt: 7, text: "Needle", source: "Notebook" },
    { id: "a", createdAt: 7, text: "needle note" },
    { id: "old", createdAt: 6, text: "needle notebook" },
    { id: "gone", createdAt: 9, text: "needle notebook", deletedAt: undefined },
  ];
  assert.deepEqual(queryTokens("  NEEDLE\tNotebook "), ["needle", "notebook"]);
  assert.equal(matchesFragment(rows[0], ["needle", "notebook"]), true);
  assert.deepEqual(searchFragments(rows, "needle", 100).map(row => row.id), ["a", "z", "old"]);
  assert.deepEqual(visibleSlice(rows, 2).map(row => row.id), ["z", "a"]);
});

test("highlight ranges map lowercase expansions back to the original text", () => {
  const { highlightRanges } = extractTestableLogic(readApp(), ["highlightRanges"]);
  assert.deepEqual(highlightRanges("İx", ["x"]), [[1, 2]]);
  assert.deepEqual(highlightRanges("AİxB", ["i̇x"]), [[1, 3]]);
  assert.deepEqual(highlightRanges("ΟΣ", ["ς"]), [[1, 2]]);
});

test("bounded counts distinguish shown search matches from their total", () => {
  const { resultCountLabel } = extractTestableLogic(readApp(), ["resultCountLabel"]);
  assert.equal(resultCountLabel(100, 250, true), "100 of 250 matches");
  assert.equal(resultCountLabel(1, 1, true), "1 match");
  assert.equal(resultCountLabel(12, 12, true), "12 matches");
  assert.equal(resultCountLabel(100, 250, false), "100 of 250 fragments");
});

test("fragment IDs prefer UUIDs and fall back to timestamp plus random entropy", () => {
  const { makeId } = extractTestableLogic(readApp(), ["makeId"]);
  assert.equal(makeId(42, () => "uuid-preferred", () => 0.5), "uuid-preferred");
  assert.equal(makeId(42, () => "", () => 0.5), "16-zik0zk");
});

test("legacy records generate unique IDs for missing and duplicate IDs", () => {
  const { normalizeLegacyRecord } = extractTestableLogic(readApp(), ["normalizeLegacyRecord"]);
  const used = new Set(["legacy-id"]);
  const missingId = normalizeLegacyRecord({ at: 7, text: "missing" }, used, 99);
  const duplicateId = normalizeLegacyRecord({ id: "legacy-id", at: 8, text: "duplicate" }, used, 99);

  assert.deepEqual({ createdAt: missingId.createdAt, text: missingId.text }, { createdAt: 7, text: "missing" });
  assert.deepEqual({ createdAt: duplicateId.createdAt, text: duplicateId.text }, { createdAt: 8, text: "duplicate" });
  assert.notEqual(missingId.id, "legacy-id");
  assert.notEqual(duplicateId.id, "legacy-id");
  assert.notEqual(duplicateId.id, missingId.id);
  assert.ok(used.has(missingId.id));
  assert.ok(used.has(duplicateId.id));
  assert.equal(normalizeLegacyRecord({ at: 1.5, text: "fractional" }, used, 99), null);
  assert.equal(normalizeLegacyRecord({ at: 8_640_000_000_000_001, text: "out of range" }, used, 99), null);
});

test("a completed migration never touches unavailable legacy storage", async () => {
  const { migrateLegacy } = extractTestableLogic(readApp(), ["migrateLegacy"]);
  let storageReads = 0;
  const tx = {
    objectStore(name) {
      assert.ok(["fragments", "meta"].includes(name));
      return {
        get(key) {
          assert.equal(name, "meta");
          assert.equal(key, "localStorageMigration");
          const request = {};
          queueMicrotask(() => {
            request.result = { key, value: true };
            request.onsuccess();
            queueMicrotask(() => tx.oncomplete());
          });
          return request;
        },
      };
    },
  };
  const db = {
    transaction(stores, mode) {
      assert.deepEqual(stores, ["fragments", "meta"]);
      assert.equal(mode, "readwrite");
      return tx;
    },
  };
  const unavailableStorage = {
    getItem() {
      storageReads += 1;
      throw new DOMException("restricted", "SecurityError");
    },
  };

  assert.deepEqual(await migrateLegacy(db, unavailableStorage), { status: "already-migrated" });
  assert.equal(storageReads, 0);
});

test("capture helpers are exposed from the testable application logic", () => {
  const helpers = extractTestableLogic(readApp(), ["saveDraft", "appendFragment"]);
  assert.equal(typeof helpers.saveDraft, "function");
  assert.equal(typeof helpers.appendFragment, "function");
});

test("test helpers require both an explicit flag and a loopback hostname", () => {
  const { isTestMode } = extractTestableLogic(readApp(), ["isTestMode"]);
  assert.equal(isTestMode({ href: "http://127.0.0.1/index.html?test=1", hostname: "127.0.0.1" }), true);
  assert.equal(isTestMode({ href: "http://localhost/index.html?test", hostname: "localhost" }), true);
  assert.equal(isTestMode({ href: "http://127.0.0.1/index.html", hostname: "127.0.0.1" }), false);
  assert.equal(isTestMode({ href: "https://ledger.example/index.html?test=1", hostname: "ledger.example" }), false);
});

test("stored drafts restore only when startup observed no user input", () => {
  const { restoreDraft } = extractTestableLogic(readApp(), ["restoreDraft"]);
  const entry = { value: "typed while loading" };
  assert.equal(restoreDraft(entry, "stored draft", 0, 1), false);
  assert.equal(entry.value, "typed while loading");

  entry.value = "";
  assert.equal(restoreDraft(entry, "  stored exactly\n", 2, 2), true);
  assert.equal(entry.value, "  stored exactly\n");

  entry.value = "typed before retry";
  assert.equal(restoreDraft(entry, "older stored draft", 3, 3), false);
  assert.equal(entry.value, "typed before retry");
});

test("composer autofocus is limited to fine pointers with no existing focus", () => {
  const { shouldAutofocusComposer } = extractTestableLogic(readApp(), ["shouldAutofocusComposer"]);
  assert.equal(shouldAutofocusComposer(true, true), true);
  assert.equal(shouldAutofocusComposer(false, true), false);
  assert.equal(shouldAutofocusComposer(true, false), false);
});

test("backup preserves stored fields and excludes only expired tombstones", () => {
  const { makeBackup, validateBackup } = extractTestableLogic(readApp(), ["makeBackup", "validateBackup"]);
  const live = { id: "live", createdAt: 1, text: "kept", source: "capture" };
  const undoable = { id: "undoable", createdAt: 2, text: "pending", deletedAt: 71, undoUntil: 101 };
  const expired = { id: "expired", createdAt: 4, text: "gone", deletedAt: 70, undoUntil: 100 };
  const invalid = { id: "invalid", createdAt: 8_640_000_000_000_001, text: "must not export" };

  const backup = makeBackup([expired, invalid, undoable, live], 100);
  assert.deepEqual(backup, {
    format: "ledger-web",
    version: 1,
    exportedAt: 100,
    fragments: [undoable, live],
  });
  assert.deepEqual(validateBackup(backup, 100), {
    valid: true, fragments: [undoable, live], invalid: 0,
  });
});

const logLines = (...events) => events.map((event) => JSON.stringify({ v: 1, ...event })).join("\n") + "\n";

test("safety-copy log folds keeps once, applies deletes and restores in order, skips damaged lines", () => {
  const { foldLog } = extractTestableLogic(readApp(), ["foldLog"]);
  const a = { id: "a", createdAt: 1, text: "A" };
  const b = { id: "b", createdAt: 2, text: "B", source: "book" };
  const text = logLines(
    { op: "keep", at: 1, fragment: a },
    { op: "keep", at: 2, fragment: b },
    { op: "delete", at: 3, id: "a" },
    { op: "keep", at: 4, fragment: { ...a, text: "replayed" } },
    { op: "delete", at: 5, id: "b" },
    { op: "restore", at: 6, id: "b" },
  ) + "not json\n{\"v\":1,\"op\":\"keep\",\"fragment\":{\"id\":\"x\"}}\n{\"v\":1,\"op\":\"ke";
  const fold = foldLog(text);
  assert.deepEqual([...fold.live.values()], [b]);
  assert.deepEqual([...fold.deleted], ["a"]);
  assert.equal(fold.invalid, 3);
  assert.equal(foldLog("").live.size, 0);
});

test("sync is a union that leaves browser and safety copy agreeing without dropping a fragment", () => {
  const { foldLog, planSync } = extractTestableLogic(readApp(), ["foldLog", "planSync"]);
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let round = 0; round < 500; round += 1) {
    const ids = ["a", "b", "c", "d", "e"].filter(() => random() < 0.7);
    const browser = [];
    const events = [];
    for (const [index, id] of ids.entries()) {
      const fragment = { id, createdAt: index + 1, text: "T" + id };
      const place = random();
      if (place < 0.4) browser.push(random() < 0.3 ? { ...fragment, deletedAt: 50, undoUntil: 60 } : fragment);
      if (place > 0.3) {
        events.push({ op: "keep", at: 1, fragment });
        if (random() < 0.3) events.push({ op: "delete", at: 2, id });
      }
    }
    const before = foldLog(events.length ? logLines(...events) : "");
    const plan = planSync(browser, before, 100);
    const after = foldLog((events.length ? logLines(...events) : "") + (plan.toDisk.length ? logLines(...plan.toDisk) : ""));
    const browserAfter = browser.concat(plan.toBrowser);
    const browserLive = new Set(browserAfter.filter((row) => !("deletedAt" in row)).map((row) => row.id));
    const browserDeleted = new Set(browser.filter((row) => "deletedAt" in row).map((row) => row.id));
    assert.deepEqual([...after.live.keys()].sort(), [...browserLive].sort(), "browser and safety copy disagree");
    for (const id of new Set([...before.live.keys(), ...browser.map((row) => row.id)])) {
      if (!browserDeleted.has(id)) assert.ok(after.live.has(id), "fragment " + id + " was dropped");
    }
    assert.equal(planSync(browserAfter, after, 100).toDisk.length, 0, "sync is not idempotent");
    assert.equal(planSync(browserAfter, after, 100).toBrowser.length, 0, "sync is not idempotent");
  }
});

test("the safety copy is only ever appended to", async () => {
  const { appendLines } = extractTestableLogic(readApp(), ["appendLines"]);
  let stored = "{\"v\":1}";
  const handle = {
    async getFile() { return { size: stored.length, async text() { return stored; } }; },
    async createWritable(options) {
      assert.deepEqual(options, { keepExistingData: true });
      let draft = stored;
      return {
        async write(chunk) {
          assert.equal(chunk.type, "write");
          assert.equal(chunk.position, draft.length, "write did not start at the end of the file");
          draft += chunk.data;
        },
        async close() { stored = draft; },
      };
    },
  };
  await appendLines(handle, [{ v: 1, op: "delete", at: 1, id: "a" }]);
  assert.equal(stored, "{\"v\":1}\n{\"v\":1,\"op\":\"delete\",\"at\":1,\"id\":\"a\"}\n");
  const unchanged = stored;
  await appendLines(handle, []);
  assert.equal(stored, unchanged);
});

test("workspace connection stays disabled until browser recovery is loaded", () => {
  assert.match(readApp(), /id="connectWorkspace"[^>]*disabled/);
  assert.match(readApp(), /connectWorkspaceButton\.disabled = !database/);
});

test("backup validation rejects unsupported documents and skips invalid records", () => {
  const { validateBackup } = extractTestableLogic(readApp(), ["validateBackup"]);
  assert.equal(validateBackup({ format: "other", version: 1, fragments: [] }, 100).valid, false);

  const result = validateBackup({
    format: "ledger-web",
    version: 1,
    exportedAt: 50,
    fragments: [
      { id: "valid", createdAt: 1, text: "kept" },
      { createdAt: 2, text: "generated id" },
      { id: "empty", createdAt: 3, text: "  \n" },
      { id: "expired", createdAt: 4, text: "gone", deletedAt: 5, undoUntil: 100 },
      { id: "fractional", createdAt: 1.5, text: "bad timestamp" },
      { id: "out-of-range", createdAt: 8_640_000_000_000_001, text: "bad timestamp" },
      { id: "reversed", createdAt: 4, text: "bad tombstone", deletedAt: 5, undoUntil: 4 },
      { id: "long-window", createdAt: 4, text: "bad tombstone", deletedAt: 5, undoUntil: 30_006 },
      { id: "extra", createdAt: 6, text: "unknown", surprise: true },
    ],
  }, 100);

  assert.equal(result.valid, true);
  assert.equal(result.invalid, 7);
  assert.deepEqual(result.fragments.map((row) => row.id === "valid" ? row : {
    createdAt: row.createdAt, text: row.text,
  }), [
    { id: "valid", createdAt: 1, text: "kept" },
    { createdAt: 2, text: "generated id" },
  ]);
  assert.equal(typeof result.fragments[1].id, "string");
  assert.ok(result.fragments[1].id);
});

test("restore plan appends unique records without replacement", () => {
  const { planRestore } = extractTestableLogic(readApp(), ["planRestore"]);
  const existing = [{ id: "same", createdAt: 1, text: "original" }];
  const incoming = [
    { id: "same", createdAt: 1, text: "original" },
    { id: "same", createdAt: 1, text: "changed" },
    { id: "new", createdAt: 2, text: "added" },
    { id: "bad", createdAt: -1, text: "invalid" },
  ];
  const plan = planRestore(existing, incoming, 100);
  assert.deepEqual(plan.add.map((row) => row.id), ["new"]);
  assert.equal(plan.duplicates, 1);
  assert.equal(plan.conflicts, 1);
  assert.equal(plan.invalid, 1);
  assert.equal(plan.add.some((row) => row.id === "same"), false);
});

test("restore writes every addition with one add-only transaction", async () => {
  const { restoreBackup } = extractTestableLogic(readApp(), ["restoreBackup"]);
  const writes = [];
  const tx = {
    objectStore() {
      return { add(row) { writes.push(row); } };
    },
  };
  const db = {
    transaction(store, mode) {
      assert.equal(store, "fragments");
      assert.equal(mode, "readwrite");
      queueMicrotask(() => tx.oncomplete());
      return tx;
    },
  };
  const plan = {
    add: [
      { id: "one", createdAt: 1, text: "first" },
      { id: "two", createdAt: 2, text: "second" },
    ],
    duplicates: 3,
    invalid: 4,
    conflicts: 5,
  };

  assert.deepEqual(await restoreBackup(db, plan), {
    added: 2, duplicates: 3, invalid: 4, conflicts: 5,
  });
  assert.deepEqual(writes, plan.add);
});

test("text import preserves blocks and assigns ordered provenance", () => {
  const { textImportRecords } = extractTestableLogic(readApp(), ["textImportRecords"]);
  const rows = textImportRecords("  first line\r\nsecond  \r\n\r\n\r\n# heading\nbody\n", "notes.md", 40);
  assert.deepEqual(rows.map(({ createdAt, text, source }) => ({ createdAt, text, source })), [
    { createdAt: 40, text: "  first line\nsecond", source: "from notes.md" },
    { createdAt: 41, text: "# heading\nbody", source: "from notes.md" },
  ]);
  assert.equal(rows.every((row) => typeof row.id === "string" && row.id), true);

  const boundary = textImportRecords("one\n\ntwo\n\nthree", "huge.txt", 8_640_000_000_000_000);
  assert.deepEqual(boundary.map((row) => row.createdAt), [
    8_640_000_000_000_000 - 2,
    8_640_000_000_000_000 - 1,
    8_640_000_000_000_000,
  ]);
  assert.equal(boundary.every((row) => Number.isSafeInteger(row.createdAt)
    && row.createdAt <= 8_640_000_000_000_000), true);
});

test("Markdown archive is chronological and escapes fragment structure", () => {
  const { markdownArchive } = extractTestableLogic(readApp(), ["markdownArchive"]);
  const output = markdownArchive([
    { id: "new", createdAt: 2000, text: "# newer\n- list\n* star [link]" },
    { id: "invalid-date", createdAt: 8_640_000_000_000_001, text: "must be omitted" },
    { id: "deleted", createdAt: 1500, text: "hidden", deletedAt: 1600, undoUntil: 9999 },
    {
      id: "old", createdAt: 1000, text: "# older",
      source: "safe\n```js\n~~~\n===\n---\n- forged item\n# forged heading",
    },
  ], "en-US");

  assert.ok(output.indexOf("\\# older") < output.indexOf("\\# newer"));
  assert.ok(output.includes("\\# newer\n    \\- list\n    \\* star \\[link\\]"));
  assert.ok(output.includes(
    "    Source: safe\n    \\`\\`\\`js\n    \\~\\~\\~\n    \\=\\=\\=\n    \\-\\-\\-\n    \\- forged item\n    \\# forged heading",
  ));
  assert.doesNotMatch(output, /\n(?:```|~~~|===|---|- forged item|# forged heading)/u);
  assert.doesNotMatch(output, /hidden/u);
  assert.doesNotMatch(output, /must be omitted/u);
});

test("downloads revoke their temporary object URL even when clicking fails", () => {
  const { downloadFile } = extractTestableLogic(readApp(), ["downloadFile"]);
  const originalDocument = globalThis.document;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const calls = [];
  const anchor = {
    click() { calls.push("click"); throw new Error("blocked"); },
    remove() { calls.push("remove"); },
  };
  globalThis.document = {
    createElement(name) { assert.equal(name, "a"); return anchor; },
    body: { append(node) { assert.equal(node, anchor); calls.push("append"); } },
  };
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = (url) => calls.push("revoke:" + url);
  try {
    assert.throws(() => downloadFile("ledger.json", "{}", "application/json"), /blocked/u);
    assert.equal(anchor.href, "blob:test");
    assert.equal(anchor.download, "ledger.json");
    assert.deepEqual(calls, ["append", "click", "remove", "revoke:blob:test"]);
    calls.length = 0;
    globalThis.document.createElement = () => { throw new Error("no link"); };
    assert.throws(() => downloadFile("ledger.json", "{}", "application/json"), /no link/u);
    assert.deepEqual(calls, ["revoke:blob:test"]);
  } finally {
    globalThis.document = originalDocument;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

test("browser cleanup attempts every resource after an earlier failure", async () => {
  const { runCleanups } = extractRunnerLogic(["runCleanups"]);
  const calls = [];
  await assert.rejects(() => runCleanups([
    async () => { calls.push("chromium"); throw new Error("stop failed"); },
    async () => { calls.push("server"); },
    async () => { calls.push("profile"); },
  ]), AggregateError);
  assert.deepEqual(calls, ["chromium", "server", "profile"]);
});

test("browser runner classifies uncaught exceptions and error-console events", () => {
  const { browserFailureFromEvent } = extractRunnerLogic(["browserFailureFromEvent"]);
  assert.match(browserFailureFromEvent("Runtime.exceptionThrown", {
    exceptionDetails: { text: "Uncaught", exception: { description: "Error: broken page" } },
  }), /broken page/);
  assert.match(browserFailureFromEvent("Runtime.consoleAPICalled", {
    type: "error", args: [{ value: "unsafe failure" }],
  }), /unsafe failure/);
  assert.equal(browserFailureFromEvent("Runtime.consoleAPICalled", {
    type: "log", args: [{ value: "ordinary diagnostic" }],
  }), null);
});
