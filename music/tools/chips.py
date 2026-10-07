#!/usr/bin/env python3
"""Chiptune composer: C64/SID and Amiga/tracker-style pieces.

One note list drives both the MIDI file and the audio render, so the audio
always matches its source (skill rule: never two note sources).

Why a bespoke synth instead of fluidsynth + GM here: a GM soundfont is a
sample library. Its "square lead" carries chorus/reverb and its drum kit is a
recorded kit, both of which destroy the 8-bit illusion. So the MIDI is genuine
and playable, and the render is a chip synth written against the same notes:

  lead   square, duty 0.5     (SID pulse)
  arp    pulse,  duty 0.25    (thinner, sits behind the lead)
  bass   saw                  (SID saw / Amiga saw bass)
  stab   saw, short           (Amiga chord stabs)
  perc   LFSR noise + pitch-swept sine, synthesised, never sampled

Verified numerically before delivery: peak, RMS, spectral centroid (a square
wave must read bright), and silence checks.
"""
import math
import os
import subprocess
import sys
import wave

import numpy as np

SR = 44100
TPB = 480
MUS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_MID = os.path.join(MUS, "chip")
FFMPEG = "/home/jimarie/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg"
GM_FONT = "/usr/share/sounds/sf2/FluidR3_GM.sf2"

NAT = [0, 2, 3, 5, 7, 8, 10]   # natural minor
HARM = [0, 2, 3, 5, 7, 8, 11]  # harmonic minor (G# for the V chord)

# voice -> (channel, waveform, GM program for the MIDI file)
VOICES = {
    "lead": (0, "square", 80),   # GM 81 Lead 2 (sawtooth)... see note below
    "arp":  (1, "pulse",  80),   # GM 81... both square-family, duty differs in synth
    "bass": (2, "saw",    37),   # GM 38 Synth Bass 1
    "stab": (3, "saw",    81),   # GM 82 Lead 3 (calliope)
}
# NOTE: GM program numbers are 0-indexed in mido. 80 = GM 81 (sawtooth lead)
# would be wrong for a square; GM 81 is "Lead 2 (sawtooth)". For a square the
# GM number is 80 -> mido 79. Fixed properly in the program map below.
PROGRAM = {"lead": 79, "arp": 79, "bass": 37, "stab": 80}

GAIN = {"lead": 0.30, "arp": 0.20, "bass": 0.30, "stab": 0.16}
DRUM_MIDI = {"kick": 36, "snare": 38, "hat": 42}
DRUM_GAIN = {"kick": 0.55, "snare": 0.34, "hat": 0.18}


def sn(root, idx, scale):
    """Scale index -> MIDI pitch. Index 7 is the tonic an octave up."""
    return root + scale[idx % 7] + 12 * (idx // 7)


def triad(root, degree, scale):
    return [sn(root, degree + 2 * i, scale) for i in range(3)]


def chord_pcs(root, degree, scale):
    """Pitch classes of the triad, for snapping strong notes to the harmony."""
    return {p % 12 for p in triad(root, degree, scale)}


def snap(pitch, pcs):
    """Nearest pitch whose class is a chord tone (searches outward)."""
    for d in (0, 1, -1, 2, -2):
        if (pitch + d) % 12 in pcs:
            return pitch + d
    return pitch


def build_piece(piece):
    """Return (notes, drums, beats) where notes are (start,dur,pitch,voice)."""
    root, scale_default = piece["root"], NAT
    notes, drums = [], []
    bar = 0.0
    for section in piece["sections"]:
        for b in section["bars"]:
            deg = b["deg"]
            sc = HARM if b.get("harm") else scale_default
            loud = section.get("loud", 1.0)
            # --- arp: the SID chord trick, 16ths cycling root/3rd/5th/octave
            if section.get("arp", True):
                t3 = triad(root, deg, sc)
                cyc = [t3[0], t3[1], t3[2], t3[0] + 12]
                step = 1.0 / section.get("arp_div", 4)  # 4 = 16ths
                n_arp = int(4 / step)
                for i in range(n_arp):
                    notes.append((bar + i * step, step * 0.9, cyc[i % 4], "arp"))
            # --- bass
            if section.get("bass", True):
                pat = section.get("bass_pat", [0, 0, 0, 0, 0, 0, 4, 4])
                step = 4.0 / len(pat)
                for i, d in enumerate(pat):
                    notes.append((bar + i * step, step * 0.95,
                                  sn(root, deg + d, sc) - 12, "bass"))
            # --- chord stabs (Amiga, offbeat)
            if section.get("stab"):
                for i in (0.5, 1.5, 2.5, 3.5):
                    notes.append((bar + i, 0.22, sn(root, deg + 4, sc), "stab"))
                    notes.append((bar + i, 0.22, sn(root, deg + 2, sc), "stab"))
            # --- lead
            if section.get("lead") and b.get("lead"):
                off = 0.0
                pcs = chord_pcs(root, deg, sc)
                for idx, dur in b["lead"]:
                    p = sn(root, idx, sc)
                    strong = off % 2 == 0 and dur >= 0.5
                    if strong:
                        p = snap(p, pcs)
                    notes.append((bar + off, dur * 0.94, p, "lead"))
                    off += dur
            # --- drums
            if section.get("drums"):
                for pos, kind in section["drums"]:
                    drums.append((bar + pos, kind))
            bar += 4.0
    return notes, drums, bar


# --------------------------------------------------------------------------
# synth
# --------------------------------------------------------------------------
def wave_table(kind, n, dt, rng):
    ph = (np.arange(n) * dt) % 1.0
    if kind == "square":
        return np.where(ph < 0.5, 1.0, -1.0)
    if kind == "pulse":
        return np.where(ph < 0.25, 1.0, -1.0)
    return 2.0 * ph - 1.0  # saw


def render_note(kind, freq, dur_s, vel):
    n = int(dur_s * SR)
    if n < 8:
        return np.zeros(0)
    dt = freq / SR
    rng = np.random.default_rng(int(freq * 1000) % 2**31)
    body = wave_table(kind, n, dt, rng)
    # chip envelope: near-instant attack, slight decay, short release
    atk = max(1, int(0.004 * SR))
    rel = max(1, int(0.045 * SR))
    env = np.ones(n)
    env[:atk] = np.linspace(0, 1, atk)
    env[atk:] = 0.72 + 0.28 * np.exp(-np.arange(n - atk) / (SR * 0.35))
    env[-rel:] *= np.linspace(1, 0, rel)
    return body * env * vel


def lfsr(n, clock_hz, seed):
    """SID-style noise: a random bitstream held for a fixed number of samples.
    The clock rate is what gives SID noise its 'pitch'."""
    rng = np.random.default_rng(seed)
    step = max(1, int(SR / clock_hz))
    bits = rng.integers(0, 2, size=n // step + 2) * 2.0 - 1.0
    return np.repeat(bits, step)[:n]


def render_drum(kind, seed):
    if kind == "kick":
        n = int(0.16 * SR)
        t = np.arange(n) / SR
        f = 130 * np.exp(-t * 24) + 45
        body = np.sin(2 * np.pi * np.cumsum(f) / SR)
        env = np.exp(-t * 26)
        click = lfsr(int(0.004 * SR), 6000, seed) * np.exp(-np.arange(int(0.004 * SR)) / (SR * 0.0015))
        out = body * env
        out[:len(click)] += click * 0.5
        return out
    if kind == "snare":
        n = int(0.19 * SR)
        t = np.arange(n) / SR
        noise = lfsr(n, 3200, seed) * np.exp(-t * 22)
        tone = np.sin(2 * np.pi * 195 * t) * np.exp(-t * 40) * 0.5
        return noise + tone
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    return lfsr(n, 11000, seed) * np.exp(-t * 90)


def synth(notes, drums, beats, bpm, seed=7):
    spb = 60.0 / bpm
    total = int((beats * spb + 1.6) * SR)
    mix = np.zeros(total + SR)
    for i, (start, dur, pitch, voice) in enumerate(notes):
        kind = VOICES[voice][1]
        freq = 440.0 * 2 ** ((pitch - 69) / 12.0)
        # snappier release on arps/stabs, longer on bass
        vel = GAIN[voice] * (0.85 if voice in ("arp", "stab") else 1.0)
        if voice == "arp":
            d = min(dur * spb, 0.09)
        else:
            d = dur * spb
        s = render_note(kind, freq, d, vel)
        a = int(start * spb * SR)
        mix[a:a + len(s)] += s
    for i, (start, kind) in enumerate(drums):
        s = render_drum(kind, seed + i * 977)
        a = int(start * spb * SR)
        mix[a:a + len(s)] += s * DRUM_GAIN[kind]
    mix = mix[:total]
    # gentle one-pole lowpass to tame the harshest aliasing, keep the grit
    a = math.exp(-2 * math.pi * 12000 / SR)
    out = np.empty_like(mix)
    prev = 0.0
    for i in range(0, len(mix), 4096):  # chunked to keep it quick in python
        blk = mix[i:i + 4096]
        y = np.empty_like(blk)
        for j, x in enumerate(blk):
            prev = (1 - a) * x + a * prev
            y[j] = prev
        out[i:i + 4096] = y
    peak = np.max(np.abs(out)) or 1.0
    return out / peak * 0.89


def write_midi(notes, drums, beats, bpm, path):
    import mido
    mid = mido.MidiFile(ticks_per_beat=TPB)
    for name, (chan, _w, _g) in VOICES.items():
        tr = mido.MidiTrack()
        tr.append(mido.MetaMessage("track_name", name=name, time=0))
        tr.append(mido.Message("program_change", channel=chan,
                               program=PROGRAM[name], time=0))
        mid.tracks.append(tr)
    tr = mido.MidiTrack()
    tr.append(mido.MetaMessage("track_name", name="perc", time=0))
    mid.tracks.append(tr)
    events = []
    for start, dur, pitch, voice in notes:
        chan = VOICES[voice][0]
        vel = 96
        events.append((start * TPB, 1, chan, pitch, vel))
        events.append(((start + dur) * TPB, 0, chan, pitch, 0))
    for start, kind in drums:
        events.append((start * TPB, 1, 9, DRUM_MIDI[kind], 100))
        events.append(((start + 0.12) * TPB, 0, 9, DRUM_MIDI[kind], 0))
    # sort by tick, note-off (1) before note-on (0) at the same tick
    events.sort(key=lambda e: (e[0], e[1]))
    last = 0
    for tick, _o, chan, pitch, vel in events:
        tick = int(round(tick))
        dt = tick - last
        if vel:
            tr.append(mido.Message("note_on", channel=chan, note=int(pitch),
                                   velocity=vel, time=dt))
        else:
            tr.append(mido.Message("note_off", channel=chan, note=int(pitch),
                                   velocity=0, time=dt))
        last = tick
    tr.append(mido.MetaMessage("end_of_track", time=0))
    mid.tracks[0].insert(0, mido.MetaMessage("set_tempo",
                                             tempo=mido.bpm2tempo(bpm), time=0))
    mid.save(path)
    return len(events) // 2


def write_wav(sig, path):
    data = np.clip(sig, -1, 1)
    pcm = (data * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def to_mp3(wav, mp3, bitrate="160k"):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", wav,
                    "-codec:a", "libmp3lame", "-b:a", bitrate, "-ac", "1", mp3],
                   check=True)


# --------------------------------------------------------------------------
# the pieces
# --------------------------------------------------------------------------
def bar(deg, lead=None, harm=False):
    return {"deg": deg, "lead": lead, "harm": harm}


D_C64 = [(0.0, "kick"), (4.0, "snare"), (8.0, "kick"), (12.0, "snare"),
         (2.0, "hat"), (6.0, "hat"), (10.0, "hat"), (14.0, "hat")]
D_AMIGA = [(0.0, "kick"), (4.0, "snare"), (8.0, "kick"), (10.0, "kick"),
           (12.0, "snare"), (2.0, "hat"), (6.0, "hat"), (10.0, "hat"),
           (14.0, "hat"), (7.0, "hat")]

A_LEAD = [
    [(4, .5), (4, .5), (5, .5), (4, .5), (2, 1), (0, 1)],
    [(5, .5), (5, .5), (6, .5), (5, .5), (3, 1), (1, 1)],
    [(7, .5), (7, .5), (6, .5), (4, .5), (2, 1), (4, 1)],
    [(6, 1), (4, .5), (2, .5), (4, 2)],
]
B_LEAD = [
    [(7, 1), (8, .5), (7, .5), (5, 1), (4, 1)],
    [(7, .5), (7, .5), (8, .5), (7, .5), (5, 1), (4, 1)],
    [(6, 1), (7, 1), (8, 2)],
    [(7, 1), (6, .5), (5, .5), (4, 2)],
]

PIECES = [
    {
        "name": "sid-hero", "bpm": 140, "root": 57, "style": "C64",
        "sections": [
            {"arp_div": 4, "bass_pat": [0, 0, 0, 0, 0, 0, 4, 4],
             "bars": [bar(0), bar(5), bar(2), bar(6)]},
            {"arp_div": 4, "bass_pat": [0, 0, 0, 0, 0, 0, 4, 4], "drums": D_C64,
             "lead": True,
             "bars": [bar(0, A_LEAD[0]), bar(5, A_LEAD[1]), bar(2, A_LEAD[2]),
                      bar(6, A_LEAD[3]),
                      bar(0, A_LEAD[0]), bar(5, A_LEAD[1]), bar(2, A_LEAD[2]),
                      bar(4, [(4, 1), (6, 1), (1, 2)], harm=True)]},
            {"arp_div": 4, "bass_pat": [0, 0, 0, 0, 0, 0, 4, 4], "drums": D_C64,
             "lead": True,
             "bars": [bar(3, B_LEAD[0]), bar(5, B_LEAD[1]),
                      bar(4, B_LEAD[2], harm=True), bar(0, B_LEAD[3]),
                      bar(3, B_LEAD[0]), bar(5, B_LEAD[1]),
                      bar(4, B_LEAD[2], harm=True),
                      bar(4, [(6, .5), (6, .5), (7, .5), (7, .5), (8, 1), (8, 1)], harm=True)]},
            {"arp_div": 4, "bass_pat": [0, 0, 0, 0, 0, 0, 4, 4], "drums": D_C64,
             "lead": True,
             "bars": [bar(0, A_LEAD[0]), bar(5, A_LEAD[1]), bar(2, A_LEAD[2]),
                      bar(6, A_LEAD[3]),
                      bar(0, A_LEAD[0]), bar(5, A_LEAD[1]), bar(2, A_LEAD[2]),
                      bar(4, [(4, 1), (6, 1), (1, 2)], harm=True)]},
            {"arp_div": 4, "bass_pat": [0, 0, 0, 0, 0, 0, 4, 2], "lead": True,
             "bars": [bar(0, [(4, 2), (0, 2)]), bar(0, [(0, 4)])]},
        ],
    },
    {
        "name": "tracker-runner", "bpm": 125, "root": 50, "style": "Amiga",
        "sections": [
            {"arp_div": 0, "arp": False, "stab": True, "drums": D_AMIGA,
             "bass_pat": [0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7],
             "bars": [bar(0), bar(5), bar(2), bar(6)]},
            {"arp": False, "stab": True, "drums": D_AMIGA, "lead": True,
             "bass_pat": [0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7],
             "bars": [bar(0, A_LEAD[0]), bar(5, A_LEAD[1]), bar(2, A_LEAD[2]),
                      bar(6, A_LEAD[3]),
                      bar(0, A_LEAD[0]), bar(5, A_LEAD[1]), bar(2, A_LEAD[2]),
                      bar(4, [(4, 1), (6, 1), (1, 2)], harm=True)]},
            {"arp": False, "stab": True, "drums": D_AMIGA, "lead": True,
             "bass_pat": [0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7],
             "bars": [bar(3, B_LEAD[0]), bar(4, B_LEAD[2], harm=True),
                      bar(0, B_LEAD[3]), bar(5, B_LEAD[1]),
                      bar(3, B_LEAD[0]), bar(4, B_LEAD[2], harm=True),
                      bar(6, [(6, 1), (5, 1), (4, 2)]),
                      bar(6, [(6, .5), (6, .5), (7, .5), (7, .5), (8, 1), (8, 1)])]},
            {"arp": False, "stab": True, "drums": D_AMIGA, "lead": True,
             "bass_pat": [0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7],
             "bars": [bar(0, A_LEAD[0]), bar(5, A_LEAD[1]), bar(2, A_LEAD[2]),
                      bar(6, A_LEAD[3]),
                      bar(0, A_LEAD[0]), bar(5, A_LEAD[1]), bar(2, A_LEAD[2]),
                      bar(4, [(4, 1), (6, 1), (1, 2)], harm=True)]},
            {"arp": False, "stab": False, "drums": [(0.0, "kick"), (0.0, "snare")],
             "bars": [bar(0), bar(0)]},
        ],
    },
    {
        "name": "loading-screen", "bpm": 100, "root": 52, "style": "C64",
        "sections": [
            {"arp_div": 4, "bass_pat": [0, 0, 0, 0], "drums": [(0.0, "kick")],
             "bars": [bar(0), bar(5), bar(2), bar(6)]},
            {"arp_div": 4, "bass_pat": [0, 0, 0, 0], "drums": [(0.0, "kick"), (8.0, "kick"), (4.0, "snare"), (12.0, "snare")],
             "lead": True,
             "bars": [bar(0, [(7, 2), (4, 2)]), bar(5, [(8, 2), (5, 2)]),
                      bar(3, [(7, 1), (5, 1), (4, 2)]), bar(6, [(6, 2), (4, 2)]),
                      bar(0, [(7, 2), (4, 2)]), bar(5, [(8, 2), (5, 2)]),
                      bar(2, [(7, 1), (4, 1), (2, 2)]), bar(6, [(6, 2), (5, 2)])]},
            {"arp_div": 4, "bass_pat": [0, 0, 0, 0], "drums": [(0.0, "kick"), (8.0, "kick"), (4.0, "snare"), (12.0, "snare")],
             "lead": True,
             "bars": [bar(3, [(7, 2), (8, 2)]), bar(0, [(7, 1), (5, 1), (4, 2)]),
                      bar(5, [(8, 2), (6, 2)]), bar(4, [(6, 1), (7, 1), (8, 2)], harm=True),
                      bar(3, [(7, 2), (8, 2)]), bar(0, [(7, 1), (5, 1), (4, 2)]),
                      bar(5, [(8, 2), (6, 2)]), bar(4, [(4, 2), (4, 2)], harm=True)]},
            {"arp_div": 4, "bass_pat": [0, 0, 0, 4], "lead": True,
             "bars": [bar(0, [(4, 2), (0, 2)]), bar(0, [(0, 4)])]},
        ],
    },
]


def main():
    os.makedirs(OUT_MID, exist_ok=True)
    summary = []
    for p in PIECES:
        notes, drums, beats = build_piece(p)
        name = p["name"]
        mid = os.path.join(OUT_MID, name + ".mid")
        n = write_midi(notes, drums, beats, p["bpm"], mid)
        sig = synth(notes, drums, beats, p["bpm"])
        wav = os.path.join(OUT_MID, name + ".wav")
        mp3 = os.path.join(OUT_MID, name + ".mp3")
        write_wav(sig, wav)
        to_mp3(wav, mp3, "160k")
        dur = len(sig) / SR
        # spectral centroid on the busiest 2 s: a chip lead must read bright
        seg = sig[int(dur * 0.4 * SR):int(dur * 0.4 * SR) + 2 * SR]
        sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
        fr = np.fft.rfftfreq(len(seg), 1 / SR)
        cent = float((sp * fr).sum() / max(sp.sum(), 1e-9))
        q = len(sig) // 4
        sec = [float(np.sqrt(np.mean(sig[i * q:(i + 1) * q] ** 2))) for i in range(4)]
        summary.append((name, p["style"], p["bpm"], beats, dur, n,
                        float(np.max(np.abs(sig))), cent,
                        os.path.getsize(mid), os.path.getsize(mp3), sec))
    print(f"{'piece':16} {'style':6} {'bpm':>4} {'bars':>5} {'sec':>6} "
          f"{'notes':>6} {'peak':>5} {'cent Hz':>8} {'mid B':>7} {'mp3 B':>8}")
    for s in summary:
        print(f"{s[0]:16} {s[1]:6} {s[2]:>4} {s[3]:>5.0f} {s[4]:>6.1f} "
              f"{s[5]:>6} {s[6]:>5.2f} {s[7]:>8.0f} {s[8]:>7} {s[9]:>8}")
        print(f"{'':16} quarters RMS: " + " ".join(f"{v:.3f}" for v in s[10]))
    return 0


if __name__ == "__main__":
    sys.exit(main())