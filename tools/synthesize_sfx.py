"""Synthesize the game's sound effects (no samples, no AI): every sound in
src/game/audioManifest.ts's SFX list, built from noise, oscillators, FM bells
and plucked strings, then encoded as .ogg (and .m4a for Safari) into
src/assets/audio/sfx/.

These are stand-ins with the right character and length. Any real recording
dropped in with the same name replaces one (see docs/AUDIO_BRIEF.md).

Run:  python tools/synthesize_sfx.py            (needs numpy, scipy, ffmpeg)
      python tools/synthesize_sfx.py hit crit    (just these)
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "assets" / "audio" / "sfx"
RNG = np.random.default_rng(20261031)


# ---------------------------------------------------------------- building blocks

def t_axis(seconds: float) -> np.ndarray:
    return np.arange(int(SR * seconds)) / SR


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(SR * seconds))


def noise(seconds: float) -> np.ndarray:
    return RNG.uniform(-1, 1, int(SR * seconds))


def lowpass(x: np.ndarray, hz: float, order: int = 2) -> np.ndarray:
    b, a = butter(order, min(hz, SR / 2 - 100) / (SR / 2), "low")
    return lfilter(b, a, x)


def highpass(x: np.ndarray, hz: float, order: int = 2) -> np.ndarray:
    b, a = butter(order, hz / (SR / 2), "high")
    return lfilter(b, a, x)


def bandpass(x: np.ndarray, low: float, high: float, order: int = 2) -> np.ndarray:
    b, a = butter(order, [low / (SR / 2), min(high, SR / 2 - 100) / (SR / 2)], "band")
    return lfilter(b, a, x)


def sweep_filter(x: np.ndarray, start_hz: float, end_hz: float, width: float = 0.6, steps: int = 24) -> np.ndarray:
    """A band-pass whose centre glides from start to end (a whoosh)."""
    out = np.zeros_like(x)
    edges = np.linspace(0, len(x), steps + 1).astype(int)
    window = np.hanning(2 * (edges[1] - edges[0]) + 1)
    for i in range(steps):
        centre = start_hz * (end_hz / start_hz) ** (i / max(1, steps - 1))
        lo, hi = centre * (1 - width / 2), centre * (1 + width / 2)
        a, b = max(0, edges[i] - (edges[1] - edges[0])), min(len(x), edges[i + 1] + (edges[1] - edges[0]))
        seg = bandpass(x[a:b], max(30, lo), hi)
        w = np.hanning(b - a)
        out[a:b] += seg * w
    return out


def env_exp(seconds: float, decay: float, attack: float = 0.002) -> np.ndarray:
    t = t_axis(seconds)
    env = np.exp(-t / decay)
    a = max(1, int(SR * attack))
    env[:a] *= np.linspace(0, 1, a)
    return env


def env_adsr(seconds: float, attack: float, decay: float, sustain: float, release: float) -> np.ndarray:
    n = int(SR * seconds)
    a, d, r = int(SR * attack), int(SR * decay), int(SR * release)
    s = max(0, n - a - d - r)
    env = np.concatenate([np.linspace(0, 1, a), np.linspace(1, sustain, d), np.full(s, sustain), np.linspace(sustain, 0, r)])
    return np.pad(env, (0, max(0, n - len(env))))[:n]


def osc(freq, seconds: float, shape: str = "sine") -> np.ndarray:
    """Oscillator; freq may be a number or an array (a glide)."""
    n = int(SR * seconds)
    f = np.full(n, freq, dtype=float) if np.isscalar(freq) else np.asarray(freq, dtype=float)[:n]
    phase = 2 * np.pi * np.cumsum(f) / SR
    if shape == "sine":
        return np.sin(phase)
    if shape == "saw":
        return 2 * ((phase / (2 * np.pi)) % 1) - 1
    if shape == "square":
        return np.sign(np.sin(phase))
    if shape == "tri":
        return 2 * np.abs(2 * ((phase / (2 * np.pi)) % 1) - 1) - 1
    raise ValueError(shape)


def glide(start: float, end: float, seconds: float, curve: float = 1.0) -> np.ndarray:
    t = np.linspace(0, 1, int(SR * seconds)) ** curve
    return start * (end / start) ** t


def bell(freq: float, seconds: float, decay: float = 0.8, bright: float = 1.0, partials=None) -> np.ndarray:
    """A struck metal bell: inharmonic partials, the higher ones dying faster."""
    partials = partials or [(1.0, 1.0), (2.76, 0.55), (5.40, 0.35), (8.93, 0.2), (1.5, 0.3), (0.5, 0.25)]
    t = t_axis(seconds)
    out = np.zeros_like(t)
    for ratio, amp in partials:
        out += amp * (bright if ratio > 2 else 1) * np.sin(2 * np.pi * freq * ratio * t + RNG.uniform(0, 6.28)) * np.exp(-t / (decay / ratio ** 0.6))
    attack = int(SR * 0.002)
    out[:attack] *= np.linspace(0, 1, attack)
    return out


def pluck(freq: float, seconds: float, damping: float = 0.996, bright: float = 0.5) -> np.ndarray:
    """Karplus-Strong plucked string (a guzheng-like tone)."""
    n = int(SR * seconds)
    period = max(2, int(SR / freq))
    buf = lowpass(RNG.uniform(-1, 1, period), 1500 + 6000 * bright, 1)
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % period]
        buf[i % period] = damping * 0.5 * (buf[i % period] + buf[(i + 1) % period])
    return out


def thump(freq_start: float, freq_end: float, seconds: float, decay: float) -> np.ndarray:
    return osc(glide(freq_start, freq_end, seconds, 0.5), seconds) * env_exp(seconds, decay)


def sparkle(seconds: float, count: int, low: float = 2500, high: float = 7000, decay: float = 0.06) -> np.ndarray:
    out = silence(seconds)
    for _ in range(count):
        start = RNG.uniform(0, seconds * 0.7)
        f = RNG.uniform(low, high)
        d = min(seconds - start, decay * 4)
        tone = np.sin(2 * np.pi * f * t_axis(d)) * env_exp(d, decay)
        put(out, tone * RNG.uniform(0.3, 1), start)
    return out


def put(target: np.ndarray, sound: np.ndarray, at: float, gain: float = 1.0) -> np.ndarray:
    i = int(SR * at)
    end = min(len(target), i + len(sound))
    if end > i:
        target[i:end] += gain * sound[: end - i]
    return target


def mix(seconds: float, *parts) -> np.ndarray:
    """parts: (sound, at, gain) tuples."""
    out = silence(seconds)
    for sound, at, gain in parts:
        put(out, sound, at, gain)
    return out


def reverb(x: np.ndarray, seconds: float = 0.6, wet: float = 0.25, tone: float = 4000) -> np.ndarray:
    """A small room: convolution with decaying filtered noise."""
    ir = lowpass(noise(seconds), tone) * np.exp(-t_axis(seconds) / (seconds / 4))
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    tail = np.convolve(x, ir)[: len(x)]
    return (1 - wet) * x + wet * tail


def finish(x: np.ndarray, peak_db: float = -4.5, fade: float = 0.01) -> np.ndarray:
    x = x - np.mean(x)
    f = min(len(x) // 4, int(SR * fade))
    if f > 0:
        x[-f:] *= np.linspace(1, 0, f)
        x[: min(32, len(x))] *= np.linspace(0, 1, min(32, len(x)))
    peak = np.max(np.abs(x)) or 1
    return x / peak * 10 ** (peak_db / 20)


def swish(seconds: float, start: float, end: float, decay: float, width: float = 0.7) -> np.ndarray:
    return sweep_filter(noise(seconds), start, end, width) * env_adsr(seconds, 0.015, seconds * 0.3, 0.5, seconds * 0.6) * env_exp(seconds, decay, 0.01)


PENTATONIC = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0, 880.0]


# ---------------------------------------------------------------- the sounds

def li_attack():
    s = 0.3
    return mix(s, (swish(s, 2600, 700, 0.12), 0, 1), (bell(3150, s, 0.12, partials=[(1, 1), (1.51, 0.4)]), 0.02, 0.18))


def li_ability():
    s = 0.85
    parts = [(swish(s, 900, 3200, 0.35, 0.5), 0.15, 0.6)]
    for k, f in enumerate([1180, 1320, 1480, 1660]):
        parts.append((bell(f, 0.6, 0.35, bright=1.2), 0.03 + k * 0.07, 0.35))
    return reverb(mix(s, *parts), 0.5, 0.2)


def seo_attack():
    s = 0.2
    return mix(s, (swish(s, 4200, 1500, 0.07, 0.8), 0, 1), (noise(0.01) * 0.5, 0.0, 0.4))


def seo_ability():
    s = 0.6
    rise = sweep_filter(noise(s), 300, 2400, 0.8) * env_adsr(s, 0.25, 0.05, 0.6, 0.3)
    fold = thump(140, 55, 0.25, 0.08)
    return reverb(mix(s, (rise, 0, 1), (fold, 0.32, 0.7)), 0.4, 0.2, 2500)


def rei_attack():
    s = 0.32
    puff = lowpass(noise(s), 1800) * env_adsr(s, 0.02, 0.1, 0.4, 0.2)
    tone = osc(glide(320, 520, s), s) * env_exp(s, 0.1, 0.01) * 0.3
    return mix(s, (puff, 0, 1), (tone, 0, 1))


def rei_ability():
    s = 1.0
    flame = lowpass(noise(s), 2500) * env_adsr(s, 0.35, 0.2, 0.5, 0.4)
    yip_s = 0.22
    f = np.concatenate([glide(700, 1500, yip_s * 0.4), glide(1500, 950, yip_s * 0.6)])
    vib = 1 + 0.03 * np.sin(2 * np.pi * 28 * t_axis(len(f) / SR))
    yip = osc(f * vib, len(f) / SR, "tri") * env_adsr(len(f) / SR, 0.01, 0.05, 0.7, 0.1)
    return reverb(mix(s, (flame, 0, 0.7), (yip, 0.3, 0.6), (sparkle(s, 10, 2000, 5000, 0.08), 0.35, 0.25)), 0.5, 0.25)


def hit():
    s = 0.16
    return mix(s, (thump(150, 55, s, 0.05), 0, 1), (lowpass(noise(0.03), 3500) * env_exp(0.03, 0.008), 0, 0.7))


def crit():
    s = 0.32
    return mix(s, (hit(), 0, 1), (bell(2480, s, 0.18, partials=[(1, 1), (2.1, 0.4), (3.3, 0.2)]), 0.005, 0.4))


def hurt():
    s = 0.3
    return mix(s, (thump(110, 40, 0.25, 0.08), 0, 1), (swish(0.25, 1600, 400, 0.08), 0.02, 0.5))


def deflect():
    s = 0.32
    return reverb(mix(s, (bell(1850, s, 0.2, bright=1.3), 0, 1), (noise(0.01), 0, 0.3)), 0.3, 0.2)


def heal():
    s = 0.65
    parts = [(osc(f, 0.4) * env_adsr(0.4, 0.02, 0.1, 0.4, 0.25), k * 0.07, 0.4) for k, f in enumerate([523.3, 659.3, 784.0, 1046.5])]
    return reverb(mix(s, *parts, (sparkle(s, 8, 3000, 6000, 0.05), 0.15, 0.2)), 0.6, 0.3)


def revive():
    s = 1.7
    roar = lowpass(noise(s), 1200) * env_adsr(s, 0.6, 0.3, 0.6, 0.6)
    rise = osc(glide(180, 720, s, 0.7), s, "saw")
    rise = lowpass(rise, 2000) * env_adsr(s, 0.5, 0.2, 0.5, 0.8) * 0.4
    return reverb(mix(s, (roar, 0, 0.8), (rise, 0, 1), (sparkle(s, 25, 2000, 6000, 0.1), 0.5, 0.3)), 0.8, 0.3)


def enemy_telegraph():
    s = 0.32
    return reverb(bell(1250, s, 0.16, partials=[(1, 1), (2.4, 0.3), (4.1, 0.12)]), 0.3, 0.2)


def enemy_shot():
    s = 0.22
    return mix(s, (swish(s, 1500, 3800, 0.1, 0.6), 0, 1), (osc(glide(600, 900, s), s) * env_exp(s, 0.06) * 0.2, 0, 1))


def enemy_death():
    s = 0.55
    burst = bandpass(noise(s), 1200, 6000) * env_exp(s, 0.08)
    return reverb(mix(s, (burst, 0, 0.6), (sparkle(s, 18, 2500, 7500, 0.05), 0, 0.7)), 0.4, 0.25)


def elite_death():
    s = 1.0
    gong = bell(110, s, 0.7, partials=[(1, 1), (2.0, 0.5), (2.9, 0.35), (4.2, 0.2)])
    return reverb(mix(s, (enemy_death(), 0, 0.9), (gong, 0, 0.7), (thump(90, 40, 0.3, 0.1), 0, 0.6)), 0.7, 0.25)


def ward_break():
    s = 0.45
    crack = highpass(noise(s), 2500) * env_exp(s, 0.05)
    pings = sparkle(s, 14, 3000, 8000, 0.04)
    return reverb(mix(s, (crack, 0, 0.8), (pings, 0.01, 0.6), (bell(1900, s, 0.15), 0, 0.25)), 0.4, 0.3)


def protector_charge():
    s = 0.8
    parts = [(thump(90, 45, 0.12, 0.04), at, 0.8) for at in (0.0, 0.18, 0.32, 0.43, 0.52)]
    rush = sweep_filter(noise(s), 300, 1400, 0.8) * env_adsr(s, 0.5, 0.05, 0.8, 0.2)
    return mix(s, *parts, (rush, 0, 0.6))


def warden_roar():
    s = 1.7
    f = 68 * (1 + 0.04 * np.sin(2 * np.pi * 7 * t_axis(s)))
    growl = lowpass(osc(f, s, "saw") + 0.5 * osc(f * 1.5, s, "saw"), 900) * env_adsr(s, 0.15, 0.3, 0.7, 0.7)
    rasp = bandpass(noise(s), 300, 1500) * env_adsr(s, 0.1, 0.3, 0.5, 0.8) * 0.5
    boom = thump(60, 30, 0.8, 0.3)
    return reverb(mix(s, (growl, 0, 1), (rasp, 0, 1), (boom, 0, 0.9)), 1.0, 0.35, 2000)


def spike_trap():
    s = 0.42
    grind = lowpass(noise(0.16), 500) * env_adsr(0.16, 0.02, 0.05, 0.6, 0.05)
    snap = mix(0.25, (highpass(noise(0.01), 3000), 0, 1), (bell(2200, 0.25, 0.08, partials=[(1, 1), (1.7, 0.6), (2.6, 0.4)]), 0, 0.5))
    return mix(s, (grind, 0, 0.6), (snap, 0.15, 1))


def fire_vent():
    s = 1.05
    hiss = highpass(noise(0.3), 4000) * env_adsr(0.3, 0.05, 0.1, 0.6, 0.1)
    roar = lowpass(noise(0.8), 1400) * env_adsr(0.8, 0.03, 0.2, 0.6, 0.4)
    crackle = silence(0.8)
    for _ in range(30):
        put(crackle, highpass(noise(0.004), 2000) * RNG.uniform(0.2, 1), RNG.uniform(0, 0.75))
    return mix(s, (hiss, 0, 0.5), (roar, 0.22, 1), (crackle, 0.22, 0.4))


def pit_crumble():
    s = 0.7
    parts = [(bandpass(noise(0.05), 400, 3000) * env_exp(0.05, 0.015), at, RNG.uniform(0.5, 1)) for at in (0, 0.07, 0.15, 0.2, 0.3, 0.38)]
    rumble = lowpass(noise(s), 250) * env_adsr(s, 0.1, 0.2, 0.6, 0.3)
    return mix(s, *parts, (rumble, 0, 0.8))


def fall():
    s = 1.05
    down = sweep_filter(noise(0.8), 2000, 250, 0.7) * env_adsr(0.8, 0.05, 0.3, 0.6, 0.4)
    thud = lowpass(thump(80, 35, 0.25, 0.08), 400)
    return mix(s, (down, 0, 0.9), (thud, 0.78, 0.5))


def burn_ignite():
    s = 0.32
    whoomp = lowpass(noise(s), 1500) * env_adsr(s, 0.05, 0.1, 0.4, 0.15)
    return mix(s, (whoomp, 0, 1), (sparkle(s, 6, 1500, 4000, 0.01), 0.05, 0.4))


def door_seal():
    s = 0.75
    slam = mix(0.4, (thump(95, 38, 0.4, 0.1), 0, 1), (lowpass(noise(0.08), 1200) * env_exp(0.08, 0.03), 0, 0.8))
    hum = (osc(110, s) + 0.5 * osc(220, s) + 0.25 * osc(330.5, s)) * env_adsr(s, 0.05, 0.2, 0.4, 0.4) * 0.3
    return reverb(mix(s, (slam, 0, 1), (hum, 0.02, 1)), 0.6, 0.25, 2000)


def room_clear():
    s = 1.4
    notes = [PENTATONIC[i] for i in (0, 2, 3, 4, 5)]
    parts = [(pluck(f, 1.0, 0.997, 0.6), k * 0.09, 0.5) for k, f in enumerate(notes)]
    return reverb(mix(s, *parts, (bell(1046.5, 0.9, 0.5), 0.45, 0.25)), 0.8, 0.3)


def chest_land():
    s = 0.4
    return mix(s, (bandpass(noise(0.12), 150, 700) * env_exp(0.12, 0.03), 0, 1), (thump(120, 60, 0.2, 0.05), 0, 0.7))


def chest_open():
    s = 0.85
    f = 150 * (1 + 0.15 * np.sin(2 * np.pi * 11 * t_axis(0.35)))
    creak = bandpass(osc(f, 0.35, "saw"), 300, 2500) * env_adsr(0.35, 0.05, 0.1, 0.6, 0.15) * 0.5
    return reverb(mix(s, (creak, 0, 1), (sparkle(0.55, 16, 2500, 7000, 0.06), 0.3, 0.6), (bell(1568, 0.5, 0.3), 0.32, 0.25)), 0.6, 0.3)


def pickup_stone():
    s = 0.2
    return mix(s, (osc(2637, s) * env_exp(s, 0.04), 0, 0.6), (osc(3951, s) * env_exp(s, 0.03), 0.02, 0.4))


def pickup_item():
    s = 0.5
    return reverb(mix(s, (bell(880, 0.4, 0.2, 0.6), 0, 0.6), (bell(1318.5, 0.4, 0.25, 0.6), 0.08, 0.6)), 0.4, 0.25)


def pickup_rare():
    s = 1.15
    parts = [(bell(f, 0.8, 0.35, 0.7), k * 0.09, 0.5) for k, f in enumerate([784.0, 1046.5, 1318.5, 1568.0])]
    return reverb(mix(s, *parts, (sparkle(0.9, 22, 3000, 8000, 0.07), 0.2, 0.35)), 0.8, 0.35)


def urn_break():
    s = 0.42
    shatter = bandpass(noise(s), 1500, 6000) * env_exp(s, 0.07)
    return mix(s, (shatter, 0, 0.9), (sparkle(s, 10, 1800, 5000, 0.03), 0, 0.6), (thump(200, 90, 0.1, 0.03), 0, 0.4))


def portal_open():
    s = 2.1
    tear = sweep_filter(noise(0.7), 300, 3500, 0.9) * env_adsr(0.7, 0.3, 0.1, 0.7, 0.3)
    t = t_axis(1.6)
    lfo = 1 + 0.02 * np.sin(2 * np.pi * 0.8 * t)
    hum = (osc(110 * lfo, 1.6) + osc(111.5 * lfo, 1.6) + 0.5 * osc(220.7, 1.6) + 0.3 * osc(329.6 * lfo, 1.6)) * env_adsr(1.6, 0.4, 0.3, 0.6, 0.7) * 0.3
    return reverb(mix(s, (tear, 0, 0.8), (hum, 0.45, 1), (sparkle(1.2, 20, 2000, 6000, 0.1), 0.4, 0.25)), 1.0, 0.35)


def portal_enter():
    s = 1.25
    rise = sweep_filter(noise(1.0), 250, 4000, 0.8) * env_adsr(1.0, 0.7, 0.05, 0.9, 0.05)
    return reverb(mix(s, (rise, 0, 1), (osc(glide(200, 800, 1.0), 1.0) * env_adsr(1.0, 0.6, 0.1, 0.5, 0.1) * 0.25, 0, 1)), 0.6, 0.3)


def bell_toll():
    s = 3.2
    big = bell(176, s, 1.6, partials=[(0.5, 0.4), (1, 1), (1.19, 0.5), (1.56, 0.35), (2.0, 0.45), (2.74, 0.25), (3.76, 0.15), (5.4, 0.08)])
    strike = lowpass(noise(0.03), 2000) * env_exp(0.03, 0.01)
    return reverb(mix(s, (big, 0, 1), (strike, 0, 0.5)), 1.5, 0.35, 3000)


def altar_offer():
    s = 1.5
    beat = mix(0.6, (thump(70, 40, 0.18, 0.06), 0, 1), (thump(70, 40, 0.18, 0.06), 0.22, 0.8))
    chord = sum(osc(f * (1 + d), 1.1, "saw") for f in (146.8, 174.6, 220.0) for d in (-0.003, 0.003))
    choir = lowpass(chord, 1100) * env_adsr(1.1, 0.4, 0.2, 0.6, 0.5) * 0.18
    return reverb(mix(s, (beat, 0, 1), (choir, 0.35, 1)), 1.0, 0.35, 2500)


def purchase():
    s = 0.62
    coins = [(bell(RNG.uniform(2800, 4200), 0.2, 0.06, partials=[(1, 1), (1.6, 0.4)]), at, 0.4) for at in (0, 0.05, 0.09, 0.15, 0.2)]
    return reverb(mix(s, *coins, (bell(1318.5, 0.4, 0.25), 0.25, 0.5)), 0.4, 0.25)


def deny():
    s = 0.22
    return mix(s, (lowpass(osc(220, 0.09, "square"), 900) * env_exp(0.09, 0.04), 0, 0.5), (lowpass(osc(165, 0.12, "square"), 800) * env_exp(0.12, 0.05), 0.08, 0.5))


def lore_found():
    s = 1.05
    rustle = silence(0.45)
    for _ in range(14):
        put(rustle, bandpass(noise(0.03), 2000, 7000) * env_exp(0.03, 0.01) * RNG.uniform(0.3, 1), RNG.uniform(0, 0.4))
    return reverb(mix(s, (rustle, 0, 0.6), (bell(1046.5, 0.7, 0.4, 0.6), 0.3, 0.5), (bell(1568, 0.6, 0.35, 0.6), 0.42, 0.35)), 0.7, 0.3)


def hero_unlock():
    s = 2.6
    phrase = [(PENTATONIC[i], at) for i, at in ((2, 0), (3, 0.16), (4, 0.32), (7, 0.55), (6, 0.9), (7, 1.05))]
    parts = [(pluck(f, 1.4, 0.998, 0.6), at, 0.5) for f, at in phrase]
    swell = (osc(261.6, 1.6) + osc(392, 1.6) + osc(523.3, 1.6)) * env_adsr(1.6, 0.4, 0.3, 0.5, 0.8) * 0.12
    return reverb(mix(s, *parts, (swell, 0.5, 1), (bell(1046.5, 1.2, 0.6), 1.05, 0.25)), 1.2, 0.3)


def stage_up():
    s = 2.6
    parts = [(osc(f, 0.6) * env_adsr(0.6, 0.02, 0.1, 0.4, 0.4), k * 0.08, 0.25) for k, f in enumerate([392, 523.3, 659.3, 784, 1046.5, 1318.5])]
    gong = bell(130.8, 2.0, 1.1, partials=[(1, 1), (2.0, 0.5), (2.92, 0.35), (4.1, 0.2), (5.4, 0.1)])
    return reverb(mix(s, *parts, (sparkle(1.0, 24, 3000, 8000, 0.08), 0.2, 0.3), (gong, 0.55, 0.8)), 1.2, 0.35)


def ui_move():
    s = 0.07
    return bandpass(noise(s), 1200, 2400) * env_exp(s, 0.01)


def ui_confirm():
    s = 0.28
    return mix(s, (bell(1046.5, 0.2, 0.08, 0.5), 0, 0.6), (bell(1568, 0.2, 0.1, 0.5), 0.06, 0.6))


def ui_back():
    s = 0.18
    return mix(s, (bell(784, 0.15, 0.06, 0.4), 0, 0.5), (bell(587.3, 0.15, 0.07, 0.4), 0.05, 0.5))


def ui_open():
    s = 0.32
    return sweep_filter(noise(s), 1500, 5000, 0.8) * env_adsr(s, 0.05, 0.1, 0.5, 0.15) * 0.8


SOUNDS = {
    "li-attack": li_attack, "li-ability": li_ability, "seo-attack": seo_attack, "seo-ability": seo_ability,
    "rei-attack": rei_attack, "rei-ability": rei_ability, "hit": hit, "crit": crit, "hurt": hurt, "deflect": deflect,
    "heal": heal, "revive": revive, "enemy-telegraph": enemy_telegraph, "enemy-shot": enemy_shot,
    "enemy-death": enemy_death, "elite-death": elite_death, "ward-break": ward_break, "protector-charge": protector_charge,
    "warden-roar": warden_roar, "spike-trap": spike_trap, "fire-vent": fire_vent, "pit-crumble": pit_crumble, "fall": fall,
    "burn-ignite": burn_ignite, "door-seal": door_seal, "room-clear": room_clear, "chest-land": chest_land,
    "chest-open": chest_open, "pickup-stone": pickup_stone, "pickup-item": pickup_item, "pickup-rare": pickup_rare,
    "urn-break": urn_break, "portal-open": portal_open, "portal-enter": portal_enter, "bell-toll": bell_toll,
    "altar-offer": altar_offer, "purchase": purchase, "deny": deny, "lore-found": lore_found, "hero-unlock": hero_unlock,
    "stage-up": stage_up, "ui-move": ui_move, "ui-confirm": ui_confirm, "ui-back": ui_back, "ui-open": ui_open,
}


def encode(name: str, samples: np.ndarray) -> None:
    pcm = (np.clip(samples, -1, 1) * 32767).astype(np.int16)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / f"{name}.wav"
        wavfile.write(wav, SR, pcm)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "libvorbis", "-q:a", "5", str(OUT / f"{name}.ogg")], check=True)
        # AAC overshoots peaks on deep sounds, so the .m4a copy is encoded 2 dB lower.
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", "volume=-2dB", "-c:a", "aac", "-b:a", "96k", str(OUT / f"{name}.m4a")], check=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    wanted = sys.argv[1:] or list(SOUNDS)
    for name in wanted:
        samples = finish(SOUNDS[name]())
        encode(name, samples)
        print(f"{name:18s} {len(samples) / SR:5.2f}s")


if __name__ == "__main__":
    main()
