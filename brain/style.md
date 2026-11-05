# Style: the look and the motion

**A modern, super flowy cartoon. Super simple, so people love it.** Think a polished explainer studio: flat shapes, soft light, a camera that never stops gliding. It's one continuous little world, not a slideshow of cards.

## The look
- **Flat fills, two-tone shading, no outlines.** Every object has a base colour and one shade (usually the lower or far side). Highlights are a single lighter shape.
- **Rounded everything.** Corners, wing tips, clouds, buttons. Nothing sharp except warnings.
- **Soft, warm depth.** Parallax layers, atmospheric haze toward the horizon, soft drop shadows under floating things. No hard black shadows.
- **Simple.** If a shape doesn't help the idea, delete it. One focal subject per moment.
- **Friendly, adult-appropriate.** A cartoon a pilot isn't embarrassed to share: no goofy faces on objects, no baby-ish proportions on instruments. Instruments are drawn accurately.

## Palettes (in `engine/lib/draw.js` → `D.PAL`)
| Palette | When |
|---|---|
| `day` | Default. A bright blue sky, green hills, white clouds. |
| `golden` | Sunset and calm "wrap-up" moments, the payoff. |
| `night` | Night flying, approach lights, a cockpit glow. |
| `imc` | Inside a cloud. Use with `WORLD.fog()`. |

An episode can move between palettes as part of the story (day → into the cloud → breaking out at golden hour).

## Colour meaning (identical in every palette, in `D.C`)
| Colour | Means |
|---|---|
| **Amber** `#FFB23F` | Signal, ram air, attention, the word being spoken |
| **Teal** `#1FC3A3` | Good, locked, correct, static/steady |
| **Coral** `#FF6A5C` | Error, warning, wrong answer, danger |
| **Ink** `#1C2A4D` | Text on light things |
| **Panel** `#1D2643` | Instrument panels and the cockpit |

Never use coral for anything good or teal for anything bad. Viewers learn the code within one episode.

## Type
- **Inter**, bundled in `assets/fonts/`. ExtraBold (800) for captions and pills, Black (900) for big slams.
- Captions: 60 px, white on a 55% navy pill, centred at y≈1350, wrapped at 760 px (fewest lines, then balanced), max 3 lines. Karaoke: the spoken word turns amber; `*emphasis*` words stay amber.
- Nothing on screen smaller than 30 px (phones), except gauge numerals, which follow real instrument proportions.

## Motion (the "flowy" part)
- **Springs only** (`engine/lib/motion.js`). There are no easing curves and no linear moves except constant-speed things: flight, flow dots and clouds.
  - `snappy`: pops, labels, toggles. `default`: cards, camera, needles (a tiny overshoot reads as mechanical). `heavy`: big type, slow reveals, the logo (no overshoot). `playful`: characters only.
- **The camera never stops.** Every shot has a slow drift, push or float. Camera moves use the camera spring in `T.cam()` (critically damped, about 0.7 s): glide, never jerk.
- **Everything idles.** Propellers spin, clouds drift, flow dots travel, characters breathe, stars twinkle. A held frame still feels alive.
- **Secondary motion.** When something lands, something nearby reacts: a needle settles, a label follows half a beat later, a little bob.
- **Transitions are camera moves, not effects.** In order of preference:
  1. **Same shot, camera flies** to the next subject (best: one continuous world).
  2. **`zoom`**: dive into an object (the pitot tube, a gauge glass) and come out inside it.
  3. **`flow`**: an organic liquid wipe (the house transition).
  4. **`iris`**: opens from the thing being talked about.
  5. **`whip`**: a fast pan, for "meanwhile" or "the other side".
  6. `cut` only on a hard beat; `fade` only for the loop seam.
- **No:** bouncy rubber easing on instruments, glows on UI, particle bursts, lens flares, shaky cam, spinning-text intros, everything fading in, dead time.

## Composition (Instagram Reels, 1080×1920)
- Must-read visuals: **x 70–910, y 220–1200.** Captions own y 1220–1480.
- Instagram covers: the top bar (y < 220), the bottom caption area (y > 1500), and the right action rail (x > 920, y 900–1500).
- **One focal point per moment.** The thing being talked about is the biggest, brightest or nearest thing.
- Fill the frame: no empty third of the frame for more than a second. Frame big subjects so they're cropped edge-to-edge rather than floating small in the middle.
- Header pill `AVIATION REELS · <TOPIC>` at y≈262 (set in `engine/lib/brand.js`).

## Frame 0
Frame 0 is the thumbnail, the first impression and the loop seam. It already shows the payoff composition (or the hook's question) **in motion**, with the hook keyword visible. Never blank, never static.
