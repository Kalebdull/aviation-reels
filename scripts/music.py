#!/usr/bin/env python3
"""music.py — synthesize an original, minimal track in code. Same timeline as the picture.

    python3 music.py --project .                     reads bpm + duration from reel/film.js
    python3 music.py --project . --style warm --seed 4 --key D

Styles: soft (default for the series: light pulse, warm plucks, no clap, sits ~14 LU under the voice),
        clean (tight kick, soft clap, plucked chords), warm (rounder, slower hats, Rhodes-ish keys),
        drive (four-on-the-floor, busier bass). All sit under a voiceover: no pads, no vocals, no risers.
Writes audio/music.wav (48 kHz stereo). If audio/cues.json exists, the music lands a final stab on the CTA thump.
"""
import argparse, json, os, re
import numpy as np
from scipy.signal import butter, sosfilt
import soundfile as sf

SR = 48000
NOTES = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def film_meta(project):
    p = os.path.join(project, 'reel', 'film.js')
    bpm, dur = 96.0, 30.0
    cj = os.path.join(project, 'audio', 'cues.json')   # episodes: duration comes from the render's cue file
    if os.path.exists(cj):
        dur = float(json.load(open(cj))['duration'])
    if os.path.exists(p):
        s = open(p).read()
        m = re.search(r'\bbpm:\s*([\d.]+)', s); bpm = float(m.group(1)) if m else bpm
        m = re.search(r'\bduration:\s*([\d.]+)', s); dur = float(m.group(1)) if m else dur
    return bpm, dur


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def lp(x, f, order=2):
    return sosfilt(butter(order, min(f, SR / 2 - 100), 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def env(n, a, d):
    t = np.arange(n) / SR
    e = np.exp(-t / d)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e


def kick(rng, punch=1.0):
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 46 + 110 * np.exp(-t / 0.035) * punch
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * env(n, 0.001, 0.22)
    click = hp(rng.standard_normal(n), 3000) * env(n, 0.0005, 0.004) * 0.25
    return np.tanh((x + click) * 1.6) * 0.9


def clap(rng):
    n = int(0.3 * SR)
    noise = bp(rng.standard_normal(n), 900, 5200)
    e = np.zeros(n)
    for k, o in enumerate([0, 0.009, 0.018]):
        i = int(o * SR); e[i:] += env(n - i, 0.0005, 0.012 if k < 2 else 0.11)
    return noise * e * 0.35


def hat(rng, open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    return hp(rng.standard_normal(n), 7000) * env(n, 0.0005, 0.08 if open_ else 0.018) * 0.16


def pluck(midi, dur, bright=1.0, warm=False):
    n = int(dur * SR); t = np.arange(n) / SR
    f = hz(midi)
    x = np.zeros(n)
    for h in range(1, 9):
        amp = (1 / h) * (0.6 if (h % 2 == 0 and warm) else 1)
        x += amp * np.sin(2 * np.pi * f * h * t + h) * np.exp(-t * (2.2 + h * (0.9 if warm else 1.8) / bright))
    x *= env(n, 0.003, 0.9 if warm else 0.55)
    if warm:  # gentle tine shimmer
        x += 0.08 * np.sin(2 * np.pi * f * 4.01 * t) * np.exp(-t * 9)
    return x * 0.16


def bass(midi, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    f = hz(midi)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sign(np.sin(2 * np.pi * f * t))
    x = lp(x, 900)
    return x * env(n, 0.004, dur * 0.7) * 0.32


def add(buf, x, t, gain=1.0, pan=0.0):
    i = int(round(t * SR))
    if i >= buf.shape[0] or i + len(x) <= 0:
        return
    j = min(buf.shape[0], i + len(x))
    s = x[max(0, -i): j - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[max(0, i):j, 0] += s * l * 1.414
    buf[max(0, i):j, 1] += s * r * 1.414


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--project', default='.')
    ap.add_argument('--bpm', type=float)
    ap.add_argument('--duration', type=float)
    ap.add_argument('--style', default='soft', choices=['soft', 'clean', 'warm', 'drive'])
    ap.add_argument('--key', default='A', help='root of the minor key (default A minor)')
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--out', default='audio/music.wav')
    a = ap.parse_args()
    bpm0, dur0 = film_meta(a.project)
    bpm = a.bpm or bpm0; dur = a.duration or dur0
    rng = np.random.default_rng(a.seed)
    spb = 60 / bpm
    nbeats = int(np.ceil(dur / spb))
    buf = np.zeros((int((dur + 2.5) * SR), 2))
    root = 57 + (NOTES[a.key] - 9)  # A3 = 57
    # vi–IV–I–V in the relative major, voiced around the root (i, VI, III, VII of the minor key)
    prog = [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 9]]
    prog = [prog[i] for i in rng.permutation(4)] if a.seed != 1 else prog
    cta_t = None
    cpath = os.path.join(a.project, 'audio', 'cues.json')
    if os.path.exists(cpath):
        cues = json.load(open(cpath))['cues']
        th = [c['t'] for c in cues if c['type'] == 'thump' and c.get('gain', 1) >= 0.95]
        cta_t = th[-1] if th else None
    end_beat = int(round(cta_t / spb)) if cta_t else nbeats + 1   # no CTA thump: play to the end (loop-friendly)
    K, C = kick(rng), clap(rng)
    warm = a.style in ('warm', 'soft')
    soft = a.style == 'soft'
    for b in range(nbeats):
        t = b * spb
        bar, beat = divmod(b, 4)
        chord = prog[(bar // 1) % 4] if a.style == 'drive' else prog[(bar // 2) % 4]
        intro = bar == 0
        tail = b >= end_beat
        if tail:
            if b == end_beat:  # final stab on the CTA downbeat, then let it ring
                add(buf, K, t, 1.0)
                for k, iv in enumerate(chord):
                    add(buf, pluck(root + iv + 12, 3.5, 1.2, warm), t + k * 0.012, 0.9, (k - 1.5) * 0.3)
                add(buf, bass(root + chord[0] - 12, 2.5), t, 1.0)
            continue
        # drums
        if a.style == 'drive' or beat in (0, 2) or (beat == 3 and bar % 2 == 1 and not intro and not soft):
            add(buf, K, t, (0.95 if beat == 0 else 0.8) * (0.55 if soft else 1))
        if beat in (1, 3) and not intro and not soft:
            add(buf, C, t, 0.9 if not warm else 0.6, 0.05)
        for h in (0, 1) if not warm else (1,):
            open_ = (h == 1 and beat == 3 and bar % 2 == 1)
            add(buf, hat(rng, open_ and not soft), t + h * spb / 2, (0.6 if h == 0 else 0.9) * (0.5 if intro else 1) * (0.6 if soft else 1), 0.35)
        if a.style == 'drive' and not intro:
            for h in (0.25, 0.75):
                add(buf, hat(rng), t + h * spb, 0.35, -0.3)
        # bass: root on the beat, octave pickup on the offbeat
        if not intro and not (soft and beat % 2):
            add(buf, bass(root + chord[0] - 12, spb * (1.8 if soft else 0.9)), t, 0.8 if soft else 1.0)
            if (beat in (1, 3) and not soft) or a.style == 'drive':
                add(buf, bass(root + chord[0], spb * 0.4), t + spb / 2, 0.55)
        # plucked arpeggio, 8th notes, small seeded variation
        for h in range(2):
            step = (beat * 2 + h)
            iv = chord[[0, 2, 1, 3, 2, 1, 3, 2][step % 8]]
            if rng.random() < (0.12 if not intro else 0.4):
                continue
            add(buf, pluck(root + iv + 12, spb * 1.6, 1.0, warm), t + h * spb / 2, 0.75 if h == 0 else 0.55, (rng.random() - 0.5) * 0.7)
    # simple stereo delay for space (pure function of the buffer)
    d = int(spb * 0.75 * SR)
    wet = np.zeros_like(buf)
    wet[d:, 0] = lp(buf[:-d, 1], 3500) * 0.22
    wet[d:, 1] = lp(buf[:-d, 0], 3500) * 0.22
    buf += wet
    buf[:, 0] = hp(buf[:, 0], 30); buf[:, 1] = hp(buf[:, 1], 30)
    buf = np.tanh(buf * 1.2) / np.tanh(1.2)
    n = int(dur * SR)
    buf = buf[:n]
    fade = int(0.04 * SR)
    buf[-fade:] *= np.linspace(1, 0, fade)[:, None]
    buf *= 0.89 / max(1e-9, np.abs(buf).max())
    out = os.path.join(a.project, a.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sf.write(out, buf.astype(np.float32), SR, subtype='PCM_24')
    # the exact grid this track was written on; beats.py verifies it against the audio
    json.dump({'bpm': bpm, 'offset': 0.0, 'source': 'music.py', 'style': a.style, 'seed': a.seed},
              open(os.path.splitext(out)[0] + '.json', 'w'))
    print(f'music → {a.out}  ({dur:.2f}s, {bpm:g} BPM, style {a.style}, key {a.key} minor, seed {a.seed})')


if __name__ == '__main__':
    main()
