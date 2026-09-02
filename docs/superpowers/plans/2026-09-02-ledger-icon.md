# Ledger Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone Ledger SVG icon and embed the identical artwork as the app favicon.

**Architecture:** Keep the reusable SVG in `icon.svg` and place a percent-encoded copy in the document head so `index.html` remains a self-contained offline release. A dependency-free Node test decodes the favicon and compares it with the source SVG.

**Tech Stack:** SVG, HTML, Node.js built-in test runner

## Global Constraints

- Use a 64 × 64 view box and a 14-unit rounded-square corner radius.
- Use `#f6f3ec` for the tile and `#211f1a` for the monogram.
- Use only filled vector geometry with no fonts, scripts, filters, or external assets.
- Do not add a manifest, raster variants, Apple touch icon, animation, theme-specific variant, or application-header logo.

---

### Task 1: Add and embed the Ledger icon

**Files:**
- Create: `icon.svg`
- Modify: `index.html:9`
- Test: `tests/verify.mjs`

**Interfaces:**
- Consumes: the existing `readApp()` helper and repository root path in `tests/verify.mjs`
- Produces: a standalone SVG and an equivalent `data:image/svg+xml` favicon link

- [x] **Step 1: Write the failing favicon-equivalence test**

Add this test near the other release-level checks in `tests/verify.mjs`:

```js
test("favicon matches the standalone Ledger icon", () => {
  const html = readApp();
  const source = readFileSync(resolve(root, "icon.svg"), "utf8").trim();
  const encoded = html.match(/<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,([^"]+)">/)?.[1];
  assert.ok(encoded, "SVG favicon missing");
  assert.equal(decodeURIComponent(encoded), source);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/verify.mjs --test-name-pattern="favicon matches"`

Expected: FAIL because `icon.svg` does not exist.

- [x] **Step 3: Add the standalone SVG and embedded favicon**

Create `icon.svg` with:

```svg
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#f6f3ec'/><path fill='#211f1a' d='M18 12h12v32h20v10H18V12Z'/></svg>
```

Add this line after the description metadata in `index.html`:

```html
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23f6f3ec'/%3E%3Cpath fill='%23211f1a' d='M18 12h12v32h20v10H18V12Z'/%3E%3C/svg%3E">
```

- [x] **Step 4: Run focused and full verification**

Run: `node --test tests/verify.mjs --test-name-pattern="favicon matches"`

Expected: PASS.

Run: `node --test tests/verify.mjs`

Expected: all tests pass.

Run: `node tests/browser-smoke.mjs`

Expected: browser smoke checks pass.

- [x] **Step 5: Commit the implementation**

```bash
git add icon.svg index.html tests/verify.mjs docs/superpowers/plans/2026-09-02-ledger-icon.md
git commit -m "feat: add Ledger icon"
```
