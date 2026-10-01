# Ledger

Ledger is a quiet, append-only fragment notebook delivered as one
self-contained HTML file.

## Never lose a note

Ledger is always ready to type in. Every fragment is written to the browser with
strict durability, and Ledger asks the browser to keep its storage persistent.

After your first fragment, Ledger asks once for a **safety-copy folder**. From
then on it appends every change to `Ledger/ledger.jsonl` in that folder and keeps
a readable `Ledger/ledger.md` next to it. The log is only ever appended to, so a
bug or an empty browser can never erase what is already in it. Ledger remembers
the folder; if the browser asks again, your next click or key press re-grants it.

If the browser's data is ever cleared, open Ledger and choose **Restore from
safety copy…**: everything in the folder comes back. Older `latest.json` and
`snapshots/` backups in that folder are merged in automatically. Put the folder
somewhere that is itself backed up (Time Machine, an external drive) to survive
a dead disk too.

Browsers that cannot write to folders (Safari, Firefox) keep working; use
**Backup** to download a copy.

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

The safety-copy folder is the durable copy. Manual JSON and Markdown exports
remain useful for off-device or versioned backups. Browser storage belongs to
the browser profile and may disappear when site data or the profile is cleared.

## Privacy

Ledger has no account, analytics, cloud sync, or runtime network requests.
Fragments are written only to the folder you select and to the browser's local
recovery cache.

## Browser support

The safety-copy folder needs a desktop Chromium browser with the File System
Access API, such as current Chrome or Edge. Other browsers keep full editing
with browser storage plus downloaded backups. GitHub Pages is the canonical supported route; directly opening the HTML
file is subject to the browser's local-file and directory-access policies.

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
