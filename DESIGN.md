# Maplewick visual identity

## Style prompt

A cozy detective's records agency after dusk. A cone of lamplight reveals a honey-colored desk and cream case files against deep pine shadows. Tactile cork, numbered evidence tags, red thread, pencil marks, brass hardware and a stamped dossier make the investigation immediately legible. Players are thoughtful detectives restoring clarity, not accusing people of crime. The office is a low-poly diorama with a desk, cork evidence board and archive shelves. Readable HTML case files sit beside the room. Every clue comes from imported records; narrative copy supplies warmth without inventing factual events.

## Colors

- Paper: #F3EBDD; raised paper: #FFF9EE.
- Ink: #29251F; muted text: #625749.
- Wood: #815735; dark timber: #493527; cork: #AE8157.
- Sage: #4E6444; accent brass: #B67A32; thread red: #A44838.
- Room shadows: #172823; pine panel: #233D34; lamplight: #E5BA72.
- Use ink on paper for body text and light paper on dark sage for primary actions. Brass is decorative, not small essential text.

## Typography

Fraunces for titles and story voice; Public Sans for controls and evidence. Keep evidence at least 14px and controls comfortable on touch. Self-host small font subsets if obtainable; Georgia and system-ui are reliable fallbacks. Intro typography is larger for 720p video: headings 60px+, body 24px+, labels 18px+.

## Motion

Camera transitions 0.8 seconds, power2.inOut. Cards settle in 0.3 seconds, power2.out. Thread drawing 0.4 seconds. Confirmation stamp 0.45 seconds, restrained back.out. One camera owner; GSAP timelines cleaned up on unmount and replacement. Finite event-driven motion; demand rendering is idle between interactions. Reduced motion enters the same states immediately.

## Opening

Eight seconds, 1280x720, 30fps. A desk lamp reveals a sealed dossier; records and a photo spread across the desk; a magnifying glass finds a mismatch; thread connects two numbered clues; a red CASE OPEN stamp and the title reveal: Data Detective / The Maplewick Casefiles. The title frame must still read as an investigation when paused. Text: Every record has a story. Follow the evidence. Use lamplight, desk shadows, and tactile paper transitions. Skippable from the start; no required narration. Source in motion/intro; rendered video public/media/intro.mp4 with a poster/fallback. Shared palette and typography match the live game.

## Avoid

Neon cyberpunk, generic true-crime imagery, dashboard tile grids as the main game, heavy bloom/postprocessing, illegible text inside WebGL, endless camera drift, fabricated allegations, compulsory timed decisions, and decorative motion that blocks repairs or import.
