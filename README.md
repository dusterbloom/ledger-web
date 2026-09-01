# Ledger

Ledger is a quiet, append-only fragment notebook delivered as one
self-contained HTML file.

Open the [live demo](https://dusterbloom.github.io/ledger-web/).

## Offline use

Download `index.html` and open it in a current browser. The file contains the
app, styles, scripts, fonts, and legal notices. The GitHub Pages demo is the
canonical, most browser-compatible route because browsers vary in how they
treat storage for pages opened directly from disk.

## Using Ledger

Type a fragment and select **Keep**, or press **Command/Ctrl + Enter**. Saved
fragments are append-only: to correct one, add another fragment. Search matches
all entered terms. Delete gives you a 30-second Undo window that survives a
reload.

Keyboard controls:

- **Command/Ctrl + Enter** keeps the current fragment.
- **Command/Ctrl + F** moves focus to Ledger's search field.
- **Escape** clears search when search is focused, or closes the Recently
  deleted dialog.
- Standard **Tab**, **Shift + Tab**, **Enter**, and **Space** navigation works
  for controls.

## Backup and export

**Backup** downloads a JSON document that preserves Ledger's stored fragment
fields. **Import** merges a Ledger JSON backup without replacing existing
fragments; duplicates are skipped and conflicts are reported. Import also
accepts Markdown and plain-text files, splitting them into ordered fragments.
**Markdown** downloads a chronological, human-readable archive of live
fragments.

Keep your own backup files. Browser storage belongs to the browser profile and
can be removed when site data or the profile is cleared.

## Privacy

Ledger has no account, analytics, cloud sync, or runtime network requests.
Fragments and drafts stay in browser storage unless you explicitly import or
download a file.

## Browser support

Ledger targets current stable Chrome/Chromium, Firefox, and Safari, including
iOS Safari and Chrome on Android. GitHub Pages is the canonical supported route;
directly opening the downloaded HTML file is provided for offline use and is
subject to each browser's local-file storage policy.

## Development and tests

No install or build step is required. Run the dependency-free checks with:

```sh
node --test tests/verify.mjs
node tests/browser-smoke.mjs
```

The browser smoke suite needs a locally installed Chromium-family browser and
permission to bind a loopback HTTP port.

## Credit and license

Ledger is inspired by [Plaintext](https://github.com/veorq/Plaintext) by
Jean-Philippe Aumasson. It is an unofficial adaptation and is not affiliated
with or endorsed by the upstream author.

The upstream Plaintext code is distributed under the MIT License. Embedded
fonts retain their SIL Open Font License terms. See [LICENSE](LICENSE),
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and
[ThirdPartyLicenses](ThirdPartyLicenses).
