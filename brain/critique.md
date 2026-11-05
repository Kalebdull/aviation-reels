# Critique scorecard

Score from the **rendered MP4** only (never the code or the preview). Ship when **every score is 8+**. Make at least 2 rounds on a new episode type and 1 on a routine one.

`python3 scripts/review.py <round> --project episodes/<slug>` builds the kit: `contact.png` (2 fps), `strip.png` (12 frames around the fastest action), `phone.png` (1 fps at 360 px with Instagram UI zones shaded), `loop.mp4` (twice back to back), `metrics.json`.

| Criterion | 10 looks like | Automatic cap |
|---|---|---|
| **Hook (first 2 s)** | Frame 0 already reads and moves. A familiar thing or a broken expectation by 1 s. You'd stop scrolling. | Frame 0 static or near-blank → 5. Jargon in the first line → 6 |
| **Clarity** | A non-pilot could explain it back. One idea. The mechanism is shown working, not described. | A plain dial with no mechanism → 6. Two ideas → 6 |
| **Payoff** | The key fact lands on the biggest visual moment of the reel, on its word. | Payoff on a static frame → 6 |
| **Sync** | Every visual change lands on its word (±2 frames). Captions never double up. | A visible change > 150 ms off its word → 6. Two captions on screen at once → 6 |
| **Flow** | The camera never stops; transitions are camera moves; something new every 1.5–3 s. | A static run > 2 s → 7. A fade used as a transition (except the loop) → 7 |
| **Look** | Flat, rounded, warm, simple; colour meanings respected; one focal point per moment. | Coral used for "good" or teal for "bad" → 6. Clutter (three or more things competing) → 7 |
| **Phone + safe zones** | Everything reads at 360 px wide; nothing important under the Instagram UI. | Key text in a shaded UI zone → 6. Text under 30 px → 7 |
| **Accuracy** | Every claim is in `facts.md` with a source; the instruments behave like the real ones. | An unsourced claim → 4 (fix before anything else) |
| **Sound** | Voice clear on top; the bed about 14 LU under it; soft SFX on reveals; -14 LUFS, true peak ≤ -1.5 dBTP. | Loudness off target by > 1 LU → 6 |
| **Loop + action** | It ends on a question or "save this", and the last frame flows into frame 0. | Hard stop on a static end card → 7 |

**Checks the contact sheet misses**
- Blank-frame scan: `metrics.json → blank_frames` must be empty.
- Caption swaps: at every line change, the outgoing caption is gone before the incoming one lands.
- Word sync: scrub `out/draft.mp4` at each `T.word(...)` cue and confirm the change is on that frame.
- Gauge truth: does the needle go the way the real instrument would? (TO/FROM, VSI lag, altimeter direction, AI bank.)

Write each round in `episodes/<slug>/review_log.md`: the scores, the 3 worst problems (with timestamp and cause), and the fixes.
