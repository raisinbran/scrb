# Scribe icon concepts

The shipped icon (concept A, speech bubble) is a placeholder so builds have an icon, pending the owner's decision on the final design. The three concepts stay here, and `node scripts/make-icons.mjs [bubble|wave|nib]` regenerates the icon set from any of them. Open `preview.html` to compare them.

Twelve candidate designs, four options with three variants each, are in `scribe-{h,j,w,c}{1,2,3}.svg` (each with a `-win` version); `preview-twelve-options.html` shows them all. H: bars, a gap and a written line. J: sound curves, then a scribble written by a pen. W: waveform next to a text cursor. C: sound curves next to a text cursor. They are candidates only; none is shipped. Regenerate the icon set from one with `node scripts/make-icons.mjs j1` (or any other name above).
