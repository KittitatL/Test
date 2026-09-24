# Introducing SQ² (launch video)

A 30-second, 1920×1080 launch video for Siam Quantum Square (SQ²). The mascot is **Qumi**, drawn as an 8-bit sprite. Everything is animated by code in a hand-drawn canvas style: line boil at 12 fps over smooth 60 fps motion, marker wipes, and anime focus lines. The soundtrack is a synthesised chiptune.

**Final file:** `Introducing_SQ2.mp4` (H.264 + AAC, 60 fps, about 6.5 MB)

| File | Role |
|---|---|
| `prep.py` | Turns `assets/qumi.webp` into the 8-bit `qumi_8bit.png` sprite, and splits the real logo into three layers: the pink bracket, the yellow "2" and the grey wordmark |
| `index.html` + `sq2.js` | The animation. Open `index.html` in a browser for a live preview |
| `render.js` | Captures every frame in headless Chromium through Playwright |
| `audio.py` | Synthesises the chiptune and sound effects with numpy, timed to the picture |

## Rebuild
```bash
npm i && pip install pillow numpy imageio-ffmpeg
python3 prep.py
NODE_PATH=$(npm root -g) node render.js video   # -> out/frames.mkv
python3 audio.py                                 # -> out/audio.wav
FF=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
$FF -i out/frames.mkv -i out/audio.wav -c:v libx264 -preset veryslow -tune animation -crf 32 \
    -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart -shortest Introducing_SQ2.mp4
```

Fonts: Fira Mono Bold, the closest match to the logo's wordmark, and Press Start 2P for the pixel counters. Both come from `@fontsource`.

## Storyboard and facts shown
1. **0–2.5 s:** Qumi drops in, and "INTRODUCING" is typed on screen, and "SQ²" slams in.
2. **2.5–5.5 s:** The real logo draws itself. Qumi rides the bracket, the "2" slams in, and SIAM / QUANTUM / SQUARE appear one word at a time.
3. **5.5–9 s:** "Thailand's largest quantum center". Qumi runs across Bangkok to Samyan Mitrtown, G floor, and an **EST. 26.01.2026** stamp lands.
4. **9–14 s:** Building · Connecting · Uniting. A network of **8 organisations in 4 countries** (IBM Thailand, QTFT, SCB, Western Digital, AIST G-QuAT, NIMS, Qunova, KAIST). It zooms out to a world view: **8 countries in one quantum network**, counting partners plus SQST 2026 speaker countries. A small Qumi rides every path out of Thailand. Singapore is placed further out than its true position so its path reads clearly.
5. **14–19 s:** Five stat cards: 5-year MoU with AIST · 3-year MoU with Qunova · SQST 2026, with 10 invited speakers over 4 days · MSc + PhD programs · cloud-first quantum access with IBM.
6. **19–23.5 s:** |SQ²⟩ = |BUILD⟩ + |CONNECT⟩ + |UNITE⟩. Qumi splits into 55 superposed copies ("ONE CAT. EVERY STATE."), then OBSERVE, and the copies collapse.
7. **23.5–30 s:** Qumi lands inside the logo's square, followed by the tagline, "THAILAND × THE WORLD" and sq2.chula.ac.th.

Sources: see `../SQ2_RESEARCH.md`.
