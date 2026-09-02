# Ledger Icon Design

## Goal

Give Ledger an SVG icon that is visibly related to the existing Plaintext Web
icon while remaining identifiable as Ledger.

## Considered approaches

1. **Sibling monogram (selected):** preserve Plaintext's rounded tile, palette,
   scale, and bold geometric style, replacing its `P` with an `L`. This creates
   the clearest family resemblance and stays legible at favicon sizes.
2. **Ledger/book symbol:** use lines or a page shape. This describes the product
   more literally, but would not look as closely related to Plaintext.
3. **Combined `L` and page:** add document details around the monogram. This
   adds meaning but reduces clarity at 16–32 px and adds unnecessary detail.

## Design

The icon uses a 64 × 64 view box, a 64 × 64 rounded rectangle with a 14-unit
corner radius and `#f6f3ec` fill, and a bold geometric `L` in `#211f1a`.
The `L` is centered optically and uses only filled paths so rendering remains
consistent without fonts, scripts, filters, or external assets.

The SVG is delivered in two forms:

- `icon.svg`, as the reusable standalone source.
- A percent-encoded SVG data URL in the document head, preserving Ledger's
  single-file offline release.

The two forms must represent the same geometry and colors.

## Integration and validation

`index.html` receives an SVG favicon link beside the existing metadata. The
content security policy already permits data images, so no policy change is
needed.

The dependency-free verification suite will assert that Ledger includes an SVG
data favicon and that its encoded payload matches `icon.svg`. Existing tests
must continue to pass.

## Scope

No manifest, raster icon variants, Apple touch icon, animation, theme-specific
variant, or application-header logo is included.
