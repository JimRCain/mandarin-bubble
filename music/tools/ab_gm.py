#!/usr/bin/env python3
"""A/B: the same arrangement via General MIDI's *emulated* Asian patches (FluidR3_GM only).
Compared against the DSK Asian DreamZ render, which uses real 民乐 samples."""
import os, wave, subprocess
import numpy as np
import mido
import compose
from render import render_pass, encode, FLUID, MUS, SR

# General MIDI's closest thing to each 民乐 voice - these are Western emulations
GM_EQUIV = {
    "guzheng":  (0, 107),   # Koto
    "pipa":     (1, 106),   # Shamisen
    "pipatrem": (2, 104),   # Sitar
    "erhu":     (3, 110),   # Fiddle
    "dizi":     (4, 77),    # Shakuhachi
    "bass":     (5, 32),    # Acoustic Bass
    "perc":     (9, None),  # GM drum map
}

def write_gm(song, notes, path):
    mid = mido.MidiFile(ticks_per_beat=compose.TPB)
    tr = mido.MidiTrack(); mid.tracks.append(tr)
    tr.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(song.bpm)))
    for ch, prog in sorted({v[0]: v[1] for v in GM_EQUIV.values()}.items()):
        if prog is not None:
            tr.append(mido.Message("program_change", channel=ch, program=prog))
    ev = []
    for beat, dur, pitch, voice, vel in notes:
        ch = GM_EQUIV[voice][0]
        ev.append((int(beat * compose.TPB), "on", pitch, ch, vel))
        ev.append((int((beat + dur) * compose.TPB), "off", pitch, ch, 0))
    ev.sort(key=lambda e: (e[0], e[1] == "on"))
    last = 0
    for tick, kind, pitch, ch, vel in ev:
        tr.append(mido.Message("note_on" if kind == "on" else "note_off",
                               note=pitch, velocity=vel, channel=ch, time=tick - last))
        last = tick
    mid.save(path); return path

song = compose.SONGS[0]
notes = song.build()
mid = write_gm(song, notes, f"{MUS}/stems/{song.name}.gm-emulation.mid")
a = render_pass(mid, f"{MUS}/stems/{song.name}.gm-emulation.wav", FLUID)
a = a / np.abs(a).max() * 0.89
wav = f"{MUS}/stems/{song.name}.gm-emulation-norm.wav"
with wave.open(wav, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((a * 32767).astype("<i2").tobytes())
size = encode(wav, f"{MUS}/preview/{song.name}-GM-emulation.mp3",
              ["-codec:a", "libmp3lame"], ["-b:a", "112k", "-ac", "1"])
print("GM-emulation preview:", f"{size:,}", "B", "->", f"{MUS}/preview/{song.name}-GM-emulation.mp3")

# spectral centroid: a rough proxy for how bright/nasally each version is
def centroid(x):
    X = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return float((X * f).sum() / (X.sum() + 1e-12))

dsk_mix = None
with wave.open(f"{MUS}/stems/{song.name}.mix.wav") as w:
    dsk_mix = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float64) / 32768
print(f"spectral centroid  DSK+GM mix: {centroid(dsk_mix):>7.0f} Hz   GM emulation: {centroid(a):>7.0f} Hz")