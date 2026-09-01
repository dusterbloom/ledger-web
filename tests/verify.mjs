import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appPath = resolve(root, "index.html");
const browserPath = resolve(root, "tests/browser-smoke.mjs");
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

test("capture, search, stream, status, and recovery controls are semantic", () => {
  const html = readApp();
  for (const id of ["entry", "save", "search", "stream", "status", "recentlyDeleted"]) {
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

test("only unexpired tombstones remain undoable", () => {
  const { unexpiredTombstones } = extractTestableLogic(readApp(), ["unexpiredTombstones"]);
  const rows = [
    { id: "live", text: "x", createdAt: 1 },
    { id: "old", text: "x", createdAt: 1, deletedAt: 2, undoUntil: 99 },
    { id: "new", text: "x", createdAt: 1, deletedAt: 2, undoUntil: 101 },
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
