#!/bin/sh
# One-time setup (Mac or a cloud session): Node packages, Chromium for rendering, Python audio libraries.
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Install Node 20+ first (macOS: brew install node)"; exit 1; }
command -v ffmpeg >/dev/null || { echo "Install ffmpeg first (macOS: brew install ffmpeg)"; exit 1; }
command -v python3 >/dev/null || { echo "Install Python 3.9+ first"; exit 1; }
npm install --no-audit --no-fund
# use a pre-installed Chromium if the machine has one (cloud sessions), otherwise download it
if [ -z "$PLAYWRIGHT_BROWSERS_PATH" ] || [ ! -d "$PLAYWRIGHT_BROWSERS_PATH" ]; then npx --yes playwright install chromium; fi
python3 -c "import numpy, scipy, soundfile, librosa, PIL" 2>/dev/null || python3 -m pip install -q -r requirements.txt || python3 -m pip install -q --user -r requirements.txt \
  || echo "! pip refused (Homebrew Python?). Run: python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt"
echo "Ready. In Claude Code, just give a topic: \"New reel: why your altimeter needs today's pressure\""
