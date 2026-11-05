#!/usr/bin/env python3
"""review.py — build the critique kit from the RENDERED MP4 (never from code or the preview).

    python3 review.py 1 --project .                 reviews out/final.mp4 (or out/video.mp4) → review/round-1/
    python3 review.py 2 --project . --video out/animatic.mp4

Makes: contact.png (2 fps, 6 across), strip.png (12 consecutive frames around the fastest action),
phone.png (1 fps at 360 px wide, with Instagram UI zones shaded), loop.mp4 (twice back to back),
metrics.json (blank frames, caption overlaps proxy, loudness, true peak, cue sync) and scorecard.md.
"""
import argparse, json, math, os, re, subprocess, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFont


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def frames_at(video, times, w, tmp):
    os.makedirs(tmp, exist_ok=True)
    out = []
    for i, t in enumerate(times):
        p = os.path.join(tmp, f'f{i:04d}.png')
        run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{t:.4f}', '-i', video, '-frames:v', '1', '-vf', f'scale={w}:-2', p])
        if os.path.exists(p):
            out.append((t, Image.open(p).convert('RGB')))
    return out


def font(size):
    for f in ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/Library/Fonts/Arial.ttf']:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def sheet(frames, cols, label=True, gap=8, zones=False):
    w, h = frames[0][1].size
    rows = math.ceil(len(frames) / cols)
    S = Image.new('RGB', (cols * w + (cols - 1) * gap, rows * (h + (22 if label else 0)) + (rows - 1) * gap), '#1a1a1a')
    d = ImageDraw.Draw(S); f = font(14)
    for i, (t, im) in enumerate(frames):
        x, y = (i % cols) * (w + gap), (i // cols) * (h + (22 if label else 0) + gap)
        if zones:  # Instagram overlays: top bar, bottom caption/username, right action rail
            im = im.copy(); o = Image.new('RGBA', im.size, (0, 0, 0, 0)); od = ImageDraw.Draw(o)
            sx = im.size[0] / 1080
            od.rectangle([0, 0, im.size[0], 220 * sx], fill=(255, 0, 80, 60))
            od.rectangle([0, im.size[1] - 420 * sx, im.size[0], im.size[1]], fill=(255, 0, 80, 60))
            od.rectangle([im.size[0] - 130 * sx, im.size[1] * 0.45, im.size[0], im.size[1] - 420 * sx], fill=(255, 0, 80, 60))
            im = Image.alpha_composite(im.convert('RGBA'), o).convert('RGB')
        S.paste(im, (x, y))
        if label:
            d.text((x + 4, y + h + 3), f'{t:6.2f}s', fill='#bbbbbb', font=f)
    return S


def gray_stream(video, w=90, h=160):
    r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', video, '-vf', f'scale={w}:{h}', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True)
    a = np.frombuffer(r.stdout, np.uint8)
    return a.reshape(-1, h, w).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('round', type=int)
    ap.add_argument('--project', default='.')
    ap.add_argument('--video')
    a = ap.parse_args()
    P = lambda p: os.path.join(a.project, p)
    video = P(a.video) if a.video else next((P(v) for v in ['out/final.mp4', 'out/video.mp4', 'out/animatic.mp4'] if os.path.exists(P(v))), None)
    if not video or not os.path.exists(video):
        raise SystemExit('no rendered video found — render first')
    out = P(f'review/round-{a.round}'); os.makedirs(out, exist_ok=True)
    tmp = os.path.join(out, '_tmp')
    info = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', video]).stdout)
    dur = float(info['format']['duration'])
    vs = next(s for s in info['streams'] if s['codec_type'] == 'video')
    fps = eval(vs['r_frame_rate'])
    W = int(vs['width']); Hh = int(vs['height'])

    # 1. contact sheet, 2 fps, 6 across
    fr = frames_at(video, [i / 2 for i in range(int(dur * 2))], 240, tmp + '/c')
    sheet(fr, 6).save(os.path.join(out, 'contact.png'))
    # 2. phone test, 1 fps at 360 px, IG UI zones shaded
    fr = frames_at(video, [i + 0.5 for i in range(int(dur))], 360, tmp + '/p')
    sheet(fr, 6, zones=True).save(os.path.join(out, 'phone.png'))
    # 3. strip around the fastest action
    g = gray_stream(video)
    diff = np.abs(np.diff(g, axis=0)).mean(axis=(1, 2))
    k = int(np.argmax(diff))
    s0 = max(0, k - 5)
    fr = frames_at(video, [(s0 + i) / fps + 0.0001 for i in range(12)], 270, tmp + '/s')
    sheet(fr, 6).save(os.path.join(out, 'strip.png'))
    # 4. loop check
    lst = os.path.join(tmp, 'loop.txt')
    open(lst, 'w').write(f"file '{os.path.abspath(video)}'\nfile '{os.path.abspath(video)}'\n")
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', os.path.join(out, 'loop.mp4')])
    # 5. metrics
    std = g.reshape(len(g), -1).std(axis=1)
    blank = [round(i / fps, 3) for i in np.where(std < 4)[0]]
    # "static" = less change than 3x the quietest 10 % of frames (that floor is grain shimmer)
    still = max(0.05, 3 * float(np.percentile(diff, 10)))
    static_runs, run_start = [], None
    for i, d in enumerate(np.append(diff, 99)):
        if d < still and run_start is None:
            run_start = i
        elif d >= still and run_start is not None:
            if (i - run_start) / fps > 2.0:
                static_runs.append([round(run_start / fps, 2), round(i / fps, 2)])
            run_start = None
    m = {'video': os.path.relpath(video, a.project), 'duration': round(dur, 3), 'fps': fps, 'size': f'{W}x{Hh}',
         'frame0_luma_std': round(float(std[0]), 2), 'blank_frames': blank[:50], 'blank_count': len(blank),
         'static_runs_over_2s': static_runs, 'fastest_action_t': round(k / fps, 3)}
    if any(s['codec_type'] == 'audio' for s in info['streams']):
        r = run(['ffmpeg', '-hide_banner', '-i', video, '-af', 'ebur128=peak=true', '-f', 'null', '-'])
        I = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr); TP = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r.stderr)
        m['loudness_lufs'] = float(I[-1]) if I else None
        m['true_peak_dbtp'] = float(TP[-1]) if TP else None
        # sync: whooshes are built to peak on the landing. Landing = first frame after the motion peak
        # where motion drops below 35 % of that peak. Target: within ±45 ms (1-2 frames).
        cpath = P('audio/cues.json')
        if os.path.exists(cpath):
            cues = [c for c in json.load(open(cpath))['cues'] if c['type'] == 'whoosh']
            errs = []
            for c in cues:
                i0, i1 = max(0, int((c['t'] - 0.3) * fps)), int((c['t'] + 0.45) * fps)
                seg = diff[i0:i1]
                if len(seg) < 4:
                    continue
                pk = int(np.argmax(seg))
                after = np.where(seg[pk:] < 0.35 * seg[pk])[0]
                land = (i0 + pk + (after[0] if len(after) else 0) + 1) / fps
                errs.append(round((land - c['t']) * 1000))
            m['whoosh_landing_minus_cue_ms'] = errs
    else:
        m['loudness_lufs'] = None
    json.dump(m, open(os.path.join(out, 'metrics.json'), 'w'), indent=1)
    shutil.rmtree(tmp, ignore_errors=True)
    # 6. scorecard
    here = os.path.dirname(os.path.abspath(__file__))
    crit = os.path.join(here, '..', 'brain', 'critique.md')
    card = open(crit).read() if os.path.exists(crit) else ''
    open(os.path.join(out, 'scorecard.md'), 'w').write(
        f'# Round {a.round} — {m["video"]}\n\nMetrics: ```{json.dumps(m)}```\n\nLook at contact.png, strip.png, phone.png and play loop.mp4.\n\n' + card)
    print(f'review kit → review/round-{a.round}/  (contact.png, strip.png, phone.png, loop.mp4, metrics.json, scorecard.md)')
    print(json.dumps(m, indent=1))


if __name__ == '__main__':
    main()
