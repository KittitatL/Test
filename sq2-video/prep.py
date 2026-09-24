# Pre-process the supplied assets: 8-bit Qumi sprite + logo split into colour layers.
from PIL import Image
import numpy as np

# --- Qumi -> 8-bit sprite -------------------------------------------------
q = Image.open('assets/qumi.webp').convert('RGBA')
bbox = q.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
q = q.crop(bbox)
H = 72                                   # sprite height in "pixels"
W = round(q.width * H / q.height)
small = q.resize((W, H), Image.LANCZOS)
from PIL import ImageEnhance
_a = small.getchannel('A')
small = ImageEnhance.Contrast(ImageEnhance.Color(ImageEnhance.Brightness(small.convert('RGB')).enhance(1.25)).enhance(1.6)).enhance(1.25).convert('RGBA')
small.putalpha(_a)
a = np.array(small.getchannel('A')) > 110
rgb = small.convert('RGB').quantize(colors=18, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
px = np.dstack([np.array(rgb), (a * 255).astype(np.uint8)])
# 1-px dark outline around the silhouette for that sprite look
out = np.zeros((H + 2, W + 2, 4), np.uint8)
out[1:-1, 1:-1] = px
m = out[..., 3] > 0
ring = np.zeros_like(m)
for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
    ring |= np.roll(np.roll(m, dy, 0), dx, 1)
ring &= ~m
out[ring] = (18, 8, 24, 255)
# chunky 2-px cream "sticker" border so Qumi pops off the dark paper
big = np.zeros((out.shape[0] + 4, out.shape[1] + 4, 4), np.uint8)
big[2:-2, 2:-2] = out
m = big[..., 3] > 0
st = np.zeros_like(m)
for dy in range(-2, 3):
    for dx in range(-2, 3):
        if abs(dy) + abs(dx) <= 3:
            st |= np.roll(np.roll(m, dy, 0), dx, 1)
st &= ~m
big[st] = (246, 238, 222, 255)
out = big
Image.fromarray(out).save('assets/qumi_8bit.png')
print('sprite', out.shape)

# --- Logo -> layers ---------------------------------------------------------
L = np.array(Image.open('assets/sq2-logo.png').convert('RGB')).astype(int)
r, g, b = L[..., 0], L[..., 1], L[..., 2]
mx = L.max(-1)
alpha = np.clip((mx - 20) * 255 / 90, 0, 255).astype(np.uint8)
pink = (r > g + 40) & (r > 90) & (b > g)
yellow = (r > 120) & (g > 100) & (b < g - 60)
grey = (abs(r - g) < 25) & (abs(g - b) < 25) & (mx > 30)
grey[:, :620] = False
pink[:, 620:] = False; yellow[:, :400] = False
def layer(mask, name, color=None):
    img = np.zeros(L.shape[:2] + (4,), np.uint8)
    img[..., :3] = L if color is None else color
    img[..., 3] = np.where(mask, alpha, 0)
    im = Image.fromarray(img)
    im.save(f'assets/{name}.png'); print(name, im.getbbox())
layer(pink, 'logo_sq')
layer(yellow, 'logo_2')
layer(grey, 'logo_text', (200, 200, 205))
full = np.zeros(L.shape[:2] + (4,), np.uint8); full[..., :3] = L; full[..., 3] = alpha
Image.fromarray(full).save('assets/logo_alpha.png')
