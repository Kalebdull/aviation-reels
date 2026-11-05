# Library: how to build an episode

Everything is a pure function of time `t`: `window.seek(t)` paints one frame. **Never** use `Math.random`, `Date`, timers, `requestAnimationFrame` or state carried between frames. Use `M.hash01(seed, i)` or `D.noise1(seed, x)` for randomness.

An episode is one file: `episodes/<slug>/episode.js`. It calls `EPISODE({...})` with a list of shots. The library below draws the world. **When an episode needs something that isn't here, add it to the library (props.js, instruments.js…) if it could ever be reused**, then document it in this file. That is how the brain gets better every episode.

## Episode skeleton
```js
(function () {
  const M = window.M, D = window.D, C = D.C, WO = window.WORLD, P = window.PROPS, I = window.INST, UI = window.UI;
  EPISODE({
    topic: 'VOR TO/FROM',        // header: AVIATION REELS · VOR TO/FROM
    loop: true,                  // last 0.5 s fades back into frame 0
    tail: 1.0,                   // seconds after the last word
    setup(T) {                   // runs once: register sound cues on the words they belong to
      T.cue(T.word(3, 'flip').t0, 'chime', 0.8);
    },
    shots: [
      { id: 'hook', draw(g, s) { /* frame 0 already moving */ } },
      { id: 'escalator', at: 'seg:1-0.15', trans: 'flow', draw(g, s) { ... } },
      { id: 'cdi', at: 'word:4:needle', trans: { type: 'zoom', x: 540, y: 800 }, draw(g, s) { ... } },
    ],
  });
})();
```
- `at`: `'seg:3'` (line 3 starts), `'seg:3+0.4'`, `'end:3'` (line 3 ends), `'word:3:needle'` (that word starts), or seconds. Shot changes usually land **0.1–0.2 s before** the line that needs them.
- `trans`: how the shot **arrives**: `flow` (default), `zoom` {x,y}, `iris` {x,y}, `whip` {dir}, `cut`, `fade`. A whoosh cue is added automatically.
- `draw(g, s)` paints the **whole frame**. `s = { t, lt, dur, T, id, i }`. `t` is global time (use it for idle motion, so a shot continues smoothly), and `lt` is time since the shot started.

## Timeline helpers `T`
| | |
|---|---|
| `T.seg(i)` | `{ t0, t1, text, words:[{w,t0,t1}] }` for spoken line i |
| `T.word(i, 'needle')` | `{ t0, t1 }` of the first word in line i starting with "needle" (or pass an index) |
| `T.in(t, t0, preset)` | 0 → 1 spring from t0 (clamped; `default` allows a tiny overshoot) |
| `T.out(t, t1)` | 1 → 0 from t1 |
| `T.win(t, t0, t1)` | in × out: something that appears, then leaves |
| `T.track(t, [{t, v, s}])` | a value that changes several times, one spring per change (needles, flow, zoom) |
| `T.cam(t, [{t, x, y, z, rot}])` | the camera, on the smooth camera spring |
| `T.cue(t, type, gain)` | sound: `chime` reveal/lock, `blip` label, `pop` appear, `tick` small, `beep2` warning, `whoosh`, `swish` |

**Sync rule:** tie every visual change to a *word* (`T.word`), not a guessed time. When the voice says "flip", the flag flips.

## World `WORLD` (one continuous cartoon world with parallax)
World coordinates: x → right, y ↓, horizon at y = 0, sky is negative y. The camera `{x, y, z, rot}` is the world point at screen centre (540, 880).
| | |
|---|---|
| `WO.backdrop(g, t, cam, 'day', {hills, sun, sunAt})` | sky gradient, sun, stars (night), two far cloud layers, three parallax hill layers with trees, haze |
| `WO.view(g, cam, f, () => {...})` | draw in world space at depth f (1 = the action plane, 0.3 = far hills) |
| `WO.toScreen(cam, x, y, f)` | where a world point lands on screen (for labels on world things) |
| `WO.foreground(g, t, cam, pal)` | near clouds that pass in front of the action |
| `WO.cloud(g, pal, x, y, w, seed)` | one cloud; `WO.cloudField(...)` for a drifting field |
| `WO.hills(g, pal, cam, f, color, {amp, base, trees})` | a custom hill layer |
| `WO.fog(g, amount)` | full-screen IMC whiteout |

**Flying:** move the camera with the plane (`cam.x = plane.x`); the parallax does the rest. Climb by moving `cam.y` up.

## Props `PROPS`
| | |
|---|---|
| `P.plane(g, x, y, {view:'side'\|'rear'\|'top', s, rot, bank, t, flip, gear, prop, lights})` | the series airplane: a high-wing trainer, white with a blue stripe and coral pinstripe. `t` spins the prop and blinks the strobe. `rear` view + `bank` for turns. `top` for maps. |
| `P.person(g, x, y, {s, facing, arm, t, walk, shirt})` | a simple rounded character for the familiar-life scenes |
| `P.vorStation(g, x, y, {s, t, rings})` | the white cone VOR building; `rings` sends signal rings |
| `P.vorSymbol(g, x, y, {r, rose})` | the chart hexagon symbol with an optional compass rose |
| `P.compassRose(g, x, y, r, {rot, labels})` | 360° rose with N/E/S/W |
| `P.runway(g, x, y, {len, wid, rot, num})` | top-down runway with threshold bars and numbers |
| `P.approachView(g, t, {reveal, fog})` | pilot's-eye view of a precision approach: fog clearing, approach lights with the rabbit, green threshold, glare shield |

## Instruments `INST`
`I.gauge(g, type, x, y, r, value, opts)`: accurate, working instruments.
| type | value |
|---|---|
| `asi` | knots (white, green and yellow arcs, red line) |
| `alt` | feet (`opts.baro` = Kollsman window text) |
| `vsi` | feet per minute (0 at 9 o'clock, UP/DN) |
| `ai` | `{ pitch, bank }` in degrees (right bank +) |
| `hi` | heading in degrees |
| `cdi` | `{ obs, dev (-1..1 full scale), flag: 'TO'\|'FROM'\|'OFF' }` |

Mechanism parts: `I.tube(g, points, t, {width, flow, speed, color})` (a pipe with air dots flowing), `I.capsule(g, x, y, s, expand)` (aneroid wafers), `I.panel(g, x, y, w, h)` (the dark panel slab).

## Drawing toolkit `D`
`D.rr` rounded rect, `D.circle`, `D.fill`, `D.at(g, x, y, rot, s, fn)` local transform, `D.alpha(g, a, fn)`, `D.text(g, str, x, y, {size, weight, color, align})`, `D.pill`, `D.card`, `D.arrow(g, x1, y1, x2, y2, progress)`, `D.flowLine(g, pts, t, {color, speed, gap})` (dots travelling a path), `D.check` / `D.cross` / `D.warn` (animated badges, pass a progress), `D.softShadow` / `D.noShadow`, `D.vgrad`, `D.rgba`, `D.noise1`.

## UI overlay `UI` (screen space, drawn after the world)
- `UI.slam(g, 'KEYWORD', x, y, t, tIn, tOut, {bg, color, size, pill:false})`: a keyword that slams in on its word.
- `UI.label(g, 'PITOT TUBE', x, y, t, tIn, {to:[x,y], tOut})`: a label with a dotted leader line to the thing.
- Captions and the header are drawn automatically from `timing.js` and `brand.js`.

## Recipes
- **Dive into a mechanism:** end shot A with the camera pushing toward the part (`T.cam` with a rising z). Shot B arrives with `trans: { type: 'zoom', x, y }` at that part's screen position and starts as a close-up of the inside.
- **Return to a place:** write the scene as a function (`tubeScene(g, t, o)`) and call it from two shots with different options (ice, flow). The movie feels continuous because the place is the same.
- **A needle that answers the voice:** `T.track(t, [{t: 0, v: 0}, {t: T.word(3, 'swings').t0, v: 110}])`.
- **Split composition:** world scene in the top half (y 250–700), instrument card below (y 800–1180).
- **Quiz moment:** freeze the motion to a slow drift, put a big `?` slam, and give the answer on the next line's first word with a `chime`.
