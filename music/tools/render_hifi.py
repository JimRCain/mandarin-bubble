#!/usr/bin/env python3
"""
Hi-fi pass over the variation set - the "does better rendering actually help?"
comparison, kept separate from the shipping default so nothing is overwritten
before a decision is made.

Differences from render_variations.py:
  * 44.1 kHz instead of 22.05 kHz (the shipping pass keeps every overtone of the
    reverb tail out at 22 k; the 民乐 samples are bright and notice it)
  * per-instrument panning (CC10) so stereo is real instead of 0.96-correlated
    mono - measured correlation drops 0.965 -> 0.843 with these values
  * FluidSynth reverb + chorus on
  * stereo OGG q4, stereo MP3 160 k for preview

Outputs to loops/hifi/ and preview/hifi/ so the mono set stays intact.
"""
import os
import numpy as np
import mido
import compose as C
import variations as V
import render as R

MUS = C.MUS
SR = 44100
FF = R.FF
DSK = R.DSK
FLUID = R.FLUID

# channel -> pan (0 = hard left, 64 = centre, 127 = hard right).
# Melody panned opposite its accompaniment so the two separate in the ears.
PANS = {0: 56, 1: 80, 2: 88, 3: 44, 4: 96, 5: 64, 6: 64, 7: 40, 8: 88}

REVERB = ("-o", "synth.reverb.active=yes", "-o", "synth.reverb.room-size=0.75",
          "-o", "synth.reverb.level=0.55", "-o", "synth.chorus.active=yes")


def add_pan(src, dst):
    m = mido.MidiFile(src)
    for tr in m.tracks:
        evs = [mido.Message("control_change", channel=ch, control=10, value=v, time=0)
               for ch, v in PANS.items()]
        tr.insert(1, evs[0])
        for e in reversed(evs[1:]):
            tr.insert(2, e)
    m.save(dst)
    return dst


def rend(mid, out, channels=2, extra=()):
    import subprocess, wave
    subprocess.run(["fluidsynth", "-ni", "-F", out, "-r", str(SR), "-g", "0.8",
                    "-o", f"synth.audio-channels={channels}", *extra, FLUID, DSK, mid],
                   capture_output=True, check=True)
    with wave.open(out) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float64) / 32768.0
        nc = w.getnchannels()
    return a.reshape(-1, nc) if nc > 1 else a


def write_wav(path, a):
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(2 if a.ndim > 1 else 1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(np.clip(a * 32767, -32768, 32767).astype("<i2").tobytes())


def encode(wav, out, codec, extra):
    import subprocess
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", wav, *codec, *extra, out], check=True)
    return os.path.getsize(out)


def main():
    for d in ("loops/hifi", "preview/hifi", "loops/hifi/stems"):
        os.makedirs(f"{MUS}/{d}", exist_ok=True)

    rows, medley = [], []
    for pc in V.PIECES:
        notes = pc.build()
        full = f"{MUS}/loops/{pc.name}.mid"
        C.write_midi(pc, notes, full)
        panned = add_pan(full, f"{MUS}/loops/hifi/stems/{pc.name}.panned.mid")

        raw = rend(panned, f"{MUS}/loops/hifi/stems/{pc.name}.wav", 2, REVERB)
        loop = int(pc.bars * pc.beats * 60 / pc.bpm * SR)
        a = raw[:loop]
        peak = np.abs(a).max() or 1.0
        norm = a / peak * 0.89
        # a hard cut at the barline can click mid-reverb-tail; short fade only
        n = min(int(0.03 * SR), len(norm) // 4)
        norm = norm.copy()
        norm[:n] *= np.linspace(0, 1, n)[:, None]
        norm[-n:] *= np.linspace(1, 0, n)[:, None]
        mixed = f"{MUS}/loops/hifi/stems/{pc.name}.mix.wav"
        write_wav(mixed, norm)

        ogg = encode(mixed, f"{MUS}/loops/hifi/{pc.name}.ogg",
                     ["-codec:a", "libvorbis"], ["-q:a", "4", "-ac", "2"])
        mp3 = encode(mixed, f"{MUS}/preview/hifi/{pc.name}.mp3",
                     ["-codec:a", "libmp3lame"], ["-b:a", "160k", "-ac", "2"])

        L, Rr = norm[:, 0], norm[:, 1]
        corr = float(np.corrcoef(L, Rr)[0, 1])
        rows.append((pc.name, pc.bpm, len(a) / SR, ogg, mp3, corr, float(np.abs(norm).max())))
        medley.append(norm)

    gap = np.zeros((int(1.0 * SR), 2))
    flat = [np.zeros((int(0.4 * SR), 2))]
    for a in medley:
        flat.append(a)
        flat.append(gap)
    med = np.concatenate(flat)
    mwav = f"{MUS}/preview/hifi/_medley.wav"
    write_wav(mwav, med)
    mmp3 = encode(mwav, f"{MUS}/preview/hifi/_medley-all-10.mp3",
                  ["-codec:a", "libmp3lame"], ["-b:a", "160k", "-ac", "2"])

    print(f"{'piece':<16}{'bpm':>4}{'loop':>8}{'OGG':>9}{'MP3':>9}{'corr':>7}{'peak':>7}")
    t = 0.4
    print("\ntracklist:")
    for name, bpm, dur, osz, psz, corr, pk in rows:
        print(f"{name:<16}{bpm:>4}{dur:>7.1f}s{osz:>9,}{psz:>9,}{corr:>7.3f}{pk:>7.3f}")
        print(f"                 -> medley @ {int(t//60)}:{int(t%60):02d}")
        t += dur + 1.0
    print(f"\nmedley {len(med)/SR:.1f}s {mmp3:,} B")
    print(f"total 10 loops: {sum(r[3] for r in rows):,} B OGG")


if __name__ == "__main__":
    main()