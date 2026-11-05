# Aviation Reels

35–45 second aviation lessons for Instagram, made in code: research, script, CapCut voice, animation, sound and delivery. The brain lives in `brain/`, the engine in `engine/`, and each reel in `episodes/`.

## How to make a reel
1. In Claude Code (in this repo), type a topic: **"New reel: why the TO/FROM flag ignores your heading"**.
2. Claude researches it, then sends you the **script** (as a CapCut text-to-speech block), a storyboard and sources. Ask for changes until you approve it.
3. Paste the block into CapCut text-to-speech, export **voice only**, and send the file.
4. Claude times the animation to your voice, renders, critiques its own render, and delivers `AviationReels_NN_Topic.mp4` + `_NoCaptions.mp4`, a cover, and posting notes (caption, hashtags, pinned comment).
5. After it's posted, tell Claude how it did. The lessons go into the brain.

## Setup (once)
```sh
sh setup.sh          # Node packages, Chromium, Python audio libraries
```
Needs Node 20+, ffmpeg and Python 3.9+. On a Mac: `brew install node ffmpeg python`.

## By hand
```sh
node scripts/new-episode.mjs "Pitot tube"                 # episodes/NN-pitot-tube/
python3 scripts/vo.py episodes/NN-pitot-tube              # voice → word timing
node scripts/render.mjs NN-pitot-tube --stills shots      # one still per shot + contact sheet
node scripts/render.mjs NN-pitot-tube --draft             # quick 30 fps check
node scripts/render.mjs NN-pitot-tube                     # final 60 fps
python3 scripts/music.py --project episodes/NN-pitot-tube
node scripts/sfx.mjs --project episodes/NN-pitot-tube
python3 scripts/mix.py --project episodes/NN-pitot-tube   # → out/final.mp4
python3 scripts/review.py 1 --project episodes/NN-pitot-tube
```
Preview in a browser: open `engine/index.html?ep=NN-pitot-tube` (space to play).

## What's where
| | |
|---|---|
| `brain/` | playbook, style, lessons, facts, library API, critique, posting, episode log |
| `engine/` | the canvas engine: springs, world, props, instruments, captions, transitions |
| `scripts/` | vo timing, render, music, SFX, mix, review, new episode |
| `episodes/_style-test/` | a look test (stand-in voice), and a worked example of the engine |
| `episodes/_template/` | what `new-episode.mjs` copies |
| `assets/fonts/` | Inter (SIL Open Font License, see OFL.txt) |
