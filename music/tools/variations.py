#!/usr/bin/env python3
"""
Mandarin Bubble - variation set.

Ten pieces built to span the design space rather than to be ten good songs: we
want to hear the edges (fast/slow, sparse/driving, all five pentatonic modes,
3/4 vs 4/4 vs 6/8) and then keep the couple that fit the game.

Axes varied per piece:
  mode   - which pentatonic mode the piece is built on. 宫 gong = C D E G A,
           but rotating the tonic through the scale's five degrees gives five
           genuinely different colours (商 D E G A C, 角 E G A C D, 徵 G A C D E,
           羽 A C D E G). This is the single biggest lever on mood.
  bpm    60..132,  meter  4/4 | 3/4 | 6/8,  bars  8 | 12 | 16
  feel   sparse | flowing | driving | syncopated | lilting
  lead   erhu | dizi | pipa        counter  dizi | pipa | guzheng

Every piece keeps the stem layout (base / lead / perc / trem) so any of them can
drive the adaptive crossfade. Melody is generated with a seeded RNG, so a given
piece renders identically every time.
"""
import os
import random
import compose as C

TPB = C.TPB
MUS = C.MUS

MODE_NAMES = ["gong", "shang", "jue", "zhi", "yu"]


def mode_scale(o):
    """Semitone offsets from the tonic for a pentatonic mode whose tonic sits on
    scale-degree o of the 宫 (major-pentatonic) scale."""
    base = C.PENT[o]
    out = []
    for i in range(5):
        v = C.PENT[(o + i) % 5] - base
        if v < 0:
            v += 12
        out.append(v)
    return out


def pit(deg, octv, mode):
    """Pitch for scale-degree `deg` (may run past 5 to continue upward)."""
    o = MODE_NAMES.index(mode) if isinstance(mode, str) else mode
    k, i = divmod(int(deg) % 5 + 5 * (int(deg) // 5), 5)
    return 12 * (octv + 1) + C.PENT[o] + mode_scale(o)[i] + 12 * k


RHYTHM = {
    "sparse":    [[2, 2], [3, 1], [4], [2, 1, 1]],
    "flowing":   [[1, 1, 2], [0.5, 0.5, 1, 2], [2, 1, 1], [1, 0.5, 0.5, 2]],
    "driving":   [[1, 0.5, 0.5, 1, 1], [0.5, 0.5, 1, 1, 1], [1, 1, 0.5, 0.5, 1]],
    "syncopated":[[1.5, 0.5, 1, 1], [0.5, 1, 0.5, 2], [1.5, 0.5, 2], [0.5, 0.5, 1, 0.5, 0.5, 1]],
    "lilting":   [[3], [1, 2], [2, 1], [1.5, 1.5]],
}

# Jim listened to the whole set and asked for the percussion to come out of every
# piece. The layer is off globally; everything is intact, so flip this to True to
# restore it. This also kills the CRASH hits, which used to survive perc="none"
# pieces - that was why incense-clock still had two hits in it.
PERCUSSION = False

# --- Dizi register fix (2026-10-05) -----------------------------------------
# counter_oct=6 (and lead_oct=6 where the dizi takes the lead) wrote every dizi
# part at MIDI 84-108 = C6-C8. That is piccolo territory and ~2 octaves above a
# real dizi, whose idiomatic register is roughly C5-C6 (MIDI 72-84). Jim, hearing
# night-market: "the dizi sounds like it's playing a few octaves too high."
# Applied as a flat shift so it covers the voice whether it is lead or counter.
DIZI_TRANSPOSE = -24

# percussion patterns, as (beat_offset, drum) within one bar
PERC = {
    "none":    [],
    "sparse":  [(0, "KICK"), (2, "TOM_L")],
    "frame":   [(0, "KICK"), (2, "TOM_L"), (1, "WOOD_H"), (3, "WOOD_L")],
    "driving": [(0, "KICK"), (1, "TOM_H"), (2, "KICK"), (3, "TOM_H"),
                (0.5, "WOOD_H"), (2.5, "WOOD_H"), (3.5, "TAMB")],
    "lilting": [(0, "KICK"), (2, "TOM_L"), (1, "WOOD_H")],
}

# texture figure: which scale-degrees, in order, per bar (mod 4)
FIG = {
    "broken":  [[0, 2, 4, 7], [7, 4, 2, 0], [2, 4, 7, 9], [4, 2, 0, 2]],
    "rising":  [[0, 2, 4, 7], [2, 4, 7, 9], [4, 7, 9, 11], [2, 4, 2, 0]],
    "descend": [[9, 7, 4, 2], [7, 4, 2, 0], [4, 2, 0, 2], [2, 0, 2, 4]],
    "wide":    [[0, 7, 2, 9], [4, 0, 7, 4], [2, 9, 4, 0], [7, 4, 9, 2]],
}

DRUMS = {"KICK": C.KICK, "TOM_L": C.TOM_L, "TOM_H": C.TOM_H,
         "WOOD_H": C.WOOD_H, "WOOD_L": C.WOOD_L, "CRASH": C.CRASH, "TAMB": C.TAMB}


def gen_phrase(rng, bar0, bar1, bpb, mode, feel, lo, hi, octv, vel, final_deg):
    """Melody over bars [bar0, bar1). Random walk on scale degrees, pulled back
    toward the middle of the range, cadencing on final_deg."""
    notes = []
    beat, end = bar0 * bpb, bar1 * bpb
    cells = RHYTHM[feel]
    deg = rng.randint(lo, hi)
    centre = (lo + hi) / 2.0
    while beat < end - 1e-6:
        pat = rng.choice(cells)
        for d in pat:
            if beat >= end:
                break
            d = min(d, end - beat)
            notes.append([beat, max(0.2, d * 0.92), deg, octv, vel])
            if deg > centre + 1:
                step = rng.choice([-2, -1, -1, 0, 1])
            elif deg < centre - 1:
                step = rng.choice([-1, 0, 1, 1, 2])
            else:
                step = rng.choice([-2, -1, 0, 1, 2])
            deg = min(hi, max(lo, deg + step))
            beat += d
    if notes:                                  # cadence
        notes[-1][2] = final_deg
        notes[-1][1] = max(1.0, end - notes[-1][0])
    return notes


class Piece:
    def __init__(self, name, mode, bpm, bars, beats=4, feel="flowing",
                 lead="erhu", counter="dizi", texture="broken", perc="frame",
                 roots=None, trem=True, trem_peak=92, seed=0, lead_oct=5,
                 counter_oct=6, range_lo=0, range_hi=7):
        self.name, self.mode, self.bpm, self.bars = name, mode, bpm, bars
        self.beats, self.feel = beats, feel
        self.lead, self.counter = lead, counter
        self.texture, self.perc, self.trem, self.trem_peak = texture, perc, trem, trem_peak
        self.roots = roots or [0, 0, 3, 3, 4, 4, 2, 2]
        self.seed = seed
        self.lead_oct, self.counter_oct = lead_oct, counter_oct
        self.range_lo, self.range_hi = range_lo, range_hi
        self.notes = []

    def add(self, beat, dur, pitch, voice, vel=80):
        self.notes.append([beat, dur, int(pitch), voice, vel])

    def root(self, bar):
        return self.roots[bar % len(self.roots)]

    def build(self):
        # Reset first: build() must be idempotent. Without this, a second call
        # appends on top of the previous notes and re-applies DIZI_TRANSPOSE to
        # them, dropping the dizi another -24 every rebuild.
        self.notes = []
        b, bpb, m = self.bars, self.beats, self.mode
        rng = random.Random(self.seed)
        half, q3 = b // 2, (3 * b) // 4
        fig = FIG[self.texture]

        # --- guzheng: broken-chord texture, octave up in the back half
        for bar in range(b):
            b0 = bar * bpb
            octv = 4 if bar < half else 5
            pat = fig[bar % 4]
            for i, deg in enumerate(pat):
                pos = b0 + i * (bpb / 4.0)
                self.add(pos, 1.1, pit(deg, octv, m), "guzheng",
                         74 if i == 0 else 52)

        # --- pipa pulse + bass, from bar 4 (or bar 2 in an 8-bar piece)
        start = 4 if b >= 12 else 2
        for bar in range(start, b):
            b0, r = bar * bpb, self.root(bar)
            if self.feel in ("driving", "syncopated"):
                self.add(b0, 0.9, pit(r, 4, m), "pipa", 74)
                self.add(b0 + 1.5, 0.4, pit(r + 2, 4, m), "pipa", 52)
                self.add(b0 + 2, 0.9, pit(r + 4, 4, m), "pipa", 68)
                self.add(b0 + bpb - 0.5, 0.4, pit(r + 4, 5, m), "pipa", 48)
            else:
                self.add(b0, 1.7, pit(r, 4, m), "pipa", 70)
                self.add(b0 + 2, 1.5, pit(r + 4, 4, m), "pipa", 56)
                if bar >= half:
                    self.add(b0 + bpb - 0.5, 0.5, pit(r + 7, 5, m), "pipa", 44)
            self.add(b0, bpb - 1.0, pit(r, 3, m), "bass", 58)

        # --- percussion (skipped entirely when PERCUSSION is False, crashes included)
        for bar in range(start, b) if PERCUSSION else []:
            b0 = bar * bpb
            for off, drum in PERC[self.perc]:
                if off >= bpb:
                    continue
                vel = 86 if drum == "KICK" else (52 if drum.startswith("WOOD") else 62)
                if bar < half:
                    vel -= 14
                self.add(b0 + off, 0.4, DRUMS[drum], "perc", vel)
            if bar == start or bar == half:
                self.add(b0, 0.5, DRUMS["CRASH"], "perc", 48)

        # --- lead melody over the back half (whole piece in short ones)
        lo = self.range_lo
        hi = self.range_hi
        mid = (lo + hi) // 2
        lead_from = half if b >= 12 else start
        self.notes.extend(
            [[bt, du, pit(dg, self.lead_oct, m), self.lead, 68]
             for bt, du, dg, _, _ in gen_phrase(
                 rng, lead_from, b, bpb, m, self.feel, lo, hi,
                 self.lead_oct, 68, self.root(0))])

        # --- counter-melody for the last quarter
        self.notes.extend(
            [[bt, du, pit(dg, self.counter_oct, m), self.counter, 48]
             for bt, du, dg, _, _ in gen_phrase(
                 rng, q3, b, bpb, m, "flowing", mid, hi,
                 self.counter_oct, 48, self.root(0) + 2)])

        # --- pipa tremolo: the intensity layer for the last quarter.
        # Velocity ramps to trem_peak because this stem IS the adaptive "intense"
        # setting. Written at a flat low velocity it measured RMS 0.003 against a
        # 0.019 base, so crossfading it in changed nothing audible. Durations
        # overlap so the tremolo swells instead of machine-gunning.
        if self.trem:
            span = max(1, (b - q3) * int(bpb * 2))
            n = 0
            for bar in range(q3, b):
                b0 = bar * bpb
                for k in range(int(bpb * 2)):
                    ramp = 0.70 + 0.30 * (n / span)
                    vel = int(self.trem_peak * ramp) + (6 if k % 2 == 0 else 0)
                    self.add(b0 + k * 0.5, 0.95, pit(self.root(bar) + 4, 5, m),
                             "pipatrem", min(100, vel))
                    n += 1

        # --- dizi register fix (see DIZI_TRANSPOSE at top)
        if DIZI_TRANSPOSE:
            for n in self.notes:
                if n[3] == "dizi":
                    n[2] = max(36, n[2] + DIZI_TRANSPOSE)

        self.notes.sort(key=lambda x: (x[0], x[3]))
        return self.notes

    def stem_groups(self):
        """Adaptive layers. Lead and counter sit on their own channels (see VOICES in
        compose.py) so the melody never merges into the texture or pulse stem."""
        g = {
            "base": ["guzheng", "pipa", "bass"],
            "lead": [self.lead, self.counter],
            "trem": ["pipatrem"],
        }
        if PERCUSSION:
            g["perc"] = ["perc"]
        return g


PIECES = [
    Piece("bamboo-grove",  mode="gong",  bpm=88,  bars=16, feel="flowing",
          lead="dizi",     counter="pipalead", texture="broken",  perc="frame",   lead_oct=6, seed=11),
    Piece("night-market",  mode="zhi",   bpm=120, bars=16, feel="driving",
          lead="pipalead", counter="dizi",     texture="wide",    perc="driving", lead_oct=5, seed=12),
    Piece("tea-terrace",   mode="shang", bpm=72,  bars=16, feel="sparse",
          lead="erhu",     counter="dizi",     texture="rising",  perc="sparse",  lead_oct=5, seed=13),
    Piece("river-ferry",   mode="yu",    bpm=96,  bars=16, feel="flowing",      beats=3,
          lead="dizi",     counter="pipalead", texture="broken",  perc="frame",   lead_oct=6, seed=14),
    Piece("incense-clock", mode="jue",   bpm=60,  bars=12, feel="sparse",
          lead="zheng",    counter="dizi",     texture="descend", perc="none",    lead_oct=5, seed=15, trem_peak=68),
    Piece("firefly-lane",  mode="gong",  bpm=132, bars=16, feel="driving",
          lead="pipalead", counter="dizi",     texture="rising",  perc="driving", lead_oct=5, seed=16),
    Piece("rain-on-tiles", mode="yu",    bpm=68,  bars=16, feel="flowing",
          lead="erhu",     counter="zheng",    texture="wide",    perc="sparse",  lead_oct=5, seed=17),
    Piece("market-morning", mode="zhi",  bpm=104, bars=16, feel="lilting",      beats=3,
          lead="dizi",     counter="pipalead", texture="broken",  perc="lilting", lead_oct=6, seed=18),
    Piece("elephant-trail", mode="shang", bpm=84, bars=12, feel="syncopated",
          lead="erhu",     counter="pipalead", texture="wide",    perc="frame",   lead_oct=5, seed=19),
    Piece("starlit-pool",  mode="jue",   bpm=64,  bars=16, feel="flowing",
          lead="zheng",    counter="dizi",     texture="descend", perc="sparse",  lead_oct=5, seed=20, trem_peak=68),
]

# --- "Jim's lane" batch (2026-10-05) ----------------------------------------
# He picked bamboo-grove / night-market / firefly-lane out of the ten as "great
# style", and those three share bright mode (宫/徵) + 4/4 + 88-132 bpm. The ten
# were built to span all five modes, three meters and 60-132 bpm on purpose, so
# half of them sat outside this lane. These six stay inside it: bright modes
# only, 4/4 only, nothing under 88 bpm. Variation comes from tempo, texture,
# lead voice and seed instead of from mode/meter quota.
# NOTE: where dizi takes the LEAD it needs lead_oct=6, because the global
# DIZI_TRANSPOSE (-24) then lands it at 60-81; lead_oct=5 would drop it to C3.
PIECES += [
    Piece("lantern-river",  mode="gong", bpm=92,  bars=16, feel="flowing",
          lead="pipalead", counter="dizi",     texture="broken", perc="none", lead_oct=5, seed=31),
    Piece("stone-lane",     mode="zhi",  bpm=100, bars=16, feel="driving",
          lead="erhu",     counter="dizi",     texture="wide",   perc="none", lead_oct=5, seed=32),
    Piece("jasmine-court",  mode="gong", bpm=112, bars=16, feel="driving",
          lead="pipalead", counter="zheng",    texture="rising", perc="none", lead_oct=5, seed=33),
    Piece("bell-tower",     mode="zhi",  bpm=124, bars=16, feel="flowing",
          lead="dizi",     counter="pipalead", texture="broken", perc="none", lead_oct=6, seed=34),
    Piece("courtyard-rain", mode="gong", bpm=96,  bars=16, feel="driving",
          lead="zheng",    counter="dizi",     texture="wide",   perc="none", lead_oct=5, seed=35),
    Piece("spice-road",     mode="zhi",  bpm=132, bars=16, feel="driving",
          lead="pipalead", counter="dizi",     texture="rising", perc="none", lead_oct=5, seed=36),
]

# --- batch 2, written to the pipa-lead rule (2026-10-05) --------------------
# Jim graded batch 1: lantern-river good, jasmine-court good, spice-road fun,
# courtyard-rain ok, stone-lane meh, bell-tower busy. Every piece with pipa on
# the LEAD scored top (5/5 across both batches); every other lead scored lower
# (erhu meh, zheng ok, dizi good/busy). This is timbre, not melody: gen_phrase()
# never receives the voice name, so swapping instruments yields an identical
# contour.
# Rule: pipalead on the lead, dizi or zheng (never pipalead) on the counter.
# Density is NOT the issue - the two densest pieces in the set are both favourites.
#
# CORRECTION: an earlier note here claimed bell-tower was "busy" because it had
# pipa on the lead AND the counter. That is wrong - bell-tower's lead is dizi
# (see above), the same voice layout as bamboo-grove, which was graded "great
# style". Both put dizi on the lead and pipalead on the counter. So the doubled-
# pipa explanation does not hold, and the real difference is 88bpm flowing vs
# 124bpm flowing over a broken texture: at that tempo the broken figure plus a
# fast melody reads as clutter. Do not repeat the doubled-pipa claim.
PIECES += [
    Piece("willow-walk",   mode="gong", bpm=90,  bars=16, feel="flowing",
          lead="pipalead", counter="dizi",  texture="broken", perc="none", lead_oct=5, seed=41),
    Piece("teahouse",      mode="zhi",  bpm=108, bars=16, feel="driving",
          lead="pipalead", counter="zheng", texture="rising", perc="none", lead_oct=5, seed=42),
    Piece("pagoda-steps",  mode="gong", bpm=116, bars=16, feel="driving",
          lead="pipalead", counter="dizi",  texture="wide",   perc="none", lead_oct=5, seed=43),
    Piece("lotus-pond",    mode="zhi",  bpm=118, bars=16, feel="flowing",
          lead="pipalead", counter="zheng", texture="broken", perc="none", lead_oct=5, seed=44),
    Piece("dragon-boat",   mode="gong", bpm=128, bars=16, feel="driving",
          lead="pipalead", counter="dizi",  texture="rising", perc="none", lead_oct=5, seed=45),
    Piece("opera-mask",    mode="zhi",  bpm=130, bars=16, feel="driving",
          lead="pipalead", counter="dizi",  texture="wide",   perc="none", lead_oct=5, seed=46),
]

# --- the 二泉映月 lane (2026-10-05, Marie's suggestion) ----------------------
# Marie suggested 二泉映月 (Abing's "Moon Reflected on Second Spring", 1950):
# slow, low, sparse erhu with sighing downward phrases. This is the opposite of
# Jim's bright-pipa lane, so treat these as a deliberate exception, not the new
# default - Jim has graded every slow/sparse piece below his mid-tempo ones.
# What makes it that idiom, as far as the engine can reach:
#   - erhu on the LEAD at lead_oct=4 (60-81). Everything else uses lead_oct=5;
#     the low register is most of the sorrow.
#   - 52-60 bpm, sparse feel, descend/broken texture, quiet counter.
# NOT yet attempted: the slides (滑音) and vibrato that carry most of the real
# expression. MIDI needs pitchwheel events for that - render.py does not emit
# them. That is the next lever if these land.
TWO_SPRING = [
    Piece("moon-well",   mode="zhi",  bpm=56, bars=12, feel="sparse",
          lead="erhu", counter="dizi",    texture="descend", perc="none", lead_oct=4, seed=51),
    Piece("still-water", mode="yu",   bpm=52, bars=12, feel="sparse",
          lead="erhu", counter="guzheng", texture="broken",  perc="none", lead_oct=4, seed=52),
    Piece("deep-spring", mode="shang",bpm=60, bars=12, feel="flowing",
          lead="erhu", counter="dizi",    texture="descend", perc="none", lead_oct=4, seed=53),
]
PIECES += TWO_SPRING

if __name__ == "__main__":
    for pc in PIECES:
        notes = pc.build()
        full = C.write_midi(pc, notes, f"{MUS}/loops/{pc.name}.mid")
        for group, voices in pc.stem_groups().items():
            C.write_midi(pc, notes, f"{MUS}/loops/stems/{pc.name}.{group}.mid",
                         set(voices))
        counts = {}
        for n in notes:
            counts[n[3]] = counts.get(n[3], 0) + 1
        lay = " ".join(f"{k}={v}" for k, v in sorted(counts.items()))
        print(f"{pc.name:<15} {pc.mode:<6}{pc.bpm:>4}bpm {pc.bars:>2}bar "
              f"{pc.beats}/4 {pc.feel:<10}{len(notes):>4}notes "
              f"{os.path.getsize(full):>5,}B  {lay}")