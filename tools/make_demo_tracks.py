#!/usr/bin/env python3
"""生成两首无版权演示音轨（纯标准库合成），输出 WAV 到 music/。
之后可用 ffmpeg 转 mp3。"""
import math
import random
import struct
import wave
from pathlib import Path

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "music"
OUT.mkdir(exist_ok=True)
random.seed(26)


def midi(n: float) -> float:
    return 440.0 * 2 ** ((n - 69) / 12)


class Song:
    def __init__(self, dur: float):
        self.n = int(SR * dur)
        self.buf = [0.0] * self.n

    def add(self, t0: float, gen, dur: float, gain: float = 1.0):
        i0 = int(t0 * SR)
        m = int(dur * SR)
        for i in range(m):
            j = i0 + i
            if 0 <= j < self.n:
                self.buf[j] += gen(i / SR) * gain

    def write(self, path: Path, gain: float = 0.9):
        peak = max(1e-9, max(abs(v) for v in self.buf))
        k = gain / peak
        fade_in, fade_out = int(0.05 * SR), int(1.6 * SR)
        with wave.open(str(path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            frames = bytearray()
            for i, v in enumerate(self.buf):
                env = 1.0
                if i < fade_in:
                    env = i / fade_in
                if i > self.n - fade_out:
                    env = max(0.0, (self.n - i) / fade_out)
                s = int(max(-1, min(1, v * k * env)) * 32767)
                frames += struct.pack("<h", s)
            w.writeframes(bytes(frames))
        print("写出", path.name)


def adsr(t, a, d, s, r, dur):
    if t < a:
        return t / a
    if t < a + d:
        return 1 - (1 - s) * (t - a) / d
    if t < dur - r:
        return s
    return max(0.0, s * (dur - t) / r)


def saw(f, t):
    # 带限锯齿（叠加谐波，幅度滚降近似低通）
    v = 0.0
    h = 1
    while f * h < 6500 and h <= 10:
        v += math.sin(2 * math.pi * f * h * t) / (h ** 1.35)
        h += 1
    return v * 0.5


def epiano(f, t):
    return (
        math.sin(2 * math.pi * f * t)
        + 0.42 * math.sin(2 * math.pi * f * 2 * t)
        + 0.18 * math.sin(2 * math.pi * f * 4.02 * t)
    ) * (0.7 + 0.3 * math.sin(2 * math.pi * 4.2 * t))


def kick(t):
    f = 120 * math.exp(-t * 22) + 44
    return math.sin(2 * math.pi * f * t) * math.exp(-t * 9)


def hat(t):
    return (random.random() * 2 - 1) * math.exp(-t * 55) * 0.6


def snare(t):
    return ((random.random() * 2 - 1) * 0.7 + math.sin(2 * math.pi * 190 * t) * 0.4) * math.exp(-t * 16)


def bass_note(f):
    def g(t):
        return math.tanh(1.6 * saw(f, t)) * adsr(t, 0.006, 0.1, 0.65, 0.12, 0.44)
    return g


def pad_chord(freqs, dur):
    def g(t):
        v = sum(saw(f, t + 0.013 * i) for i, f in enumerate(freqs)) / len(freqs)
        return v * adsr(t, 0.5, 0.6, 0.8, 1.2, dur)
    return g


def ep_chord(freqs, dur):
    def g(t):
        v = sum(epiano(f, t) for f in freqs) / len(freqs)
        return v * adsr(t, 0.012, 0.5, 0.5, 0.6, dur)
    return g


def arp_note(f, dur):
    def g(t):
        return math.sin(2 * math.pi * f * t + 0.6 * math.sin(2 * math.pi * f * 2 * t)) * adsr(
            t, 0.004, 0.1, 0.4, 0.1, dur
        )
    return g


def track_neon_drive():
    bpm = 108
    beat = 60 / bpm
    bars = 16
    song = Song(bars * 4 * beat + 2)
    # Am7 F△7 C△7 G(add9)
    prog = [
        [57, 60, 64, 67],
        [53, 57, 60, 65],
        [48, 52, 55, 64],
        [55, 59, 62, 66],
    ]
    roots = [45, 41, 36, 43]
    for bar in range(bars):
        t0 = bar * 4 * beat
        ch = prog[bar % 4]
        rt = roots[bar % 4]
        song.add(t0, pad_chord([midi(n) for n in ch], 4 * beat), 4 * beat, 0.34)
        for b in range(4):
            song.add(t0 + b * beat, kick, 0.4, 0.85)
            song.add(t0 + (b + 0.5) * beat, hat, 0.1, 0.5)
            if b in (1, 3):
                song.add(t0 + b * beat, snare, 0.3, 0.4 if bar > 1 else 0.0)
        for i in range(8):
            song.add(t0 + i * beat / 2, bass_note(midi(rt if i % 4 != 3 else rt + 7)), 0.42, 0.5)
        if bar >= 4:
            seq = [ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[3] + 12, ch[2] + 24, ch[1] + 12, ch[3] + 12, ch[2] + 12]
            for i, n in enumerate(seq):
                song.add(t0 + i * beat / 2, arp_note(midi(n), beat / 2), beat / 2, 0.16)
    song.write(OUT / "neon-drive.wav")


def track_paper_moon():
    bpm = 82
    beat = 60 / bpm
    bars = 12
    song = Song(bars * 4 * beat + 2)
    # F△7 Em7 Dm7 C△7
    prog = [
        [53, 57, 60, 64],
        [52, 55, 59, 62],
        [50, 53, 57, 60],
        [48, 52, 55, 59],
    ]
    roots = [41, 40, 38, 36]
    for bar in range(bars):
        t0 = bar * 4 * beat
        ch = prog[bar % 4]
        song.add(t0, ep_chord([midi(n) for n in ch], 4 * beat), 4 * beat, 0.42)
        song.add(t0 + 2 * beat, ep_chord([midi(n) for n in ch], 2 * beat), 2 * beat, 0.2)
        song.add(t0, bass_note(midi(roots[bar % 4])), 0.9, 0.4)
        song.add(t0 + 2.5 * beat, bass_note(midi(roots[bar % 4] + 7)), 0.6, 0.3)
        for b in range(4):
            song.add(t0 + (b + 0.5) * beat, hat, 0.08, 0.22)
        if bar % 2 == 1:
            mel = [ch[3] + 12, ch[2] + 12, ch[1] + 12, ch[0] + 12]
            for i, n in enumerate(mel):
                song.add(t0 + i * beat, arp_note(midi(n), beat * 0.9), beat, 0.14)
    song.write(OUT / "paper-moon.wav")


if __name__ == "__main__":
    track_neon_drive()
    track_paper_moon()
