#!/usr/bin/env python3
"""vo.py — CapCut voiceover in, word timing out.

    python3 scripts/vo.py episodes/<slug>                    uses the newest audio/video file in episodes/<slug>/audio/
    python3 scripts/vo.py episodes/<slug> --in ~/Downloads/0423.mov
    python3 scripts/vo.py episodes/<slug> --estimate         no audio yet: estimate timing from the script (for stills)

Reads episodes/<slug>/lines.txt: one spoken line per row, in order. Optional caption override after " | ":
    Turn around on an escalator. | Turn around on an *escalator*
    Instrument one oh one. | -          ← "-" means: no caption for this line (spoken title)
Writes episodes/<slug>/audio/vo.wav, timing.json and timing.js (window.TIMING).

Speech finding: 20 ms frames, speech = louder than max(-34 dBFS, loudest frame − 32 dB), gaps < 0.22 s merged.
The detected speech runs are matched to the script lines (merging/splitting where CapCut didn't pause), and each line's
words are spread over its speech by syllable weight. Accurate to a frame or two for clean TTS.
"""
import argparse, glob, json, math, os, re, subprocess, sys
import numpy as np
import soundfile as sf

SR = 48000
AUDIO_EXT = ('.mov', '.mp4', '.m4a', '.mp3', '.wav', '.aac', '.caf')


def syllables(word):
    w = re.sub(r'[^a-z0-9]', '', word.lower())
    if not w:
        return 0.5
    if w.isdigit():                     # "1000" is spoken as several syllables
        return max(1.5, len(w) * 1.2)
    groups = re.findall(r'[aeiouy]+', w)
    n = len(groups) - (1 if w.endswith('e') and len(groups) > 1 and not w.endswith('le') else 0)
    return max(1, n)


def read_lines(ep):
    p = os.path.join(ep, 'lines.txt')
    if not os.path.exists(p):
        sys.exit(f'no {p} — write the approved script there, one spoken line per row')
    out = []
    for raw in open(p, encoding='utf-8'):
        raw = raw.strip()
        if not raw or raw.startswith('#'):
            continue
        spoken, _, cap = raw.partition(' | ')
        cap = cap.strip()
        out.append({'text': spoken.strip(), 'caption': None if not _ else ('' if cap == '-' else cap)})
    return out


def find_audio(ep, given):
    if given:
        return os.path.expanduser(given)
    files = [f for f in glob.glob(os.path.join(ep, 'audio', '*')) if f.lower().endswith(AUDIO_EXT) and not os.path.basename(f).startswith(('vo.', 'music', 'sfx', 'mix', '_'))]
    if not files and os.path.exists(os.path.join(ep, 'audio', 'vo.m4a')):
        return os.path.join(ep, 'audio', 'vo.m4a')   # fresh checkout: rebuild from the archived copy
    if not files:
        sys.exit(f'no voice file in {ep}/audio/ — drop the CapCut export there (or pass --in)')
    return max(files, key=os.path.getmtime)


def speech_runs(x, frame=0.02, floor_db=-34.0, rel_db=32.0, gap=0.22, min_len=0.12):
    n = int(frame * SR)
    k = len(x) // n
    fr = x[:k * n].reshape(k, n)
    db = 20 * np.log10(np.sqrt((fr ** 2).mean(axis=1)) + 1e-9)
    thr = max(floor_db, db.max() - rel_db)
    on = db > thr
    runs, i = [], 0
    while i < k:
        if on[i]:
            j = i
            while j < k and on[j]:
                j += 1
            runs.append([i * frame, j * frame])
            i = j
        else:
            i += 1
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return [r for r in merged if r[1] - r[0] >= min_len], db, thr


def group_runs(runs, weights):
    """Partition consecutive speech runs into len(weights) groups whose durations best match the weights (DP)."""
    R, L = len(runs), len(weights)
    total = runs[-1][1] - runs[0][0]
    target = np.array(weights) / sum(weights) * total
    INF = 1e18
    cost = np.full((L + 1, R + 1), INF); back = np.zeros((L + 1, R + 1), int)
    cost[0][0] = 0
    for l in range(1, L + 1):
        for r in range(l, R + 1):
            for p in range(l - 1, r):
                d = runs[r - 1][1] - runs[p][0]
                c = cost[l - 1][p] + (d - target[l - 1]) ** 2
                if c < cost[l][r]:
                    cost[l][r] = c; back[l][r] = p
    groups, r = [], R
    for l in range(L, 0, -1):
        p = back[l][r]; groups.append(runs[p:r]); r = p
    return groups[::-1]


def split_runs(runs, db, frame, weights):
    """CapCut sometimes runs two lines together. Give each run the lines whose expected share of the speech
    falls in it, then split it where the syllable weights put the boundary, snapped to the quietest frame nearby."""
    total = sum(r[1] - r[0] for r in runs)
    W = np.cumsum([0] + list(weights)) / sum(weights) * total     # expected speech-time boundaries
    mids = (W[:-1] + W[1:]) / 2
    acc, owner = 0.0, []
    for a, b in runs:
        owner.append([k for k, m in enumerate(mids) if acc <= m < acc + (b - a) or (k == len(mids) - 1 and m >= acc + (b - a) and (a, b) == tuple(runs[-1]))])
        acc += b - a
    # every line must belong to some run: give orphans to the nearest run
    for k in range(len(mids)):
        if not any(k in o for o in owner):
            j = min(range(len(runs)), key=lambda i: abs(sum(r[1] - r[0] for r in runs[:i]) - W[k]))
            owner[j].append(k); owner[j].sort()
    out = []
    for (a, b), ks in zip(runs, owner):
        if len(ks) <= 1:
            out.append([a, b]); continue
        wsum = sum(weights[k] for k in ks); cut0, cur = a, a
        for k in ks[:-1]:
            cur += weights[k] / wsum * (b - a)
            lo, hi = int((cur - 0.25) / frame), int((cur + 0.25) / frame)
            lo, hi = max(lo, int(cut0 / frame) + 1), min(hi, int(b / frame) - 1)
            cut = (lo + int(np.argmin(db[lo:hi]))) * frame if hi > lo else cur
            out.append([cut0, cut]); cut0 = cut
        out.append([cut0, b])
    return out


def spread_words(text, group):
    words = text.split()
    w = np.array([syllables(x) for x in words], float)
    speech = sum(r[1] - r[0] for r in group)
    edges = np.concatenate([[0], np.cumsum(w) / w.sum() * speech])

    def to_time(s):  # speech-time → clock time, skipping pauses inside the line
        for a, b in group:
            if s <= b - a + 1e-9:
                return a + s
            s -= (b - a)
        return group[-1][1]
    return [{'w': words[i], 't0': round(to_time(edges[i]), 3), 't1': round(to_time(edges[i + 1]), 3)} for i in range(len(words))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('episode')
    ap.add_argument('--in', dest='src')
    ap.add_argument('--estimate', action='store_true')
    ap.add_argument('--wps', type=float, default=2.7, help='words per second for --estimate')
    a = ap.parse_args()
    ep = a.episode.rstrip('/')
    lines = read_lines(ep)
    os.makedirs(os.path.join(ep, 'audio'), exist_ok=True)

    if a.estimate:
        t, segs = 0.25, []
        for ln in lines:
            n = len(ln['text'].split())
            d = n / a.wps
            segs.append({'text': ln['text'], 'caption': ln['caption'], 'group': [[t, t + d]]})
            t += d + 0.38
        dur = t
        src = None
    else:
        src = find_audio(ep, a.src)
        vo = os.path.join(ep, 'audio', 'vo.wav')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-vn', '-ac', '1', '-ar', str(SR), vo], check=True)
        # a small archived copy that's committed with the episode, so it can always be re-rendered
        if os.path.basename(src) != 'vo.m4a':
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', vo, '-c:a', 'aac', '-b:a', '128k', os.path.join(ep, 'audio', 'vo.m4a')], check=True)
        x, _ = sf.read(vo, dtype='float32')
        peak = 20 * math.log10(np.abs(x).max() + 1e-9)
        if peak < -45:
            sys.exit(f'!! {os.path.basename(src)} is silent (peak {peak:.1f} dBFS). Re-export it from CapCut with the voice on.')
        runs, db, thr = speech_runs(x)
        if not runs:
            sys.exit('!! no speech found')
        weights = [sum(syllables(w) for w in ln['text'].split()) for ln in lines]
        if len(runs) < len(lines):
            runs = split_runs(runs, db, 0.02, weights)
        groups = group_runs(runs, weights) if len(runs) > len(lines) else [[r] for r in runs]
        segs = [{'text': ln['text'], 'caption': ln['caption'], 'group': grp} for ln, grp in zip(lines, groups)]
        dur = len(x) / SR
        # trim long silence at the end of the export
        dur = min(dur, segs[-1]['group'][-1][1] + 1.2)

    out = {'duration': round(dur, 3), 'source': os.path.basename(src) if src else 'estimate', 'segments': []}
    for i, s in enumerate(segs):
        words = spread_words(s['text'], s['group'])
        seg = {'i': i, 't0': round(s['group'][0][0], 3), 't1': round(s['group'][-1][1], 3), 'text': s['text'], 'words': words}
        if s['caption'] is not None:
            seg['caption'] = s['caption']
        out['segments'].append(seg)
    json.dump(out, open(os.path.join(ep, 'timing.json'), 'w'), indent=1)
    open(os.path.join(ep, 'timing.js'), 'w').write('window.TIMING = ' + json.dumps(out) + ';\n')
    print(f"timing → {ep}/timing.js   ({out['source']}, {dur:.2f}s, {len(segs)} lines)")
    for s in out['segments']:
        print(f"  {s['i']:>2}  {s['t0']:6.2f}–{s['t1']:6.2f}  {s['text']}")
    spoken = out['segments'][-1]['t1'] - out['segments'][0]['t0']
    if spoken > 40:
        print(f'!! spoken length {spoken:.1f}s is over the 30–40 s target. Tighten the script or split into parts.')


if __name__ == '__main__':
    main()
