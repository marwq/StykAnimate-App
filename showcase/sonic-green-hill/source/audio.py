"""Original score and sound effects for the Sonic animation, synthesized from scratch.

Writes WAV assets (48 kHz, 16-bit stereo), a clip list for the project's audio
tracks, and the full mix for the preview video.
usage: python3 audio.py <cues.json> <outdir>
"""
import json, sys, wave, os
import numpy as np

SR = 48000
rng = np.random.default_rng(7)
cues = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
FPS = cues['fps']
sec = lambda frame: frame / FPS
END = sec(cues['end'])

# ---------------------------------------------------------------- primitives
def t_axis(d): return np.arange(int(round(d * SR))) / SR
def midi(n): return 440.0 * 2 ** ((n - 69) / 12)

def adsr(n, a=0.005, d=0.08, s=0.6, r=0.08, total=None):
    total = n if total is None else total
    e = np.ones(n) * s
    ia, idd, ir = int(a * SR), int(d * SR), int(r * SR)
    ia = min(ia, n); e[:ia] = np.linspace(0, 1, ia, endpoint=False) if ia else e[:ia]
    seg = slice(ia, min(n, ia + idd)); m = seg.stop - seg.start
    if m > 0: e[seg] = np.linspace(1, s, m)
    if ir > 0 and n > ir: e[-ir:] *= np.linspace(1, 0, ir)
    return e

def phase_of(freq, d):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (int(round(d * SR)),))
    return 2 * np.pi * np.cumsum(f) / SR, f

def additive(freq, d, kind='square', duty=0.5, bright=1.0):
    """Band-limited square/saw/pulse/triangle by summing harmonics below Nyquist."""
    ph, f = phase_of(freq, d)
    out = np.zeros_like(ph)
    fmax = float(np.max(f))
    nmax = max(1, int(min(40, (SR / 2 - 200) / max(fmax, 1))))
    for k in range(1, nmax + 1):
        if kind == 'square':
            if k % 2 == 0: continue
            a = 1 / k
        elif kind == 'saw': a = 1 / k
        elif kind == 'pulse': a = np.sin(np.pi * k * duty) / k
        elif kind == 'tri':
            if k % 2 == 0: continue
            a = (-1) ** ((k - 1) // 2) / k ** 2
        a *= np.exp(-(k - 1) * (1 - bright) * 0.35)
        out += a * np.sin(k * ph)
    return out / (np.max(np.abs(out)) + 1e-9)

def sine(freq, d): ph, _ = phase_of(freq, d); return np.sin(ph)

def noise(d): return rng.uniform(-1, 1, int(round(d * SR)))

def bandpass(x, lo, hi):
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1 / SR)
    w = np.clip((fr - lo * 0.7) / (lo * 0.3 + 1e-9), 0, 1) * np.clip((hi * 1.3 - fr) / (hi * 0.3 + 1e-9), 0, 1)
    return np.fft.irfft(X * w, len(x))

def lowpass(x, cut): return bandpass(x, 0.0001, cut)

def onepole(x, coef):
    """Time-varying one-pole low-pass (coef in 0..1 per sample)."""
    y = np.empty_like(x); acc = 0.0
    c = np.broadcast_to(coef, x.shape)
    for i in range(len(x)): acc += c[i] * (x[i] - acc); y[i] = acc
    return y

def reverb(x, seconds=1.4, mix=0.25, pre=0.012):
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.linspace(0, 6.5, n))
    ir = lowpass(ir, 7000); ir[: int(pre * SR)] = 0; ir /= np.sqrt(np.sum(ir ** 2))
    L = len(x) + n
    size = 1 << (L - 1).bit_length()
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * (1 - mix) + wet * mix * 0.6

def stereo(x, pan=0.0):
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * l, x * r], axis=1) * np.sqrt(2)

class Bus:
    def __init__(self, d): self.buf = np.zeros((int(round(d * SR)) + SR, 2))
    def add(self, at, sig, gain=1.0, pan=0.0):
        s = stereo(sig, pan) if sig.ndim == 1 else sig
        i = int(round(at * SR))
        if i < 0: s = s[-i:]; i = 0
        j = min(len(self.buf), i + len(s))
        if j > i: self.buf[i:j] += s[: j - i] * gain
    def out(self, d): return self.buf[: int(round(d * SR))]

def write(name, x):
    x = np.clip(x, -1, 1)
    if x.ndim == 1: x = stereo(x) / np.sqrt(2)
    data = (x * 32767).astype('<i2')
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())
    return name

# ---------------------------------------------------------------- instruments
def pluck(n, d, kind='pulse', duty=0.25, a=0.004, dec=0.18, s=0.35, r=0.06, vib=0.0, bright=0.9):
    f = midi(n)
    t = t_axis(d)
    freq = f * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.12) / 0.2, 0, 1))
    return additive(freq, d, kind, duty, bright) * adsr(len(t), a, dec, s, r)

def pad(notes, d, a=0.6, r=0.8, bright=0.55):
    t = t_axis(d); out = np.zeros(len(t))
    for n in notes:
        for det in (-0.12, 0.0, 0.12):
            out += additive(midi(n + det), d, 'saw', bright=bright)
    out /= 3 * len(notes)
    return lowpass(out, 3200) * adsr(len(t), a, 0.2, 0.9, r)

def kick(v=1.0):
    d = 0.32; t = t_axis(d)
    f = 45 + 110 * np.exp(-t * 28)
    body = sine(f, d) * np.exp(-t * 9)
    click = bandpass(noise(d), 1500, 6000) * np.exp(-t * 180) * 0.25
    return (body + click) * v

def snare(v=1.0):
    d = 0.22; t = t_axis(d)
    tone = sine(185 * (1 + 0.3 * np.exp(-t * 40)), d) * np.exp(-t * 22) * 0.45
    sn = bandpass(noise(d), 1200, 9000) * np.exp(-t * 17)
    return (tone + sn) * 0.75 * v

def hat(v=1.0, open_=False):
    d = 0.18 if open_ else 0.05; t = t_axis(d)
    return bandpass(noise(d), 7000, 16000) * np.exp(-t * (14 if open_ else 70)) * 0.4 * v

def crash(v=1.0):
    d = 1.8; t = t_axis(d)
    return bandpass(noise(d), 4000, 15000) * np.exp(-t * 2.2) * 0.5 * v

# ---------------------------------------------------------------- score
BPM = 158.0; BEAT = 60 / BPM
T0 = sec(cues['release'])                 # groove downbeat: the spin dash release
beat = lambda b: T0 + b * BEAT
music = Bus(END + 2)
CH = {'C': [48, 52, 55, 60], 'Am': [45, 48, 52, 57], 'F': [41, 45, 48, 53], 'G': [43, 47, 50, 55], 'Fmaj7': [41, 45, 48, 52, 57], 'G6': [43, 47, 50, 52, 55]}

# Intro: morning pad and a slow sparkling arpeggio.
intro_end = sec(cues['curl'])
music.add(0.0, pad([48, 55, 59, 62, 64], intro_end + 0.6, a=1.2, r=0.7), 0.16, -0.1)
arp = [72, 76, 79, 83, 86, 83, 79, 76]
for i in range(int(intro_end / 0.24)):
    music.add(0.15 + i * 0.24, pluck(arp[i % len(arp)], 0.5, 'tri', dec=0.25, s=0.1, r=0.2), 0.11, 0.35 * np.sin(i * 0.8))

# Spin dash: tension on the dominant, a stab rising with every rev.
rev_t = [sec(f) for f in cues['revs']]
music.add(intro_end - 0.1, pad([43, 50, 55, 59], T0 - intro_end + 0.2, a=0.25, r=0.15, bright=0.7), 0.12)
for k, rt in enumerate(rev_t):
    root = [55, 57, 59, 62][k]
    for n in (root, root + 4, root + 7):
        music.add(rt, pluck(n, 0.35, 'square', dec=0.12, s=0.2, r=0.1), 0.06)
    music.add(rt, kick(0.8), 0.55); music.add(rt, snare(0.7), 0.35)
# snare roll building into the release
roll_start = rev_t[1]
n_roll = int((T0 - roll_start) / 0.06)
for i in range(n_roll):
    tt = roll_start + i * (T0 - roll_start) / n_roll
    music.add(tt, snare(0.25 + 0.6 * i / n_roll), 0.22 * (0.3 + 0.7 * i / n_roll), 0.2)

# Groove: four bars C | Am | F | G from the release to the ramp.
prog = ['C', 'Am', 'F', 'G']
lead = [  # (beat, midi, beats)
    (0, 76, .5), (.5, 79, .5), (1, 84, .75), (1.75, 83, .25), (2, 84, .5), (2.5, 86, .5), (3, 88, 1),
    (4, 86, .5), (4.5, 84, .5), (5, 81, .75), (5.75, 79, .25), (6, 81, .5), (6.5, 84, .5), (7, 88, 1),
    (8, 89, .75), (8.75, 88, .25), (9, 86, .5), (9.5, 84, .5), (10, 81, .5), (10.5, 84, .5), (11, 89, 1),
    (12, 91, .5), (12.5, 89, .25), (12.75, 88, .25), (13, 86, .5), (13.5, 83, .5), (14, 79, .5), (14.5, 86, .5), (15, 91, 1.2)]
for b, n, l in lead:
    d = l * BEAT + 0.05
    music.add(beat(b), pluck(n, d, 'pulse', 0.25, dec=0.1, s=0.55, r=0.05, vib=0.006), 0.13, 0.15)
    music.add(beat(b) + 0.13, pluck(n, d, 'pulse', 0.25, dec=0.1, s=0.55, r=0.05), 0.04, -0.4)   # echo
for bar, name in enumerate(prog):
    root = CH[name][0]
    for e in range(8):   # bass: octave bounce in eighths
        n = root - 12 + (12 if e % 2 else 0)
        music.add(beat(bar * 4 + e * .5), pluck(n, BEAT * .5, 'tri', a=0.002, dec=0.12, s=0.5, r=0.03, bright=1), 0.32)
    for e in (0.5, 1.5, 2.5, 3.5):   # off-beat chord skank
        for n in CH[name][1:]:
            music.add(beat(bar * 4 + e), pluck(n + 12, BEAT * .4, 'square', dec=0.06, s=0.2, r=0.04), 0.035, -0.3)
    for b in range(4):
        music.add(beat(bar * 4 + b), kick(1.0 if b % 2 == 0 else 0.0), 0.55)
        if b % 2: music.add(beat(bar * 4 + b), snare(), 0.32, 0.05)
        for h in (0, .5): music.add(beat(bar * 4 + b + h), hat(0.9 if h else 0.6), 0.22, 0.3)
    if bar == 1:  # fill into the loop
        for i, h in enumerate((3.25, 3.5, 3.75)): music.add(beat(bar * 4 + h), snare(0.5 + 0.2 * i), 0.3)
music.add(beat(0), crash(), 0.35, -0.2)
music.add(beat(8), crash(0.7), 0.3, 0.2)

# Breakdown through the leap: suspended pad, shimmering arps, swell into the landing.
land = sec(cues['land'])
bd0 = beat(15.5)
music.add(bd0, pad([41, 48, 52, 57, 64], land - bd0 + 0.3, a=0.35, r=0.3, bright=0.7), 0.17)
shimmer = [88, 91, 96, 100, 103, 100, 96, 91]
i = 0; tt = bd0
while tt < land - 0.05:
    music.add(tt, pluck(shimmer[i % 8], 0.4, 'tri', dec=0.2, s=0.1, r=0.15), 0.07, 0.5 * np.sin(i))
    tt += 0.095; i += 1
swell_d = land - (land - 1.4)
sw = bandpass(noise(swell_d), 3000, 14000) * np.linspace(0, 1, int(round(swell_d * SR))) ** 2.5
music.add(land - swell_d, sw, 0.25)

# Landing hit and the outro: C | F G | C, ending on a stinger as the iris closes.
music.add(land, crash(1.0), 0.4)
music.add(land, kick(1.2), 0.7)
for n in [48, 55, 60, 64, 67, 72]:
    music.add(land, pluck(n, 1.4, 'saw', dec=0.5, s=0.4, r=0.5, bright=0.6), 0.07)
B2 = BEAT
outro_bars = [('C', land), ('F', land + 4 * B2), ('G', land + 6 * B2)]
iris_end = sec(cues['irisEnd'])
for name, start in outro_bars:
    span = 4 if name == 'C' else 2
    for e in range(span * 2):
        n = CH[name][0] - 12 + (12 if e % 2 else 0)
        music.add(start + e * B2 / 2, pluck(n, B2 * .5, 'tri', dec=0.12, s=0.5, r=0.03), 0.26)
    for b in range(span):
        music.add(start + b * B2, kick(1.0 if b % 2 == 0 else 0.0), 0.45)
        if b % 2: music.add(start + b * B2, snare(0.8), 0.25)
        music.add(start + b * B2 + B2 / 2, hat(0.7), 0.18, 0.3)
outro_lead = [(0, 88, .5), (.5, 91, .5), (1, 96, 1.5), (4, 93, .5), (4.5, 91, .5), (5, 89, .5), (6, 91, .5), (6.5, 93, .5), (7, 95, 1)]
for b, n, l in outro_lead:
    music.add(land + b * B2, pluck(n, l * B2 + 0.05, 'pulse', 0.25, dec=0.1, s=0.5, r=0.06, vib=0.006), 0.11, 0.15)
# relaxed hold while Sonic taps his foot
hold0 = land + 8 * B2
music.add(hold0, pad([48, 55, 60, 64, 71], iris_end - hold0, a=0.3, r=0.4, bright=0.6), 0.13)
k = 0; tt = hold0
while tt < iris_end - 0.2:
    music.add(tt, pluck([72, 76, 79, 83][k % 4], 0.3, 'tri', dec=0.15, s=0.1, r=0.1), 0.08, 0.3 * np.sin(k))
    tt += B2 / 2; k += 1
# stinger
for n in [48, 60, 64, 67, 72, 76, 79, 84]:
    music.add(iris_end, pluck(n, 1.6, 'pulse', 0.5, dec=0.4, s=0.5, r=0.9, bright=0.8), 0.06)
music.add(iris_end, crash(0.8), 0.3); music.add(iris_end, kick(1.2), 0.6)

mus = music.out(END)
mus = np.stack([reverb(mus[:, 0], 1.6, 0.22), reverb(mus[:, 1], 1.7, 0.22)], axis=1)
fade = int(0.25 * SR); mus[-fade:] *= np.linspace(1, 0, fade)[:, None]
mus *= 0.85 / (np.max(np.abs(mus)) + 1e-9)

# ---------------------------------------------------------------- sound effects
def sfx_tap():
    d = 0.12; t = t_axis(d)
    return (bandpass(noise(d), 1500, 5000) * np.exp(-t * 90) * 0.6 + sine(130, d) * np.exp(-t * 45) * 0.5) * 0.9
def sfx_curl():
    d = 0.22; t = t_axis(d)
    return bandpass(noise(d), 800, 6000) * np.sin(np.pi * t / d) ** 2 * 0.5 + sine(300 + 900 * t / d, d) * np.exp(-t * 12) * 0.25
def sfx_rev(k):
    d = 0.42; t = t_axis(d)
    base = 180 * 1.18 ** k
    f = base * (1 + 3.2 * (1 - np.exp(-t * 9)))
    buzz = additive(f, d, 'square', bright=0.7) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * (34 + 8 * k) * t)))
    return (buzz * 0.45 + bandpass(noise(d), 2000, 9000) * 0.25) * adsr(len(t), 0.005, 0.1, 0.8, 0.12)
def sfx_release():
    d = 1.1; t = t_axis(d)
    whoosh = bandpass(noise(d), 300, 8000) * np.exp(-t * 3.5) * 0.7
    boom = sine(70 * np.exp(-t * 2) + 30, d) * np.exp(-t * 4) * 0.9
    zip_ = additive(1400 * np.exp(-t * 6) + 200, d, 'saw', bright=0.6) * np.exp(-t * 7) * 0.25
    return whoosh + boom + zip_
def sfx_pop():
    d = 0.16; t = t_axis(d)
    return sine(700 + 1400 * t / d, d) * np.exp(-t * 25) * 0.5 + bandpass(noise(d), 3000, 12000) * np.exp(-t * 60) * 0.2
def sfx_wind(d, intensity):
    t = t_axis(d); x = noise(d)
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * 0.7 * t) * np.sin(2 * np.pi * 0.31 * t + 1)
    y = bandpass(x, 250, 2500) * lfo * np.interp(t, np.linspace(0, d, len(intensity)), intensity)
    return y * 0.5
def sfx_patter(d, rate):
    t = t_axis(d); out = np.zeros(len(t)); step = 1 / rate; tt = 0.0
    hit = sfx_tap() * 0.45
    while tt < d - 0.12:
        i = int(tt * SR); out[i:i + len(hit)] += hit * (0.7 + 0.3 * rng.random()); tt += step * (0.92 + 0.16 * rng.random())
    return out
def sfx_launch():
    d = 0.9; t = t_axis(d)
    spring = sine(220 * (1 + 4 * (1 - np.exp(-t * 6))), d) * np.exp(-t * 4) * (0.7 + 0.3 * np.sin(2 * np.pi * 26 * t)) * 0.45
    return spring + bandpass(noise(d), 600, 7000) * np.sin(np.pi * np.clip(t / 0.7, 0, 1)) * 0.45
def sfx_land():
    d = 1.0; t = t_axis(d)
    thud = sine(95 * np.exp(-t * 6) + 35, d) * np.exp(-t * 7) * 1.0 + bandpass(noise(d), 100, 1500) * np.exp(-t * 14) * 0.5
    skid_d = 0.7; ts = t_axis(skid_d)
    skid = bandpass(noise(skid_d), 900, 6000) * (0.55 + 0.45 * np.sign(np.sin(2 * np.pi * (60 - 40 * ts / skid_d) * ts))) * np.exp(-ts * 2.5) * 0.5
    out = thud.copy(); out[: len(skid)] += skid
    return out
def sfx_glint():
    d = 1.1; t = t_axis(d)
    x = (sine(3520, d) * 0.5 + sine(5274, d) * 0.3 + sine(7040, d) * 0.15) * np.exp(-t * 5)
    return reverb(x, 1.2, 0.35) * 0.6
def sfx_ring():
    d = 0.9; t = t_axis(d)
    n1 = int(0.07 * SR)
    a = additive(1318.5, d, 'pulse', 0.25, bright=0.8) * np.exp(-t * 30)
    b = additive(1760.0, d, 'pulse', 0.25, bright=0.8) * np.exp(-np.clip(t - 0.07, 0, None) * 5.5)
    b[:n1] = 0
    return (a[:len(t)] * 0.5 + b * 0.55) * 0.55
def sfx_shimmer():
    d = 1.8; t = t_axis(d); out = np.zeros(len(t))
    for i in range(16):
        st = rng.random() * 1.3; f = midi(88 + rng.integers(0, 20)); dd = 0.5
        p = sine(f, dd) * np.exp(-t_axis(dd) * 8); j = int(st * SR); out[j:j + len(p)] += p[: len(out) - j] * 0.25
    return reverb(out, 1.6, 0.5)

def sfx_ambience(d):
    t = t_axis(d)
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * t / 4.2) ** 2
    waves = lowpass(noise(d), 900) * swell * 0.5 + bandpass(noise(d), 2500, 7000) * swell * 0.05
    birds = np.zeros(len(t))
    for st in (0.35, 0.62, 0.9, 1.6, 1.78, 2.9, 3.05):
        cd = 0.11; tc = t_axis(cd)
        f = 2600 + 1500 * np.sin(np.pi * tc / cd) + 300 * np.sin(2 * np.pi * 38 * tc)
        chirp = sine(f, cd) * np.sin(np.pi * tc / cd) ** 2
        j = int(st * SR); birds[j:j + len(chirp)] += chirp[: len(birds) - j] * 0.22
    return (waves + birds) * adsr(len(t), 0.8, 0.1, 1.0, 1.2)

assets, clips = {}, []
def asset(name, sig):
    if name not in assets: assets[name] = write(name + '.wav', sig)
    return name
def cue(track, name, sig, at, gain=1.0, pan=0.0):
    asset(name, sig if sig.ndim == 2 else stereo(sig, pan) / np.sqrt(2))
    clips.append({'track': track, 'asset': name, 'start': max(0.0, at), 'gain': gain})

asset('music', mus)
cue('Effects', 'seaside-ambience', sfx_ambience(sec(cues['release']) + 0.6), 0.0, 0.6)
clips.append({'track': 'Music', 'asset': 'music', 'start': 0.0, 'gain': 1.0})
for i, f in enumerate(cues['taps']): cue('Effects', 'foot-tap', sfx_tap(), sec(f), 0.55)
cue('Effects', 'curl', sfx_curl(), sec(cues['curl']) - 0.05, 0.6)
for k, f in enumerate(cues['revs']): cue('Effects', f'spin-rev-{k + 1}', sfx_rev(k), sec(f), 0.5)
cue('Effects', 'release', sfx_release(), sec(cues['release']), 0.8)
cue('Effects', 'unfurl-pop', sfx_pop(), sec(cues['unfurl']) - 0.03, 0.6)
run0, run1 = sec(cues['release']), sec(cues['lip']) + 0.3
loop0, loop1 = sec(cues['loopIn']), sec(cues['loopOut'])
d = run1 - run0
inten = [0.0, 0.8, 0.7, 0.7] + [1.0] * 4 + [0.75, 0.5]
cue('Effects', 'speed-wind', sfx_wind(d, inten), run0, 0.55)
pat = sfx_patter(sec(cues['lip']) - sec(cues['unfurl']), 13.0)
cue('Effects', 'running-steps', pat, sec(cues['unfurl']), 0.35)
cue('Effects', 'launch', sfx_launch(), sec(cues['lip']) - 0.05, 0.7)
cue('Effects', 'slow-motion-shimmer', sfx_shimmer(), sec(cues['slowStart']), 0.45)
cue('Effects', 'landing', sfx_land(), sec(cues['land']), 0.85)
cue('Effects', 'glint', sfx_glint(), sec(cues['glint']), 0.55)
cue('Effects', 'iris-pop', sfx_pop(), sec(cues['irisEnd']) - 0.02, 0.5)
ring = sfx_ring()
for i, f in enumerate(cues['rings']):
    name = 'ring-left' if i % 2 == 0 else 'ring-right'
    cue('Rings', name, ring, sec(f), 0.5, -0.45 if i % 2 == 0 else 0.45)

# full mix exactly as the clips are placed
def load(name):
    with wave.open(os.path.join(OUT, assets[name]), 'rb') as w:
        return np.frombuffer(w.readframes(w.getnframes()), '<i2').reshape(-1, 2) / 32767.0
mix = Bus(END + 2)
TRACK_GAIN = {'Music': 0.5, 'Effects': 0.72, 'Rings': 0.6}
for c in clips: mix.add(c['start'], load(c['asset']), c['gain'] * TRACK_GAIN[c['track']])
m = mix.out(END)
peak = np.max(np.abs(m))
print('mix peak', round(float(peak), 3), 'clips', len(clips), 'assets', len(assets))
write('mix.wav', m)
# the project's _styk.audio: embedded WAV bytes in 192 KiB chunks plus waveform peaks
import base64
state = {'version': 1, 'assets': {}, 'tracks': []}
for name, file in assets.items():
    raw = open(os.path.join(OUT, file), 'rb').read()
    pcm = load(name); dur = len(pcm) / SR
    count = min(4096, max(1, int(np.ceil(dur * 80))))
    bins = np.minimum(count - 1, (np.arange(len(pcm)) * count) // len(pcm))
    peaks = np.zeros(count); np.maximum.at(peaks, bins, np.max(np.abs(pcm), axis=1))
    state['assets'][name] = {'id': name, 'name': file, 'size': len(raw), 'duration': dur,
        'peaks': [round(float(v), 4) for v in peaks],
        'chunks': [{'data_base64': base64.b64encode(raw[i:i + 192 * 1024]).decode()} for i in range(0, len(raw), 192 * 1024)]}
for k, track in enumerate(['Music', 'Effects', 'Rings']):
    state['tracks'].append({'id': f'track-{k + 1}', 'name': track, 'gain': TRACK_GAIN[track], 'mute': False, 'solo': False,
        'clips': [{'id': f'clip-{k + 1}-{i + 1}', 'assetId': c['asset'], 'start': round(c['start'], 6), 'offset': 0, 'duration': state['assets'][c['asset']]['duration'],
                   'gain': c['gain'], 'fadeIn': 0, 'fadeOut': 0} for i, c in enumerate(x for x in clips if x['track'] == track)]})
json.dump(state, open(os.path.join(OUT, 'audio-state.json'), 'w'))
json.dump({'assets': assets, 'clips': clips, 'trackGain': TRACK_GAIN, 'duration': END}, open(os.path.join(OUT, 'audio.json'), 'w'), indent=1)
