"""8-bit soundtrack for "Introducing SQ²" — synthesised from scratch with numpy.

Music: 120 BPM chiptune (A minor: Am-F-C-G), square-wave arps, pulse bass,
noise drums. SFX are placed on the same timeline as sq2.js so every slam,
blip and cut lands on picture.
"""
import wave
import numpy as np

SR, DUR = 44100, 30.0
N = int(SR * DUR)
mix = np.zeros(N)
rng = np.random.default_rng(7)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(d):
    return np.arange(int(SR * d)) / SR


def env(n, a=0.004, r=None, d=None):
    """attack + exponential decay (d = time constant) or linear release."""
    x = np.arange(n) / SR
    e = np.minimum(1, x / a) if a > 0 else np.ones(n)
    if d is not None:
        e *= np.exp(-x / d)
    if r is not None:
        e *= np.clip((n / SR - x) / r, 0, 1)
    return e


def square(f, d, duty=0.5, bend=0.0):
    t = tt(d)
    fr = f * 2 ** (bend * t / max(d, 1e-3))          # optional pitch bend in octaves
    ph = np.cumsum(fr) / SR
    return np.where((ph % 1) < duty, 1.0, -1.0)


def tri(f, d):
    ph = (tt(d) * f) % 1
    return 4 * np.abs(ph - 0.5) - 1


def noise(d):
    return rng.uniform(-1, 1, int(SR * d))


def hp(x):
    return np.diff(x, prepend=0)


def lp(x, k=8):
    return np.convolve(x, np.ones(k) / k, mode='same')


def add(sig, at, gain=1.0):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    mix[i: i + len(sig)] += sig * gain


# ------------------------------------------------------------------ instruments
def kick(at, g=0.9):
    d = 0.28
    t = tt(d)
    f = 45 + 110 * np.exp(-t * 28)
    add(np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.001, d=0.09), at, g)


def snare(at, g=0.35):
    n = noise(0.18)
    add(hp(n) * env(len(n), 0.001, d=0.05) + 0.3 * tri(190, 0.18) * env(len(n), 0.001, d=0.03), at, g)


def hat(at, g=0.12):
    n = hp(hp(noise(0.05)))
    add(n * env(len(n), 0.001, d=0.012), at, g)


def crash(at, g=0.3, d=1.2):
    n = hp(noise(d))
    add(n * env(len(n), 0.002, d=d / 3), at, g)


def blip(at, m, d=0.06, g=0.18, duty=0.25, bend=0.0):
    s = square(midi(m), d, duty, bend)
    add(s * env(len(s), 0.002, r=0.02), at, g)


def coin(at, m, g=0.16):
    blip(at, m, 0.06, g, 0.5)
    blip(at + 0.06, m + 7, 0.16, g, 0.5)


def whoosh(at, d, up=True, g=0.35):
    n = noise(d)
    x = np.linspace(0, 1, len(n))
    shape = x ** 2 if up else (1 - x) ** 2
    add(lp(n, 3 if up else 6) * shape, at, g)


def riser(at, d, m0=48, m1=84, g=0.12):
    s = square(midi(m0), d, 0.5, bend=(m1 - m0) / 12)
    x = np.linspace(0, 1, len(s))
    add(s * x ** 1.5, at, g)
    whoosh(at, d, True, g * 2)


def fall(at, d, m0=96, m1=60, g=0.12):
    s = square(midi(m0), d, 0.5, bend=(m1 - m0) / 12)
    add(s * env(len(s), 0.002, r=0.05), at, g)


def slam(at, chord, g=1.0):
    kick(at, 1.0 * g)
    crash(at, 0.35 * g)
    for m in chord:
        s = square(midi(m), 0.35, 0.5)
        add(s * env(len(s), 0.002, d=0.12), at, 0.08 * g)
    n = noise(0.12)
    add(lp(n, 4) * env(len(n), 0.001, d=0.03), at, 0.5 * g)


# ------------------------------------------------------------------ music
BEAT = 0.5
PROG = [  # bass root, triad
    (45, [57, 60, 64]), (41, [53, 57, 60]), (48, [60, 64, 67]), (43, [55, 59, 62]),
]


def groove(t0, t1, drums=True, arp=True, bass=True, lead=None, arp_gain=0.07):
    b = 0
    t = t0
    while t < t1 - 1e-6:
        root, tri_ = PROG[(b // 4) % 4]
        if bass:
            for e in range(2):  # 8ths
                m = root + (12 if e == 1 and b % 2 else 0)
                s = square(midi(m), 0.22, 0.5)
                add(lp(s, 6) * env(len(s), 0.003, r=0.05), t + e * 0.25, 0.16)
        if arp:
            notes = tri_ + [tri_[0] + 12]
            for s16 in range(4):
                m = notes[(b * 4 + s16) % 4] + 12
                blip(t + s16 * 0.125, m, 0.1, arp_gain, 0.25)
        if drums:
            kick(t, 0.8)
            if b % 2 == 1:
                snare(t)
            hat(t + 0.25)
            if b % 4 == 3:
                hat(t + 0.375, 0.08)
        if lead and b in lead:
            m, d = lead[b]
            s = square(midi(m), d, 0.5)
            add(s * env(len(s), 0.01, r=0.08), t, 0.1)
        b += 1
        t += BEAT


# intro (0 - 2.5): tension, no beat
for i in range(5):
    hat(0.1 + i * 0.5, 0.06)
fall(0.08, 0.45, 90, 55, 0.1)
kick(0.55, 1.0); crash(0.55, 0.2, 0.6)
for i in range(11):
    blip(1.0 + i * 0.0655, 84 + (i % 3) * 2, 0.035, 0.1, 0.5)
whoosh(1.72, 0.18, False, 0.2)
slam(1.85, [57, 64, 69])
riser(2.12, 0.38, 50, 86, 0.1)

# main groove (2.5 - 19.0)
groove(2.5, 19.0)
# scene 2
fall(3.95, 0.17, 100, 70, 0.1)
slam(4.12, [60, 67, 72])
for i, at in enumerate([4.4, 4.63, 4.87]):
    blip(at, 60 + i * 5, 0.12, 0.18, 0.5, bend=-0.5); kick(at, 0.5)
whoosh(5.2, 0.32, True, 0.4)
# scene 3
for i, at in enumerate([5.62, 5.92, 6.25]):
    blip(at, 64 + i * 3, 0.12, 0.16, 0.5, bend=-0.3); kick(at, 0.5)
crash(5.92, 0.25)
slam(7.3, [53, 60, 65], 0.7)
kick(7.85, 1.0); n = noise(0.2); add(lp(n, 12) * env(len(n), 0.001, d=0.05), 7.85, 0.8)
riser(8.65, 0.35, 55, 91, 0.1)
# scene 4
for i in range(8):
    coin(9.4 + i * 0.24, 76 + [0, 2, 4, 7, 9, 12, 14, 16][i])
whoosh(11.6, 0.3, False, 0.4)
fall(11.6, 0.3, 88, 52, 0.08)
for i in range(7):
    blip(12.15 + 0.25 + i * 0.13 + 0.35, 88 + (i % 4) * 3, 0.08, 0.08, 0.5)
# scene 5: card slams
for i, at in enumerate([14, 15, 16, 17, 18]):
    slam(at, [[57, 64, 69], [53, 60, 65], [60, 67, 72], [55, 62, 67], [57, 64, 72]][i], 0.9)
riser(18.55, 0.45, 48, 72, 0.08)

# breakdown (19 - 23.5): superposition — ghostly, no drums
for k in range(9):
    t0 = 19.0 + k * 0.5
    root, tri_ = PROG[(k // 4) % 4]
    for j, m in enumerate(tri_):
        s = square(midi(m), 0.5, 0.125) * 0.5 + square(midi(m) * 1.004, 0.5, 0.125) * 0.5
        add(lp(s, 14) * env(len(s), 0.08, r=0.15), t0, 0.05)
    for s16 in range(4):
        blip(t0 + s16 * 0.125, tri_[s16 % 3] + 24, 0.05, 0.04, 0.125)
        blip(t0 + s16 * 0.125 + 0.0625, tri_[s16 % 3] + 24, 0.05, 0.015, 0.125)   # echo
whoosh(19.25, 0.4, True, 0.25)
for i in range(3):
    blip(19.7 + i * 0.12, 72 + i * 4, 0.1, 0.12, 0.5)
for i in range(26):   # copies popping in
    blip(20.5 + i * 0.022 + rng.uniform(0, 0.03), 80 + rng.integers(0, 16), 0.03, 0.06, 0.5)
slam(20.7, [57, 64], 0.6)
slam(21.35, [60, 67], 0.6)
blip(22.05, 60, 0.4, 0.12, 0.5, bend=1.0)
riser(22.5, 0.6, 40, 96, 0.14)
whoosh(22.55, 0.55, True, 0.5)

# finale (23.5 - 30)
slam(23.5, [45, 57, 64, 69], 1.2)
crash(23.5, 0.4, 2.0)
LEAD = {0: (69, 0.45), 1: (72, 0.45), 2: (76, 0.9), 4: (77, 0.45), 5: (76, 0.45), 6: (72, 0.9),
        8: (72, 0.45), 9: (76, 0.45), 10: (79, 0.9)}
groove(23.5, 28.5, lead=LEAD, arp_gain=0.06)
kick(24.35, 1.0)
blip(24.35, 67, 0.3, 0.14, 0.5, bend=1.0)     # the "2" boings
for i in range(20):
    blip(24.7 + i * 0.04, 86 + (i % 4) * 2, 0.03, 0.07, 0.5)
coin(25.7, 83, 0.14)
for i in range(8):
    blip(26.3 + i * 0.06, 90, 0.03, 0.06, 0.5)
# final chord — ring out
slam(28.5, [45, 57, 64, 69, 76], 1.0)
for m in [57, 64, 69, 72, 76]:
    s = square(midi(m), 1.5, 0.25)
    add(lp(s, 6) * env(len(s), 0.01, d=0.6), 28.5, 0.06)

# ------------------------------------------------------------------ master
mix = np.tanh(mix * 1.1)
fade = np.ones(N); fl = int(0.4 * SR); fade[-fl:] = np.linspace(1, 0, fl)
mix *= fade
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.89
with wave.open('out/audio.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('audio ok', N / SR, 's')
