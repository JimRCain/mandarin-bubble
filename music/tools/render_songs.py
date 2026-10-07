#!/usr/bin/env python3
"""
Render the full songs: MIDI + per-stem MIDI + mp3 preview + ogg game asset.

Same signal chain as the loops (render.py / render_variations.py): one fluidsynth
pass with [FluidR3_GM, DSK] where the last-loaded font wins a contested preset,
trimmed to the exact end of the last bar, peak-normalised to 0.890.
"""
import os
import subprocess
import wave

import numpy as np

import compose as C
import full_song as FS

SR = 22050
# A loop can be cut dead at the barline because it wraps. A full song cannot: the
# final note is still releasing, so trimming at the barline clipped it off mid-
# decay and left the last 0.5s at 0.06-0.08 RMS - an audible chop. Keep the
# release.
TAIL = 2.5
FF = "/home/jimarie/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg"
DSK = "/home/jimarie/.hermes/cache/scratch/sf2/DSK Asian DreamZ.SF2"
FLUID = "/usr/share/sounds/sf2/FluidR3_GM.sf2"
MUS = C.MUS
OUT = f"{MUS}/songs"
TMP = "/home/jimarie/.hermes/cache/scratch/dzfix"

os.makedirs(OUT, exist_ok=True)
os.makedirs(f"{OUT}/stems", exist_ok=True)
os.makedirs(f"{MUS}/preview", exist_ok=True)


def render(midpath, outpath):
    subprocess.run(["fluidsynth", "-ni", "-F", outpath, "-r", str(SR), "-g", "0.8",
                    "-o", "synth.audio-channels=1", FLUID, DSK, midpath],
                   capture_output=True, check=True)
    with wave.open(outpath) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float64) / 32768.0
        if w.getnchannels() > 1:
            a = a.reshape(-1, w.getnchannels()).mean(axis=1)
    return a


def report(name, notes):
    voices = {}
    for _b, _d, p, v, _vel in notes:
        voices.setdefault(v, []).append(p)
    parts = []
    for v in sorted(voices):
        ps = voices[v]
        parts.append(f"{v} {min(ps)}-{max(ps)}")
    return "  ".join(parts)


for s in FS.SONGS:
    notes = s.build()
    mid = f"{OUT}/{s.name}.mid"
    C.write_midi(s, notes, mid)

    # per-stem MIDI so the game can crossfade base/lead/trem independently
    for stem, vs in s.stem_groups().items():
        C.write_midi(s, notes, f"{OUT}/stems/{s.name}.{stem}.mid", set(vs))

    raw = f"{TMP}/{s.name}.full.raw.wav"
    a = render(mid, raw)
    total = int(round((s.seconds + TAIL) * SR))
    a = a[:total]
    pk = float(np.abs(a).max()) or 1.0
    a = a / pk * 0.89

    wav = f"{TMP}/{s.name}.full.wav"
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(np.clip(a * 32767, -32768, 32767).astype("<i2").tobytes())

    mp3 = f"{MUS}/preview/{s.name}.mp3"
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", wav,
                    "-codec:a", "libmp3lame", "-b:a", "112k", "-ac", "1", mp3], check=True)

    ogg = f"{OUT}/{s.name}.ogg"
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", wav,
                    "-codec:a", "libvorbis", "-q:a", "3", "-ac", "1", ogg], check=True)

    print(f"{s.name}: {len(a)/SR:.1f}s  peak {np.abs(a).max():.3f}  "
          f"rms {np.sqrt((a ** 2).mean()):.4f}  {len(notes)} notes")
    print(f"   mp3 {os.path.getsize(mp3):,} B   ogg {os.path.getsize(ogg):,} B")
    print(f"   {report(s.name, notes)}")