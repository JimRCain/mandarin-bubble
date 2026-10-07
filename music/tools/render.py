#!/usr/bin/env python3
"""
Mandarin Bubble - music renderer.

ONE FluidSynth pass per piece, fonts loaded as [FluidR3_GM, DSK]:
  - the LAST font wins a contested preset (verified: corr 1.000 against the winner,
    -0.139 against the loser), so
  - DSK overrides progs 0-6 (the 民乐 voices AND its percussion), and
  - FluidR3_GM supplies prog 32 (Acoustic Bass), which DSK does not define.

Output: music/<song>.ogg          (ships - pre-rendered, browser never synthesises)
        music/preview/<song>.mp3  (chat preview)
        music/stems/<song>.<group>.{mid,wav}   (adaptive layers)

Asserts the percussion stem is audible: a silent percussion track is easy to ship
without noticing, and this is the check that catches it.
"""
import os, subprocess, wave
import numpy as np
import compose as C

SR = 22050
MUS = C.MUS
FF = "/home/jimarie/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg"
DSK = "/home/jimarie/.hermes/cache/scratch/sf2/DSK Asian DreamZ.SF2"
FLUID = "/usr/share/sounds/sf2/FluidR3_GM.sf2"


def render(mid, out):
    subprocess.run(["fluidsynth", "-ni", "-F", out, "-r", str(SR), "-g", "0.8",
                    "-o", "synth.audio-channels=1", FLUID, DSK, mid],
                   capture_output=True, check=True)
    with wave.open(out) as w:
        n, ch = w.getnframes(), w.getnchannels()
        a = np.frombuffer(w.readframes(n), "<i2").astype(np.float64) / 32768.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    return a


def write_wav(path, a, fade=True):
    if fade:                                  # loop hygiene: kill the wrap click
        n = min(int(0.04 * SR), len(a) // 4)
        a = a.copy()
        a[:n] *= np.linspace(0, 1, n)
        a[-n:] *= np.linspace(1, 0, n)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(np.clip(a * 32767, -32768, 32767).astype("<i2").tobytes())


def encode(wav, out, codec, extra):
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", wav, *codec, *extra, out], check=True)
    return os.path.getsize(out)


def main():
    for d in ("preview", "stems"):
        os.makedirs(f"{MUS}/{d}", exist_ok=True)
    rows, bad = [], []
    for s in C.SONGS:
        notes = s.build()
        full = f"{MUS}/{s.name}.mid"
        C.write_midi(s, notes, full)

        raw = render(full, f"{MUS}/stems/{s.name}.wav")
        # DSK's percussion rings ~30 s past the last note. The file must be EXACTLY the
        # loop length or the loop will not line up, so trim to bars*4 beats.
        loop = int(s.bars * 4 * 60 / s.bpm * SR)
        tail = raw[loop:] if len(raw) > loop else raw[:0]
        a = raw[:loop]
        peak = np.abs(a).max() or 1.0
        norm = a / peak * 0.89                  # normalise, leave headroom
        mixed = f"{MUS}/stems/{s.name}.mix.wav"
        write_wav(mixed, norm)

        ogg = encode(mixed, f"{MUS}/{s.name}.ogg",
                     ["-codec:a", "libvorbis"], ["-q:a", "3", "-ac", "1"])
        mp3 = encode(mixed, f"{MUS}/preview/{s.name}.mp3",
                     ["-codec:a", "libmp3lame"], ["-b:a", "112k", "-ac", "1"])

        stem_rms = {}
        for group, voices in C.STEM_GROUPS.items():
            sm = f"{MUS}/stems/{s.name}.{group}.mid"
            C.write_midi(s, notes, sm, set(voices))
            sa = render(sm, f"{MUS}/stems/{s.name}.{group}.wav")
            stem_rms[group] = float(np.sqrt((sa ** 2).mean()))
        if stem_rms.get("perc", 1) < 0.003:
            bad.append(f"{s.name} ({stem_rms.get('perc', 0):.4f})")

        rows.append((s.name, s.bpm, len(a) / SR, os.path.getsize(full),
                     ogg, mp3, stem_rms, float(np.sqrt((tail ** 2).mean()))))

    print(f"{'song':<18}{'bpm':>4}{'loop':>8}{'MIDI':>8}{'OGG':>9}{'MP3':>10}"
          f"{'tailRMS':>9}   stem RMS base/lead/perc/trem")
    for name, bpm, dur, msz, osz, psz, sr, tl in rows:
        t = "/".join(f"{sr.get(g, 0):.3f}" for g in ("base", "lead", "perc", "trem"))
        print(f"{name:<18}{bpm:>4}{dur:>7.1f}s{msz:>8,}{osz:>9,}{psz:>10,}{tl:>9.4f}   {t}")
    print("\npercussion stem silent for:", ", ".join(bad) if bad else "none - OK")


if __name__ == "__main__":
    main()