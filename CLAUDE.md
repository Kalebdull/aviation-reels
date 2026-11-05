# Aviation Reels

30-second Instagram Reels that make aviation knowledge simple, made entirely in code in a modern, flowy cartoon style.

**When Kaleb gives a topic (or uploads a CapCut voice export), use the `aviation-reel` skill** (`.claude/skills/aviation-reel/SKILL.md`). It walks through research → script approval → voice → build → render → critique → deliver.

## The brain (read before making anything)
- `brain/playbook.md`: hooks, script rules, structure
- `brain/style.md`: the look and the motion
- `brain/lessons.md`: what posted results taught us (this overrides the playbook)
- `brain/library.md`: the engine API
- `brain/facts.md`: verified facts with sources
- `brain/critique.md`: the scorecard; `brain/posting.md`: Instagram posting notes
- `brain/episodes.md`: the episode log

## Render contract
- Every frame is `window.seek(t)`: a pure function of time on a 1080×1920 canvas. No `Math.random` (use `M.hash01` / `D.noise1`), no timers, no `requestAnimationFrame` in render mode, no state between frames.
- Motion is springs only (`engine/lib/motion.js`).
- Episodes live in `episodes/<NN-slug>/`. The library lives in `engine/lib/`. Reusable things go in the library, not in an episode.

## Setup
`sh setup.sh` once. Needs Node 20+, ffmpeg and Python 3.
