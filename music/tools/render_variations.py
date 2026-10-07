#!/usr/bin/env python3
"""
Render the ten variation pieces.

Same rules as render.py: ONE FluidSynth pass, fonts [FluidR3_GM, DSK] so DSK
overrides progs 0-6 and FluidR3 supplies the bass. Trim to the exact barline
(bars * beats * 60/bpm) or the loop will not line up, because DSK's percussion
rings well past the last note.

Also builds one medley MP3 (1.0 s of silence between pieces) so all ten can be
judged in a single listen, and prints a timeline for the tracklist.
"""
import os
import numpy as np
import compose as C
import variations as V
import render as R

MUS = C.MUS
SR = R.SR


def main():
    for d in ("preview", "stems", "loops", "loops/stems"):
        os.makedirs(f"{MUS}/{d}", exist_ok=True)

    rows, medley = [], []
    for pc in V.PIECES:
        notes = pc.build()
        full = f"{MUS}/loops/{pc.name}.mid"
        C.write_midi(pc, notes, full)

        raw = R.render(full, f"{MUS}/loops/stems/{pc.name}.wav")
        loop = int(pc.bars * pc.beats * 60 / pc.bpm * SR)
        tail = raw[loop:] if len(raw) > loop else raw[:0]
        a = raw[:loop]
        peak = np.abs(a).max() or 1.0
        norm = a / peak * 0.89
        mixed = f"{MUS}/loops/stems/{pc.name}.mix.wav"
        R.write_wav(mixed, norm)

        ogg = R.encode(mixed, f"{MUS}/loops/{pc.name}.ogg",
                       ["-codec:a", "libvorbis"], ["-q:a", "3", "-ac", "1"])
        mp3 = R.encode(mixed, f"{MUS}/preview/{pc.name}.mp3",
                       ["-codec:a", "libmp3lame"], ["-b:a", "112k", "-ac", "1"])

        stem_rms = {}
        for group, voices in pc.stem_groups().items():
            sm = f"{MUS}/loops/stems/{pc.name}.{group}.mid"
            C.write_midi(pc, notes, sm, set(voices))
            sa = R.render(sm, f"{MUS}/loops/stems/{pc.name}.{group}.wav")
            stem_rms[group] = float(np.sqrt((sa ** 2).mean()))

        rows.append((pc.name, pc.mode, pc.bpm, pc.beats, pc.bars, len(a) / SR,
                     os.path.getsize(full), ogg, mp3, stem_rms,
                     float(np.sqrt((tail ** 2).mean()))))
        medley.append(norm)

    # ---- medley: 1.0 s of silence between pieces, so it is clear where each ends
    gap = np.zeros(int(1.0 * SR))
    flat = []
    for n, a in enumerate(medley):
        flat.append(gap if n else np.zeros(int(0.4 * SR)))
        flat.append(a)
    flat.append(gap)
    med = np.concatenate(flat)
    mwav = f"{MUS}/loops/stems/_medley.wav"
    R.write_wav(mwav, med, fade=False)
    mmp3 = R.encode(mwav, f"{MUS}/preview/_medley-all-10.mp3",
                    ["-codec:a", "libmp3lame"], ["-b:a", "112k", "-ac", "1"])

    print(f"{'piece':<16}{'mode':<7}{'bpm':>4}{'m':>3}{'bar':>4}{'loop':>8}"
          f"{'MIDI':>7}{'OGG':>8}{'MP3':>8}{'tail':>8}   stem RMS base/lead/perc/trem")
    t = 0.4
    print("\ntracklist:")
    for name, mode, bpm, beats, bars, dur, msz, osz, psz, sr, tl in rows:
        s = "/".join(f"{sr.get(g, 0):.3f}" for g in ("base", "lead", "perc", "trem"))
        print(f"{name:<16}{mode:<7}{bpm:>4}{beats:>3}{bars:>4}{dur:>7.1f}s"
              f"{msz:>7,}{osz:>8,}{psz:>8,}{tl:>8.4f}   {s}")
        m = int(t // 60); sec = int(t % 60)
        print(f"                 -> medley @ {m}:{sec:02d}  ({name})")
        t += dur + 1.0

    print(f"\nmedley: {len(med)/SR:.1f}s, {mmp3:,} B -> "
          f"{MUS}/preview/_medley-all-10.mp3")
    silent = [r[0] for r in rows if r[9].get("perc", 1) < 0.003]
    nope = [r[0] for r in rows if r[9].get("lead", 1) < 0.003]
    print("percussion stem silent for:", ", ".join(silent) if silent else "none - OK")
    print("lead stem silent for:      ", ", ".join(nope) if nope else "none - OK")


if __name__ == "__main__":
    main()