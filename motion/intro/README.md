# The Maplewick opening

An eight-second, silent HyperFrames composition at 1280×720 and 30 fps, following the palette, typography, and motion in the repository's `DESIGN.md`.

The three scenes show an envelope arriving, loose records gathering into a case file with a connecting thread, and the Data Detective title. The paper transitions are crossfades. All animation is deterministic and seekable through one paused GSAP timeline.

From the repository root:

```text
pnpm motion:check
pnpm motion:render
```

The render writes `public/media/intro.mp4`. Normal application builds consume that existing file and never render a video. The game skips the opening for reduced motion; Skip, completion, and playback failure each enter the agency once.

The local `gsap.min.js` is copied from the repository's pinned GSAP dependency and retains its license header. Local font files and licenses are in `fonts/` so rendering needs no font CDN.
