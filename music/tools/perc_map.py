#!/usr/bin/env python3
"""Reference tone: the 13 DSK percussion sounds in ascending pitch order, so their
roles can be confirmed by ear. Hit N in the file is the Nth note below."""
import os, subprocess, mido
import compose as C

NOTES = [54, 55, 57, 58, 59, 60, 62, 64, 65, 67, 68, 69, 70]
SR, FF = 22050, "/home/jimarie/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg"
DSK = "/home/jimarie/.hermes/cache/scratch/sf2/DSK Asian DreamZ.SF2"
FLUID = "/usr/share/sounds/sf2/FluidR3_GM.sf2"
GAP, DUR = 0.9, 0.5

mid = mido.MidiFile(ticks_per_beat=C.TPB)
tr = mido.MidiTrack(); mid.tracks.append(tr)
tr.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(120)))
tr.append(mido.Message("program_change", channel=0, program=6))
at = 0
for i, n in enumerate(NOTES):
    s = int(i * GAP * C.TPB)
    tr.append(mido.Message("note_on", channel=0, note=n, velocity=105, time=s - at)); at = s
    o = at + int(DUR * C.TPB)
    tr.append(mido.Message("note_off", channel=0, note=n, velocity=0, time=o - at)); at = o

mp = f"{C.MUS}/stems/percussion-map.mid"
wp = f"{C.MUS}/preview/percussion-map.wav"
mp3 = f"{C.MUS}/preview/percussion-map.mp3"
mid.save(mp)
subprocess.run(["fluidsynth", "-ni", "-F", wp, "-r", str(SR), "-g", "0.9",
                "-o", "synth.audio-channels=1", FLUID, DSK, mp], check=True)
subprocess.run([FF, "-y", "-loglevel", "error", "-i", wp,
                "-codec:a", "libmp3lame", "-b:a", "112k", "-ac", "1", mp3], check=True)

print(f"{len(NOTES)} hits, {GAP}s apart -> {mp3} ({os.path.getsize(mp3):,} B)")
for i, n in enumerate(NOTES, 1):
    print(f"  hit {i:>2}  = MIDI {n}")