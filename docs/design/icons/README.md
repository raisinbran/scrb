# Scribe icon concepts

The shipped icon (concept A, speech bubble) is a placeholder so builds have an icon, pending the owner's decision on the final design. The three concepts stay here, and `node scripts/make-icons.mjs [bubble|wave|nib]` regenerates the icon set from any of them. Open `preview.html` to compare them.

Options D, E and F (`scribe-talk-*.svg`, preview in `preview-talk-to-pen.html`) show a head, mouth or person talking on the left, sound arcs, and a pen writing on the right. They are candidates only; none is shipped. Regenerate the icon set from one with `node scripts/make-icons.mjs talk-head` (or `talk-mouth`, `talk-bust`).
