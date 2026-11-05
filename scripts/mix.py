#!/usr/bin/env python3
"""mix.py — music + SFX (+ voiceover), music ducked under the voice, loudness to -14 LUFS / -1 dBTP, muxed onto the video.

    python3 mix.py --project .                                   out/video.mp4 → out/final.mp4
    python3 mix.py --project . --vo audio/vo.wav --music-db -4   louder bed, explicit voiceover file

Voiceover: audio/vo.wav is picked up automatically if it exists (any format ffmpeg reads works with --vo).
"""
import argparse, json, os, re, subprocess
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

SR = 48000


def load(path, n=None):
    if not path or not os.path.exists(path):
        return None
    if not path.lower().endswith('.wav'):
        tmp = path + '.48k.wav'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-ar', str(SR), '-ac', '2', tmp], check=True)
        path = tmp
    x, sr = sf.read(path, always_2d=True, dtype='float32')
    if x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    x = x[:, :2]
    if sr != SR:
        g = np.gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g, axis=0).astype(np.float32)
    if n is not None:
        x = np.pad(x, ((0, max(0, n - len(x))), (0, 0)))[:n]
    return x


def lufs(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)
    return float(m[-1]) if m else None


def db(v):
    return 10 ** (v / 20)


def envelope(x, attack=0.02, release=0.25):
    """Peak follower with separate attack/release (pure function of the signal)."""
    a = np.abs(x).max(axis=1)
    win = int(0.03 * SR)
    a = np.sqrt(np.convolve(a ** 2, np.ones(win) / win, mode='same'))
    ca, cr = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR))
    out = np.empty_like(a); e = 0.0
    for i, v in enumerate(a):
        c = ca if v > e else cr
        e = c * e + (1 - c) * v
        out[i] = e
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--project', default='.')
    ap.add_argument('--video', default='out/video.mp4')
    ap.add_argument('--out', default='out/final.mp4')
    ap.add_argument('--music', default='audio/music.wav')
    ap.add_argument('--sfx', default='audio/sfx.wav')
    ap.add_argument('--vo', default='audio/vo.wav')
    ap.add_argument('--vo-offset', type=float, default=0.0, help='seconds to delay the voiceover')
    ap.add_argument('--music-db', type=float, default=-3.0)
    ap.add_argument('--sfx-db', type=float, default=-8.0)
    ap.add_argument('--duck-db', type=float, default=-4.0, help='extra music reduction while the voice talks')
    ap.add_argument('--bed-lu', type=float, default=14.0, help='music sits this many LU under the voice (0 = use --music-db)')
    ap.add_argument('--lufs', type=float, default=-14.0)
    a = ap.parse_args()
    P = lambda p: os.path.join(a.project, p)
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', P(a.video)], capture_output=True, text=True)
    dur = float(probe.stdout.strip())
    n = int(round(dur * SR))
    music, sfx = load(P(a.music), n), load(P(a.sfx), n)
    vo = load(P(a.vo))
    if vo is not None:
        k = int(a.vo_offset * SR)
        vo = np.pad(vo, ((max(0, k), 0), (0, 0)))[:n] if k >= 0 else vo[-k:]
        vo = np.pad(vo, ((0, max(0, n - len(vo))), (0, 0)))[:n]
    mix = np.zeros((n, 2), np.float32)
    music_db = a.music_db
    if music is not None and vo is not None and a.bed_lu:
        # the bed sits a fixed loudness below the voice, whatever the CapCut export level was
        tmpm, tmpv = P('audio/_m.wav'), P('audio/_v.wav')
        sf.write(tmpm, music, SR); sf.write(tmpv, vo, SR)
        Lm, Lv = lufs(tmpm), lufs(tmpv)
        os.remove(tmpm); os.remove(tmpv)
        if Lm is not None and Lv is not None:
            music_db = (Lv - a.bed_lu) - Lm
    if music is not None:
        g = np.full(n, db(music_db), np.float32)
        if vo is not None:
            e = envelope(vo)
            talk = np.clip(e / max(1e-6, np.percentile(e, 90) * 0.35), 0, 1)
            g *= db(a.duck_db * talk)
        mix += music * g[:, None]
    if sfx is not None:
        mix += sfx * db(a.sfx_db) * (0.7 if vo is not None else 1)
    if vo is not None:
        mix += vo * db(-1)
    raw = P('audio/mix_raw.wav')
    sf.write(raw, mix, SR, subtype='FLOAT')
    # two-pass loudnorm
    tgt = f'I={a.lufs}:TP=-1.5:LRA=11'
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', raw, '-af', f'loudnorm={tgt}:print_format=json', '-f', 'null', '-'], capture_output=True, text=True)
    m = json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}', r.stderr, re.S)[-1])
    af = (f"loudnorm={tgt}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
          f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,alimiter=limit=0.84:level=false")
    mixed = P('audio/mix.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-af', af, '-ar', str(SR), '-c:a', 'pcm_s24le', mixed], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', P(a.video), '-i', mixed, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
                    '-c:a', 'aac', '-b:a', '256k', '-ar', str(SR), '-shortest', '-movflags', '+faststart', P(a.out)], check=True)
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', P(a.out), '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    I = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr); TP = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r.stderr)
    print(f'mix → audio/mix.wav, final → {a.out}   loudness {I[-1] if I else "?"} LUFS, true peak {TP[-1] if TP else "?"} dBTP'
          f'{"  (voiceover ducking on)" if vo is not None else ""}')


if __name__ == '__main__':
    main()
