#!/usr/bin/env python3
"""
Mandarin Bubble - full songs.

dragon-boat (宫, 128) and spice-road (徵, 132) are the two Jim picked out as
favourites from the loops, so they get developed from 16-bar loops into real
structured pieces. This is a different job from a loop: the point is form, not
repetition.

    0  intro    8   guzheng + bass only. Sparse, no melody, no pulse.
    1  A       16   the loop's material: pipa pulse, bass, pipa lead.
    2  A2      16   + the trem intensity layer.
    3  B       16   bridge, modulating a FIFTH UP (mode index +3) - the 起承转合
                    "转". Counter melody enters; trem drops out for the dip.
    4  A3      16   home key, trem returns, counter doubles, lead range widened.
    5  outro    8   thins to guzheng + bass + a lead cadencing on the tonic.

80 bars total. At 128 bpm that is 2:30; at 132 it is 2:25.

Section generators are reused from variations.py (gen_phrase, pit, FIG) so a full
song still renders from the same seeded RNG and stays reproducible. The layer set
is per-section, which is what makes the form audible.
"""
import random

import compose as C
import variations as V

BPM_BEATS = 4
ROOTS = [0, 0, 3, 3, 4, 4, 2, 2]


def bridge_mode(mode):
    """A fifth up: 宫->徵, 徵->商, 羽->角, and so on. Classic 转 move."""
    i = V.MODE_NAMES.index(mode)
    return V.MODE_NAMES[(i + 3) % 5]


def section_notes(rng, sec, bar0, mode, bpm, notes):
    """Emit one section's notes with a bar offset. Layers are per-section."""
    b, bpb = sec["bars"], BPM_BEATS
    md = sec.get("mode", mode)
    lay = sec["layers"]
    fig = V.FIG[sec["texture"]]
    feel = sec["feel"]
    half = b // 2

    # guzheng broken-chord texture
    if "gz" in lay:
        for bar in range(b):
            gb = bar0 + bar
            octv = 4 if bar < half or sec.get("gz_flat") else 5
            pat = fig[bar % 4]
            for i, deg in enumerate(pat):
                pos = gb * bpb + i * (bpb / 4.0)
                notes.append([pos, 1.1, V.pit(deg, octv, md), "guzheng",
                              74 if i == 0 else 52])

    # pipa pulse + bass
    for bar in range(b):
        gb = bar0 + bar
        r = ROOTS[gb % len(ROOTS)]
        if "pulse" in lay:
            if feel in ("driving", "syncopated"):
                notes.append([gb * bpb, 0.9, V.pit(r, 4, md), "pipa", 74])
                notes.append([gb * bpb + 1.5, 0.4, V.pit(r + 2, 4, md), "pipa", 52])
                notes.append([gb * bpb + 2, 0.9, V.pit(r + 4, 4, md), "pipa", 68])
                notes.append([gb * bpb + bpb - 0.5, 0.4, V.pit(r + 4, 5, md), "pipa", 48])
            else:
                notes.append([gb * bpb, 1.7, V.pit(r, 4, md), "pipa", 70])
                notes.append([gb * bpb + 2, 1.5, V.pit(r + 4, 4, md), "pipa", 56])
                if bar >= half:
                    notes.append([gb * bpb + bpb - 0.5, 0.5,
                                  V.pit(r + 7, 5, md), "pipa", 44])
        if "bass" in lay:
            notes.append([gb * bpb, bpb - 1.0, V.pit(r, 3, md), "bass", 58])

    # lead melody across the whole section
    if "lead" in lay:
        lo, hi = sec.get("range", (0, 7))
        for bt, du, dg, _o, _v in V.gen_phrase(
                rng, bar0, bar0 + b, bpb, md, feel, lo, hi,
                sec.get("lead_oct", 5), 68, ROOTS[bar0 % len(ROOTS)]):
            notes.append([bt, du, V.pit(dg, sec.get("lead_oct", 5), md),
                          sec["lead"], 68])

    # counter melody
    if "counter" in lay:
        co = sec.get("counter_oct", 6)
        for bt, du, dg, _o, _v in V.gen_phrase(
                rng, bar0, bar0 + b, bpb, md, "flowing", 2, 7, co, 48,
                ROOTS[bar0 % len(ROOTS)] + 2):
            notes.append([bt, du, V.pit(dg, co, md), sec["counter"], 48])

    # pipa tremolo - the adaptive "intense" layer. Velocity ramps, because this
    # stem has to be audible when crossfaded in (see variations.py).
    if "trem" in lay:
        peak = sec.get("trem_peak", 92)
        start = sec.get("trem_from", half)
        span = max(1, (b - start) * int(bpb * 2))
        n = 0
        for bar in range(start, b):
            b0 = (bar0 + bar) * bpb
            r = ROOTS[(bar0 + bar) % len(ROOTS)]
            for k in range(int(bpb * 2)):
                ramp = 0.70 + 0.30 * (n / span)
                vel = int(peak * ramp) + (6 if k % 2 == 0 else 0)
                notes.append([b0 + k * 0.5, 0.95, V.pit(r + 4, 5, md),
                              "pipatrem", min(100, vel)])
                n += 1


class Song:
    """A full song: a recipe plus a section form."""

    def __init__(self, name, mode, bpm, feel, texture, lead="pipalead",
                 counter="dizi", lead_oct=5, seed=0, form=None):
        self.name, self.mode, self.bpm = name, mode, bpm
        self.feel, self.texture = feel, texture
        self.lead, self.counter, self.lead_oct = lead, counter, lead_oct
        self.seed = seed
        self.form = form or default_form(mode, feel, texture, lead, counter,
                                         lead_oct)
        self.notes = []
        self.sections = self.form

    def build(self):
        self.notes = []
        rng = random.Random(self.seed)
        bar0 = 0
        for sec in self.form:
            section_notes(rng, sec, bar0, self.mode, self.bpm, self.notes)
            bar0 += sec["bars"]
        if V.DIZI_TRANSPOSE:
            for n in self.notes:
                if n[3] == "dizi":
                    n[2] = max(36, n[2] + V.DIZI_TRANSPOSE)
        self.notes.sort(key=lambda x: (x[0], x[3]))
        return self.notes

    @property
    def total_bars(self):
        return sum(s["bars"] for s in self.form)

    @property
    def seconds(self):
        return self.total_bars * BPM_BEATS * 60.0 / self.bpm

    def stem_groups(self):
        return {"base": ["guzheng", "pipa", "bass"],
                "lead": [self.lead, self.counter],
                "trem": ["pipatrem"]}


def default_form(mode, feel, texture, lead, counter, lead_oct):
    """intro / A / A+trem / B(fifth up) / A+trem+counter / outro."""
    home = dict(feel=feel, texture=texture, lead=lead, counter=counter,
                lead_oct=lead_oct)
    return [
        dict(bars=8, **{**home, "feel": "sparse", "texture": "descend"},
             layers={"gz", "bass"}, gz_flat=True),
        dict(bars=16, **home, layers={"gz", "pulse", "bass", "lead"}),
        dict(bars=16, **home, layers={"gz", "pulse", "bass", "lead", "trem"}),
        dict(bars=16, **{**home, "feel": "flowing", "texture": "rising"},
             mode=bridge_mode(mode),
             layers={"gz", "pulse", "bass", "lead", "counter"}),
        dict(bars=16, **home, layers={"gz", "pulse", "bass", "lead", "counter",
                                      "trem"}, range=(0, 9)),
        dict(bars=8, **{**home, "feel": "sparse", "texture": "descend"},
             layers={"gz", "bass", "lead"}, gz_flat=True),
    ]


SONGS = [
    Song(name="dragon-boat", mode="gong", bpm=128, feel="driving",
         texture="rising", lead="pipalead", counter="dizi", lead_oct=5, seed=45),
    Song(name="spice-road", mode="zhi", bpm=132, feel="driving",
         texture="rising", lead="pipalead", counter="dizi", lead_oct=5, seed=36),
]

# --- the eight remaining keepers (2026-10-05) -------------------------------
# Jim: "Yes, you are good to go." Same 80-bar form as dragon-boat/spice-road,
# recipes copied verbatim from variations.py so these are the loops he graded,
# only expanded.
#
# Sequenced by ASCENDING TEMPO so no two neighbours share a groove, and the two
# 徵 tracks are placed at 108 and 120 to break up the run of 宫. Rendering order
# is this order, so the batch file plays as the album.
#
# NOTE bamboo-grove is the one keeper with dizi on the LEAD (graded "great
# style"), so it needs lead_oct=6 - the global DIZI_TRANSPOSE (-24) then lands it
# at 60-81. lead_oct=5 would drop it to C3.
BATCH = [
    Song(name="bamboo-grove",  mode="gong", bpm=88,  feel="flowing",
         texture="broken", lead="dizi",    counter="pipalead", lead_oct=6, seed=11),
    Song(name="willow-walk",   mode="gong", bpm=90,  feel="flowing",
         texture="broken", lead="pipalead", counter="dizi",    lead_oct=5, seed=41),
    Song(name="lantern-river", mode="gong", bpm=92,  feel="flowing",
         texture="broken", lead="pipalead", counter="dizi",    lead_oct=5, seed=31),
    Song(name="teahouse",      mode="zhi",  bpm=108, feel="driving",
         texture="rising", lead="pipalead", counter="zheng",   lead_oct=5, seed=42),
    Song(name="jasmine-court", mode="gong", bpm=112, feel="driving",
         texture="rising", lead="pipalead", counter="zheng",   lead_oct=5, seed=33),
    Song(name="pagoda-steps",  mode="gong", bpm=116, feel="driving",
         texture="wide",   lead="pipalead", counter="dizi",    lead_oct=5, seed=43),
    Song(name="night-market",  mode="zhi",  bpm=120, feel="driving",
         texture="wide",   lead="pipalead", counter="dizi",    lead_oct=5, seed=12),
    Song(name="firefly-lane",  mode="gong", bpm=132, feel="driving",
         texture="rising", lead="pipalead", counter="dizi",    lead_oct=5, seed=16),
]

SONGS += BATCH


if __name__ == "__main__":
    for s in SONGS:
        n = s.build()
        print(f"{s.name}: {s.total_bars} bars, {s.seconds:.1f}s, {len(n)} notes")
        for i, sec in enumerate(s.form):
            print(f"   section {i}: {sec['bars']:>2} bars  "
                  f"{str(sec.get('mode') or s.mode):<6} {sec['feel']:<8} "
                  f"{sec['texture']:<8} {'+'.join(sorted(sec['layers']))}")