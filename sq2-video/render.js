// Render the canvas animation frame-by-frame in headless Chromium.
//   node render.js stills 0.5,3.2,...  -> out/stills/*.png (for review)
//   node render.js video               -> out/frames.mkv (lossless-ish intermediate)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FFMPEG = process.env.FFMPEG || require('child_process').execSync(
  'python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"').toString().trim();

(async () => {
  const [mode = 'video', arg] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('file://' + path.resolve(__dirname, 'index.html') + '?render');
  await page.evaluate(() => window.READY);
  const fps = await page.evaluate(() => window.FPS);
  const grab = f => page.evaluate(f => { renderFrame(f); return document.getElementById('c').toDataURL('image/png'); }, f)
    .then(u => Buffer.from(u.split(',')[1], 'base64'));

  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  if (mode === 'stills') {
    const dir = path.join(__dirname, 'out/stills'); fs.mkdirSync(dir, { recursive: true });
    for (const t of arg.split(',').map(Number)) fs.writeFileSync(path.join(dir, `t${t.toFixed(2)}.png`), await grab(Math.round(t * fps)));
  } else {
    const total = await page.evaluate(() => window.FRAMES);
    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '8', '-pix_fmt', 'yuv444p', path.join(__dirname, 'out/frames.mkv')], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let f = 0; f < total; f++) {
      const buf = await grab(f);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (f % 240 === 0) console.log(`frame ${f}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
  }
  await browser.close();
})();
