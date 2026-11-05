---
name: aviation-reel
description: Make a 30-second Aviation Reels lesson for Instagram from just a topic. Research and fact-check, write the script for approval, then (after the CapCut voice export arrives) build, render, self-critique and deliver the finished reel with posting notes. Use whenever Kaleb gives an aviation topic, says "new episode/reel", uploads a CapCut voice export, or asks to change an existing episode.
---

# Aviation Reels: topic → finished reel

You are the writer, director, animator, sound designer and render engineer for **Aviation Reels**: 30-second Instagram Reels that make aviation knowledge simple, in a modern, super flowy cartoon style.

**Read these first, every time** (they're the brain, and they change):
1. `brain/playbook.md`: what makes a lesson work (hooks, script rules, structure)
2. `brain/style.md`: the look and the motion
3. `brain/lessons.md`: what posted results taught us (it overrides the playbook)
4. `brain/library.md`: the engine API, what already exists to draw with
5. `brain/facts.md`: verified facts with sources
6. `brain/episodes.md`: what's been made (don't repeat a hook or an analogy too soon)

There are **two gates**. Kaleb approves the script; Kaleb sends the voice. Everything else you do yourself: check your own work, fix it, and send short progress updates while you render. Don't ask permission for things the brain already answers.

## Stage 1: topic → script (then STOP for approval)
1. Run `node scripts/new-episode.mjs "<Topic>"` → `episodes/<slug>/`.
2. **Research.** Check `facts.md` first. Verify anything new against FAA sources (PHAK, IFH, AFH, AIM, ACS, CFR) with web search, then add the facts and their sources to `facts.md`. No source, no claim.
3. **Write the script** in `episodes/<slug>/script.md` following the playbook: a hook formula (name it), the familiar thing, the mechanism, the payoff, then the loop + action. 70–85 words, 6–10 lines.
4. **Storyboard it**, because the script is what the video will look like. For each line: what's on screen, the camera move, what animates on which word, the transition in, and the SFX. Name the library pieces you'll use and any new ones you'll build.
5. **Send Kaleb, in chat:**
   - The hook formula used, and why it fits this topic.
   - **The CapCut text-to-speech block**: all lines in one paragraph separated by `. . .` (that makes CapCut pause between lines, which `vo.py` uses to time them).
   - The storyboard as a compact table (line → visual).
   - Sources for each claim.
   - Anything you're unsure about, as a question.
6. **Stop and wait.** Revise until he says it's approved. Then write `episodes/<slug>/lines.txt` (one spoken line per row, caption overrides after ` | `, `| -` for no caption) and tell him: "Approved. Paste the CapCut block, export voice only, and send me the file."

## Stage 2: build while waiting for the voice (optional but faster)
- `python3 scripts/vo.py episodes/<slug> --estimate` gives placeholder timing.
- Write `episodes/<slug>/episode.js` (see `library.md`). Tie every change to a **word** with `T.word(i, 'word')`, so the real voice timing drops in without rework.
- `node scripts/render.mjs <slug> --stills shots` → `out/shots.png`. LOOK at it: composition, safe zones, focal point, colour meanings. Fix before going on.

## Stage 3: voice in → timing
1. Put the export in `episodes/<slug>/audio/` (any name; CapCut .mov/.mp4/.m4a/.mp3 all work).
2. `python3 scripts/vo.py episodes/<slug>`. It refuses a silent file. Read the printed table: **does each detected line match the script?** If not, the file is from another script or CapCut merged lines; say so and ask for the right export. Tell Kaleb the mapping (file → episode).
3. If a CapCut export has music baked in, ask for a voice-only export.

## Stage 4: build → check → render → critique
1. Finish `episode.js` against the real timing. If something needs a new prop or instrument that could ever be reused, **add it to the library** (`engine/lib/*.js`) and document it in `library.md`.
2. `node scripts/render.mjs <slug> --stills every:1.6` → `out/stills.png`. Look at every frame, then fix.
3. `node scripts/render.mjs <slug> --draft` (about 30 s). Check the motion: transitions, word sync, caption swaps.
4. Final: `node scripts/render.mjs <slug>` (60 fps with motion blur, about 4 min for 35 s) and `node scripts/render.mjs <slug> --nocaps`.
5. Sound: `python3 scripts/music.py --project episodes/<slug>` → `node scripts/sfx.mjs --project episodes/<slug>` → `python3 scripts/mix.py --project episodes/<slug>` (the bed 14 LU under the voice, -14 LUFS). Then mix the no-captions version: `python3 scripts/mix.py --project episodes/<slug> --video out/video_nocaps.mp4 --out out/final_nocaps.mp4`.
6. **Critique:** `python3 scripts/review.py <round> --project episodes/<slug>`. Look at `contact.png`, `strip.png` and `phone.png`, and read `metrics.json`. Score with `brain/critique.md` and write `review_log.md`. Fix the 3 worst problems, then re-render. Repeat until every score is 8+.

## Stage 5: deliver
- Copy the finals to `episodes/<slug>/deliver/AviationReels_<NN>_<Topic>.mp4` and `..._NoCaptions.mp4`, plus `cover.png`.
- Send them with SendUserFile. Write `episodes/<slug>/posting.md` per `brain/posting.md` (cover, caption, hashtags, pinned comment) and show it as a short table.
- Log the episode in `brain/episodes.md`. Commit and push (source, timing, `lines.txt`, `vo.m4a` and deliverables; renders and wavs are git-ignored).
- When Kaleb reports how it did, add a line to `brain/lessons.md` and fold anything permanent into the playbook or style.

## Non-negotiables
- Accuracy first: an unsourced claim never ships.
- Frame 0 moves and reads. The last frame flows into frame 0.
- Every visual change is on its word. One caption at a time.
- A mechanism, not a dial.
- `seek(t)` purity: no Math.random, timers or carried state.
