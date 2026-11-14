# Scribe icon concepts

The shipped icon (concept A, speech bubble) is a placeholder so builds have an icon, pending the owner's decision on the final design. The three concepts stay here, and `node scripts/make-icons.mjs [bubble|wave|nib]` regenerates the icon set from any of them. Open `preview.html` to compare them.

Options G to J (`scribe-bubblenib`, `scribe-waveline`, `scribe-sstroke`, `scribe-pencil`, each with a `-win` version; preview in `preview-simple-options.html`) are simpler candidates: one white glyph on the indigo tile, no head, mouth or person. They are candidates only; none is shipped. Regenerate the icon set from one with `node scripts/make-icons.mjs bubblenib` (or `waveline`, `sstroke`, `pencil`).
