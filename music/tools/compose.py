#!/usr/bin/env python3
"""
Mandarin Bubble - music composer.
Writes MIDI (the source of truth) for each song in SONGS.

Voices, by channel, all rendered in ONE FluidSynth pass:

  DSK Asian DreamZ (real 民乐 samples)   bank0 prog 3 GUZHEN | 0 PIPA | 1 PIPA TREM | 4 ERHU | 5 BAN-DI
  DSK percussion                         bank0 prog 6, notes 54-70  (13 sounds)
  FluidR3_GM                             prog 32 Acoustic Bass   (DSK defines only progs 0-6)

Fonts are loaded as [FluidR3_GM.sf2, DSK...SF2] and the LAST font wins a contested
preset (verified: corr 1.000 against the winner, -0.139 against the loser). So DSK
overrides progs 0-6 and GM supplies everything else. No two-pass mix is needed.

Percussion map comes from probe_p6.py: bank0 prog 6 sounds on exactly 13 notes,
MIDI 54-70. Their roles below are guessed by pitch order, not by ear - confirm
against preview/percussion-map.mp3 before finalising.
"""
import os
import mido

TPB = 480
MUS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# channel -> (font, program)   font in {"dsk","gm"}
VOICES = {
    "guzheng":  (0, "dsk", 3),
    "pipa":     (1, "dsk", 0),
    "pipatrem": (2, "dsk", 1),
    "erhu":     (3, "dsk", 4),
    "dizi":     (4, "dsk", 5),
    "perc":     (5, "dsk", 6),
    "bass":     (6, "gm", 32),
    # Dedicated lead channels: same DSK programs, separate channels. Without
    # these a melody written for guzheng or pipa lands on the same channel as the
    # texture/pulse, and the adaptive stems can no longer separate melody from
    # accompaniment - the whole point of the layer split.
    "zheng":    (7, "dsk", 3),
    "pipalead": (8, "dsk", 0),
}
PENT = [0, 2, 4, 7, 9]               # 宫商角徵羽  C D E G A

def p(deg, octv=4):
    o, i = divmod(deg, 5)
    return 12 * (octv + 1) + PENT[i] + 12 * o

# Jim asked for the percussion out of everything he heard, so it is off everywhere.
# Set PERCUSSION=True to bring it back; the pattern below is untouched.
PERCUSSION = False

# --- Dizi register fix (2026-10-05) -----------------------------------------
# The dizi phrases were written at octv=6 with degrees running to 16, putting the
# line at MIDI 105-122 (A7-D9) - above the top of a piano and far above a dizi.
# Jim, hearing night-market: "the dizi sounds like it's playing a few octaves too
# high." Idiomatic dizi register is roughly MIDI 62-86, so shift the voice down
# three octaves; the phrase's arch shape is preserved.
DIZI_TRANSPOSE = -36

# DSK bank0 prog 6 percussion, ascending - roles guessed by position
KICK, TOM_L, TOM_H, WOOD_H, WOOD_L, CRASH, TAMB = 54, 62, 59, 64, 65, 67, 69

# Stem groups for adaptive playback: the game crossfades these.
STEM_GROUPS = {
    "base": ["guzheng", "pipa", "bass"],   # always playing
    "lead": ["erhu", "dizi"],              # enters with progress
    "trem": ["pipatrem"],                  # intensity layer
}


class Song:
    def __init__(self, name, bpm, bars, roots, phrases, perc_style="frame"):
        self.name, self.bpm, self.bars = name, bpm, bars
        self.roots, self.phrases, self.perc_style = roots, phrases, perc_style
        self.notes = []

    def add(self, beat, dur, pitch, voice, vel=80):
        self.notes.append([beat, dur, int(pitch), voice, vel])

    def build(self):
        # Reset first: see the note in variations.py - a second build() would
        # otherwise re-apply DIZI_TRANSPOSE to the previous run's notes.
        self.notes = []
        b = self.bars
        # --- guzheng: broken-chord texture throughout, denser in the back half
        fig = [[0, 2, 4, 7], [7, 4, 2, 0], [2, 4, 7, 9], [4, 2, 0, 2]]
        for bar in range(b):
            b0, octv = bar * 4, (4 if bar < b // 2 else 5)
            for i, deg in enumerate(fig[bar % 4]):
                for half in (0, 0.5):
                    if bar < 2 and half:
                        continue
                    self.add(b0 + i + half, 1.2, p(deg, octv), "guzheng", 72 if half == 0 else 50)
        # --- pipa: low pulse from bar 5
        for bar in range(4, b):
            r, b0 = self.roots[bar % len(self.roots)], bar * 4
            self.add(b0, 1.7, r, "pipa", 70)
            self.add(b0 + 2, 1.5, r + 7, "pipa", 56)
            if bar >= b // 2:
                self.add(b0 + 3.5, 0.5, r + 12, "pipa", 44)
        # --- bass: sparse, from bar 5
        for bar in range(4, b):
            r, b0 = self.roots[bar % len(self.roots)], bar * 4
            self.add(b0, 3.0, r - 12, "bass", 58)
        # --- percussion: frame-drum feel, no backbeat (skipped when PERCUSSION is False)
        for bar in range(4, b) if PERCUSSION else []:
            b0 = bar * 4
            self.add(b0, 0.5, KICK, "perc", 88)
            self.add(b0 + 2, 0.5, TOM_L, "perc", 60)
            if bar == 4 or bar == b // 2:
                self.add(b0, 0.5, CRASH, "perc", 46)
            if bar >= b // 2:
                self.add(b0 + 1, 0.25, WOOD_H, "perc", 44)
                self.add(b0 + 3, 0.25, WOOD_L, "perc", 40)
                self.add(b0 + 3.5, 0.25, TAMB, "perc", 34)
        # --- hand-written phrases
        for voice, phrase, octv, vel in self.phrases:
            for beat, dur, deg in phrase:
                if beat < b * 4:
                    self.add(beat, dur, p(deg, octv), voice, vel)
        # --- dizi register fix (see DIZI_TRANSPOSE at top)
        if DIZI_TRANSPOSE:
            for n in self.notes:
                if n[3] == "dizi":
                    n[2] = max(36, n[2] + DIZI_TRANSPOSE)
        # --- pipa tremolo intensity layer, last quarter
        for bar in range(int(b * 0.75), b):
            b0 = bar * 4
            for k in range(8):
                self.add(b0 + k * 0.5, 0.5, p(7, 5), "pipatrem", 34 + (4 if k % 2 == 0 else 0))
        self.notes.sort(key=lambda x: (x[0], x[3]))
        return self.notes


#                bar:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
DAWN_ROOTS = [45, 45, 41, 41, 43, 43, 45, 45, 41, 41, 43, 43, 45, 45, 41, 41]
DAWN_ERHU = [(32, 1.5, 2), (33.5, 0.5, 4), (34, 1.0, 7), (35, 2.0, 4),
             (37, 1.5, 2), (38.5, 0.5, 0), (39, 1.0, 2), (40, 2.0, 7),
             (44, 1.0, 9), (45, 1.0, 7), (46, 2.0, 4), (48, 2.0, 2),
             (52, 1.5, 7), (53.5, 0.5, 9), (54, 1.0, 11), (55, 2.0, 9),
             (57, 1.0, 7), (58, 1.0, 4), (59, 2.0, 2), (61, 1.5, 0), (62.5, 1.5, 2)]
DAWN_DIZI = [(48, 1.0, 14), (49, 1.0, 12), (50, 2.0, 9), (52, 2.0, 12),
             (56, 1.5, 14), (57.5, 0.5, 12), (58, 1.0, 11), (59, 2.0, 9),
             (61, 2.0, 12), (63, 2.0, 14)]

# slow piece: long erhu lines, wide gaps - the "mist" theme
MIST_ROOTS = [45, 45, 43, 43, 41, 41, 45, 45, 43, 43, 41, 41, 45, 45, 43, 41]
MIST_ERHU = [(16, 3.0, 0), (19.5, 0.5, 2), (20, 3.5, 4), (24, 3.0, 2), (27.5, 0.5, 0),
             (28, 4.0, 9), (36, 3.0, 7), (39.5, 0.5, 4), (40, 3.5, 2), (44, 3.0, 0),
             (47, 1.0, 2), (48, 4.0, 4), (52, 2.5, 7), (55, 4.5, 9), (60, 4.0, 2)]
MIST_DIZI = [(52, 2.0, 12), (54, 2.0, 14), (56, 3.0, 12), (60, 4.0, 9)]

# brighter, more rhythmic - lanterns at dusk
LANTERN_ROOTS = [48, 48, 43, 43, 45, 45, 41, 41, 48, 48, 43, 43, 45, 45, 41, 41]
LANTERN_ERHU = [(16, 1.0, 7), (17, 1.0, 9), (18, 2.0, 11), (20, 2.0, 9), (22, 2.0, 7),
                (24, 1.0, 4), (25, 1.0, 7), (26, 2.0, 9), (28, 2.0, 4), (30, 2.0, 2),
                (32, 1.0, 9), (33, 1.0, 11), (34, 2.0, 14), (36, 2.0, 11), (38, 2.0, 9),
                (40, 1.0, 7), (41, 1.0, 4), (42, 2.0, 7), (44, 2.0, 9), (46, 1.0, 11),
                (47, 1.0, 9), (48, 4.0, 7), (52, 2.0, 11), (55, 1.0, 9), (56, 4.0, 7),
                (60, 3.5, 4)]
LANTERN_DIZI = [(52, 1.0, 14), (53, 1.0, 16), (54, 2.0, 14), (56, 2.0, 12),
                (58, 2.0, 14), (60, 2.0, 11), (62, 2.0, 9)]

SONGS = [
    Song("jinghong-dawn", 92, 16, DAWN_ROOTS,
         [("erhu", DAWN_ERHU, 5, 68), ("dizi", DAWN_DIZI, 6, 52)]),
    Song("lanterns", 76, 16, LANTERN_ROOTS,
         [("erhu", LANTERN_ERHU, 5, 66), ("dizi", LANTERN_DIZI, 6, 50)]),
    Song("mist-on-the-river", 66, 16, MIST_ROOTS,
         [("erhu", MIST_ERHU, 5, 64), ("dizi", MIST_DIZI, 6, 46)], perc_style="sparse"),
]


def write_midi(song, notes, path, only=None):
    """only=None -> every voice. only=set of voice names -> just those (a stem)."""
    mid = mido.MidiFile(ticks_per_beat=TPB)
    tr = mido.MidiTrack(); mid.tracks.append(tr)
    tr.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(song.bpm)))
    tr.append(mido.MetaMessage("track_name", name=song.name))
    ev = []
    for beat, dur, pitch, voice, vel in notes:
        if only is not None and voice not in only:
            continue
        ch = VOICES[voice][0]
        ev.append((int(beat * TPB), "on", pitch, ch, vel))
        ev.append((int((beat + dur) * TPB), "off", pitch, ch, 0))
    # one program_change per channel actually used, before anything else
    for ch in sorted({e[3] for e in ev}):
        prog = next(p for _, (c, _, p) in VOICES.items() if c == ch)
        tr.append(mido.Message("program_change", channel=ch, program=prog))
    ev.sort(key=lambda e: (e[0], e[1] == "on"))
    last = 0
    for tick, kind, pitch, ch, vel in ev:
        tr.append(mido.Message("note_on" if kind == "on" else "note_off",
                               note=pitch, velocity=vel, channel=ch, time=tick - last))
        last = tick
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mid.save(path)
    return path


if __name__ == "__main__":
    for s in SONGS:
        notes = s.build()
        full = write_midi(s, notes, f"{MUS}/{s.name}.mid")
        for group, voices in STEM_GROUPS.items():
            write_midi(s, notes, f"{MUS}/stems/{s.name}.{group}.mid", set(voices))
        layers = {}
        for n in notes:
            layers[n[3]] = layers.get(n[3], 0) + 1
        L = " ".join(f"{k}={v}" for k, v in sorted(layers.items()))
        print(f"{s.name:<18} {s.bpm:>3}bpm  {s.bars} bars  {len(notes):>3} notes  "
              f"{os.path.getsize(full):>5,}B  {L}")