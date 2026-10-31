# Maplewick visual identity

## Style prompt
A cozy miniature records agency in a sunlit storybook town. Honey-colored timber, cream case files, tactile cork, handwritten-looking headings, sage index tabs and brass details. Players are thoughtful detectives restoring clarity, not accusing people of crime. The office is a small low-poly diorama with a desk, cork evidence board and archive shelves. Readable paper panels sit above the room. Every clue comes from imported records; narrative copy supplies warmth without inventing factual events.

## Colors
- Paper: #F3EBDD; raised paper: #FFF9EE.
- Ink: #29251F; muted text: #625749.
- Wood: #815735; dark timber: #493527; cork: #AE8157.
- Sage: #4E6444; accent brass: #B67A32; thread red: #A44838.
- Use ink on paper for body text and light paper on dark sage for primary actions. Brass is decorative, not small essential text.

## Typography
Fraunces for titles and story voice; Public Sans for controls and evidence. Keep evidence at least 14px and controls comfortable on touch. Self-host small font subsets if obtainable; Georgia and system-ui are reliable fallbacks. Intro typography is larger for 720p video: headings 60px+, body 24px+, labels 18px+.

## Motion
Camera transitions 0.8 seconds, power2.inOut. Cards settle in 0.3 seconds, power2.out. Thread drawing 0.4 seconds. Confirmation stamp 0.45 seconds, restrained back.out. One camera owner; GSAP timelines cleaned up on unmount and replacement. Finite event-driven motion; demand rendering is idle between interactions. Reduced motion enters the same states immediately.

## Opening
Eight seconds, 1280x720, 30fps. Envelope arrives, loose records gather into a case file, a thread connects two clues, title reveals: Data Detective / The Maplewick Casefiles. Text: Every record has a story. Help the pieces find their place. Warm paper wipes or crossfades connect scenes. Skippable from the start; no required narration. Source in motion/intro; rendered video public/media/intro.mp4 with a poster/fallback. Shared palette and typography match the live game.

## Avoid
Neon cyberpunk, dashboard tile grids as the main game, heavy bloom/postprocessing, illegible text inside WebGL, endless camera drift, fabricated allegations, compulsory timed decisions, and decorative motion that blocks repairs or import.
