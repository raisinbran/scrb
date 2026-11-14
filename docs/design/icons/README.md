# Scribe icon concepts

The shipped icon (concept A, speech bubble) is a placeholder so builds have an icon, pending the owner's decision on the final design. The three concepts stay here, and `node scripts/make-icons.mjs [bubble|wave|nib]` regenerates the icon set from any of them. Open `preview.html` to compare them.

Fifteen candidate designs are in `scribe-<name>.svg` (each with a `-win` version); `preview-all-options.html` shows them all at large size and at 32 and 64 px, on light and dark. `h1 h3 j1 j3`: bars (H) or sound curves (J) followed by a pen-less scribble. `h1s h3s j1s j3s`: smoother versions where the wave gradually turns into handwriting. `r1`-`r7`: designs with a red recording dot (`#ff4d4d` with a white ring, so it keeps 3:1 contrast against the tile; colours stay in the icon SVGs). They are candidates only; none is shipped. Regenerate the icon set from one with `node scripts/make-icons.mjs j1` (or any other name above).
