#!/usr/bin/env python3
"""Write real 4-channel ProTracker MOD files, render them with libopenmpt.

Why this instead of the numpy synth in chips.py: that synth was built from
clean duty-cycle pulses, which is the NES sound (a fixed square wave with no
filter). The Amiga sound comes from Paula, which plays 8-bit single-cycle
samples at a period-derived rate with no interpolation, so high notes alias and
everything carries quantisation grit. You cannot get that by drawing a clean
square wave, so this script emits an actual tracker module and lets libopenmpt
emulate the hardware.

Layout is the classic Amiga one:
  ch0 lead   ch1 bass   ch2 chords (via the arpeggio effect)   ch3 drums

Effects used are the ones the scene leaned on:
  0xy arpeggio   cycles note, note+x, note+y every tick -> a whole chord out of
                 one channel, which is how MODs played chords at all
  4xy vibrato    the singing quality on sustained leads
  Fxx speed / tempo

Verified after render: length, peak, per-quarter RMS, and that the arpeggio
channel really is producing chord tones rather than a single pitch.
"""
import os
import struct
import subprocess
import sys
import wave

import numpy as np

SR_OUT = 44100
AMIGA_CLOCK = 3546895.0
MUS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(MUS, "chip")
FFMPEG = "/home/jimarie/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg"

# ProTracker period table, finetune 0: C-1 .. B-3
PERIODS = [856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
           428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
           214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113]
# With a 32-byte single-cycle sample, playback rate = AMIGA_CLOCK/period, so the
# sounding frequency is AMIGA_CLOCK/(period*32).
_PERIOD_FREQ = np.array([AMIGA_CLOCK / (p * 32.0) for p in PERIODS])


def period_for(pitch):
    """Nearest hardware period for a MIDI pitch. Only the 36 real periods
    exist on the Amiga, so quantise to them (that flatness is authentic)."""
    if pitch < 48 or pitch > 83:
        raise ValueError(f"pitch {pitch} outside Paula's 3-octave period range")
    f = 440.0 * 2 ** ((pitch - 69) / 12.0)
    return PERIODS[int(np.argmin(np.abs(np.log(_PERIOD_FREQ / f))))]


# ---------------------------------------------------------------- samples
def cyc(kind, n=32, duty=0.5):
    ph = (np.arange(n) / n) % 1.0
    if kind == "pulse":
        w = np.where(ph < duty, 1.0, -1.0)
    elif kind == "saw":
        w = 2.0 * ph - 1.0
    elif kind == "tri":
        w = 4.0 * np.abs(ph - 0.5) - 1.0
    elif kind == "sine":
        w = np.sin(2 * np.pi * ph)
    elif kind == "bright":  # pulse plus second harmonic: a lead with teeth
        w = np.where(ph < duty, 1.0, -1.0) + 0.45 * np.sin(4 * np.pi * ph)
    return np.clip(w, -1, 1)


def one_shot(kind, seed):
    if kind == "kick":
        n = 1800
        t = np.arange(n) / 16000.0
        f = 150 * np.exp(-t * 28) + 42
        body = np.sin(2 * np.pi * np.cumsum(f) / 16000.0)
        out = body * np.exp(-t * 17)
        out[:24] += np.random.default_rng(seed).uniform(-1, 1, 24) * 0.6
        return out
    if kind == "snare":
        n = 1500
        t = np.arange(n) / 16000.0
        rng = np.random.default_rng(seed)
        noise = rng.uniform(-1, 1, n) * np.exp(-t * 24)
        tone = 0.55 * np.sin(2 * np.pi * 210 * t) * np.exp(-t * 44)
        return noise * 0.9 + tone
    n = 420
    t = np.arange(n) / 16000.0
    return np.random.default_rng(seed).uniform(-1, 1, n) * np.exp(-t * 95)


def q8(x):
    """8-bit signed quantisation: the Paula grit, applied at the sample, not
    as an afterthought."""
    return np.clip(np.round(np.nan_to_num(x) * 127.0), -128, 127).astype(np.int8)


def make_samples():
    """Return list of (name, bytearray, looping). 8-bit signed PCM."""
    rng = np.random.default_rng(11)
    specs = [
        ("lead-bright", cyc("bright", 32, 0.5), True),
        ("lead-pulse", cyc("pulse", 32, 0.25), True),
        ("square", cyc("pulse", 32, 0.5), True),
        ("saw", cyc("saw", 32), True),
        ("tri", cyc("tri", 32), True),
        ("bass-sine", cyc("sine", 32), True),
        ("kick", one_shot("kick", 1), False),
        ("snare", one_shot("snare", 2), False),
        ("hat", one_shot("hat", 3), False),
        ("stab-saw", cyc("saw", 32), True),
        ("pad-tri", cyc("tri", 32), True),
        ("pad-pulse", cyc("pulse", 32, 0.125), True),
    ]
    out = []
    for name, arr, loop in specs:
        a = q8(arr)
        if len(a) % 2:
            a = np.append(a, np.int8(0))
        out.append((name, a.tobytes(), loop))
    return out


# ---------------------------------------------------------------- writing
def cell(sample, period, eff=0, param=0):
    if sample or period:
        b0 = ((sample & 0xF0) | ((period >> 8) & 0x0F))
        b1 = period & 0xFF
        b2 = ((sample & 0x0F) << 4) | (eff & 0x0F)
        return bytes([b0, b1, b2, param & 0xFF])
    return bytes([0, 0, eff & 0x0F, param & 0xFF])


def write_mod(path, title, samples, patterns, orders, bpm=125, speed=6):
    """patterns: list of 64-row lists of 4 cells each (bytes or None)."""
    hdr = bytearray(title.encode("ascii")[:20].ljust(20, b"\0"))
    for name, data, loop in samples:
        words = len(data) // 2
        hdr += name.encode("ascii")[:22].ljust(22, b"\0")
        hdr += struct.pack(">H", words)
        hdr += bytes([0])                       # finetune
        hdr += bytes([48])                      # volume: four voices sum, so leave headroom
        hdr += struct.pack(">H", 0)             # repeat point
        hdr += struct.pack(">H", words if loop else 0)
    # a MOD always carries 31 sample slots whether or not they are used; leaving
    # the unused ones out shifts the order table and the magic
    hdr += bytes((31 - len(samples)) * 30)
    hdr += bytes([len(orders), 127])
    hdr += bytes(list(orders) + [0] * (128 - len(orders)))
    hdr += b"M.K."
    # Tempo lives in the pattern, not the header. Fxx with xx >= 32 sets BPM,
    # below that it sets ticks per row. Leave this out and every module plays
    # at the default 125 no matter what you intended.
    pats = [[list(row) for row in pat] for pat in patterns]
    pats[0][0] = list(pats[0][0])
    pats[0][0][0] = cell(0, 0, 0xF, bpm)
    body = bytearray()
    for pat in pats:
        for row in pat:
            for c in row:
                body += c
    body += b"".join(d for _n, d, _l in samples)
    with open(path, "wb") as f:
        f.write(bytes(hdr) + bytes(body))
    return len(hdr) + len(body)


# ---------------------------------------------------------------- composing
# scale degrees, natural minor and harmonic minor
NAT = [0, 2, 3, 5, 7, 8, 10]
HARM = [0, 2, 3, 5, 7, 8, 11]
SM = {"lead-bright": 1, "lead-pulse": 2, "square": 3, "saw": 4, "tri": 5,
      "bass-sine": 6, "kick": 7, "snare": 8, "hat": 9, "stab-saw": 10,
      "pad-tri": 11, "pad-pulse": 12}


def sn(root, idx, scale):
    return root + scale[idx % 7] + 12 * (idx // 7)


def compose(spec):
    """spec: title, bpm, root, sections=[{bars:[(deg, lead|None, harm)]}]
    Returns (patterns, orders). Each 64-row pattern is 4 bars of 16 rows."""
    root = spec["root"]
    patterns, orders = [], []
    cur, rows = [], []
    def flush():
        nonlocal cur, rows
        if rows:
            while len(rows) < 64:
                rows.append([cell(0, 0)] * 4)
            cur.append(rows)
            rows = []

    for sec in spec["sections"]:
        for bi, (deg, lead, harm) in enumerate(sec["bars"]):
            sc = HARM if harm else NAT
            grid = [[cell(0, 0) for _ in range(4)] for _ in range(16)]
            # ch1 bass: quarter notes inside Paula's real bass register. Her
            # lowest period is ~130 Hz, so there is no sub-bass to reach for,
            # which is exactly why MOD bass lines sit this high.
            for r, d in ((0, 0), (4, 0), (8, 4), (12, 12)):
                grid[r][1] = cell(SM["bass-sine"], period_for(sn(root, deg + d, sc)))
            # ch3 drums: one-shots played back near the rate they were made at
            for r, name in ((0, "kick"), (8, "kick"), (4, "snare"),
                            (12, "snare"), (2, "hat"), (6, "hat"),
                            (10, "hat"), (14, "hat")):
                if not sec.get("no_drums"):
                    grid[r][3] = cell(SM[name], 214)  # 3546895/214 ~ 16.6 kHz
            # ch2 chords the scene way: the arpeggio effect turns one channel
            # into a whole triad. Intervals are read off the scale so major
            # degrees (III, VI, VII) do not come out minor by accident.
            if not sec.get("no_chords"):
                p0 = sn(root, deg, sc)
                third = sn(root, deg + 2, sc) - p0
                fifth = sn(root, deg + 4, sc) - p0
                arp = (third << 4) | fifth
                p = period_for(sn(root, deg + 7, sc))
                for r in (2, 6, 10, 14):
                    grid[r][2] = cell(SM["stab-saw"], p, 0x0, arp)
            # ch0 lead, an octave up so it sits above the bass
            if lead:
                row = 0
                for idx, dur in lead:
                    p = period_for(sn(root, idx + 7, sc))
                    grid[row][0] = cell(SM["lead-bright"], p,
                                        0x4 if dur >= 4 else 0x0,
                                        0x38 if dur >= 4 else 0x00)
                    # hold with vibrato while the note lasts
                    for rr in range(row + 1, min(row + dur, 16)):
                        grid[rr][0] = (cell(0, 0, 0x4, 0x38) if dur >= 4
                                       else cell(0, 0))
                    row += dur
            rows.extend(grid)
            if len(rows) == 64:
                flush()
        # one pattern per section (4 bars); pad if short
        while len(rows):
            rows.append([cell(0, 0)] * 4)
            if len(rows) == 64:
                flush()
                break
    if cur:
        patterns = cur
    # the order table is how a MOD plays material twice without storing it twice
    orders = spec.get("orders") or list(range(len(patterns)))
    return patterns, orders


def render(mod_path, mp3_path):
    wav = mod_path[:-4] + ".wav"
    r = subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", mod_path,
                        "-ar", str(SR_OUT), "-ac", "1", wav],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"libopenmpt could not decode {mod_path}: {r.stderr[:400]}")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", wav,
                    "-codec:a", "libmp3lame", "-b:a", "160k", "-ac", "1",
                    mp3_path], check=True)
    with wave.open(wav) as w:
        n = w.getnframes()
        d = np.frombuffer(w.readframes(n), dtype="<i2").astype(float) / 32768
    return d, n


# A-section lead motifs as (scale index, rows at 16 rows/bar)
A_LEAD = [(4, 2), (4, 2), (5, 2), (4, 2), (2, 4), (0, 4)]
A_LEAD2 = [(5, 2), (5, 2), (6, 2), (5, 2), (3, 4), (1, 4)]
A_LEAD3 = [(7, 2), (7, 2), (6, 2), (4, 2), (2, 4), (4, 4)]
A_LEAD4 = [(6, 4), (4, 2), (2, 2), (4, 8)]
B_LEAD1 = [(7, 4), (8, 2), (7, 2), (5, 4), (4, 4)]
B_LEAD2 = [(6, 4), (7, 4), (8, 8)]
B_LEAD3 = [(7, 4), (6, 2), (5, 2), (4, 8)]

SECTIONS = [
    {"no_chords": False, "bars": [(0, None, False), (5, None, False),
                                  (2, None, False), (6, None, False)]},
    {"bars": [(0, A_LEAD, False), (5, A_LEAD2, False), (2, A_LEAD3, False),
              (6, A_LEAD4, False)]},
    {"bars": [(3, B_LEAD1, False), (5, B_LEAD2, False), (4, B_LEAD2, True),
              (0, B_LEAD3, False)]},
    {"bars": [(0, A_LEAD, False), (5, A_LEAD2, False), (2, A_LEAD3, False),
              (6, A_LEAD4, False)]},
    {"bars": [(0, [(4, 4), (2, 4), (0, 8)], False), (0, [(0, 16)], False),
              (0, None, False), (0, None, False)]},
]

CI_SECTIONS = [
    {"bars": [(0, None, False), (5, None, False), (2, None, False),
              (6, None, False)]},
    {"bars": [(0, [(7, 4), (4, 4), (2, 4), (0, 4)], False),
              (5, [(8, 4), (5, 4), (3, 4), (1, 4)], False),
              (3, [(7, 2), (5, 2), (4, 4), (2, 8)], False),
              (6, [(6, 4), (4, 4), (2, 8)], False)]},
    {"bars": [(3, [(7, 4), (8, 2), (7, 2), (5, 4), (4, 4)], False),
              (0, [(7, 4), (5, 2), (4, 2), (2, 8)], False),
              (5, [(8, 4), (6, 4), (5, 8)], False),
              (4, [(6, 2), (7, 2), (8, 4), (8, 8)], True)]},
]

# Sections are the stored patterns and the order table does the repeating, which
# is how a MOD turns four patterns into a full length song. Both pieces are
# eight pattern plays long: 32 bars.
PIECES = [
    {"title": "paula-hero", "bpm": 125, "root": 50,
     "orders": [0, 1, 1, 2, 1, 1, 2, 3],
     "sections": [SECTIONS[0], SECTIONS[1], SECTIONS[2], SECTIONS[4]]},
    {"title": "copper-bars", "bpm": 108, "root": 52,
     "orders": [0, 1, 1, 2, 1, 2, 1, 3],
     "sections": CI_SECTIONS + [{"bars": [(0, [(2, 8), (0, 8)], False),
                                          (0, [(7, 16)], False),
                                          (3, None, False), (0, None, False)]}]},
]


def main():
    os.makedirs(OUT, exist_ok=True)
    samples = make_samples()
    print(f"samples: {len(samples)}, "
          f"{sum(len(d) for _n, d, _l in samples)} bytes of 8-bit PCM")
    rows = []
    for p in PIECES:
        pats, orders = compose(p)
        mod = os.path.join(OUT, p["title"] + ".mod")
        size = write_mod(mod, p["title"], samples, pats, orders, bpm=p["bpm"])
        d, n = render(mod, os.path.join(OUT, p["title"] + ".mp3"))
        dur = n / SR_OUT
        fft = np.abs(np.fft.rfft(d * np.hanning(len(d))))
        fr = np.fft.rfftfreq(len(d), 1 / SR_OUT)
        cent = float((fft * fr).sum() / max(fft.sum(), 1e-9))
        q = len(d) // 4
        sec = [float(np.sqrt(np.mean(d[i * q:(i + 1) * q] ** 2))) for i in range(4)]
        rows.append((p["title"], p["bpm"], len(pats), dur, size,
                     float(np.max(np.abs(d))), cent, sec,
                     os.path.getsize(os.path.join(OUT, p["title"] + ".mp3"))))
    print(f"\n{'module':14} {'bpm':>4} {'pats':>5} {'sec':>6} {'mod B':>7} "
          f"{'peak':>5} {'cent Hz':>8} {'mp3 B':>8}")
    for r in rows:
        print(f"{r[0]:14} {r[1]:>4} {r[2]:>5} {r[3]:>6.1f} {r[4]:>7} "
              f"{r[5]:>5.2f} {r[6]:>8.0f} {r[8]:>8}")
        print(f"{'':14} quarters RMS: " + " ".join(f"{v:.3f}" for v in r[7]))
    # verify the artifact itself, not just the render: parse the MOD back off
    # disk and confirm the arpeggio effects carry real triad intervals.
    mod_path = os.path.join(OUT, "paula-hero.mod")
    with open(mod_path, "rb") as f:
        data = f.read()
    n_orders = data[950]
    order_tab = list(data[952:952 + n_orders])
    n_pat = max(order_tab) + 1
    smp = sum(struct.unpack(">H", data[20 + i * 30 + 22:20 + i * 30 + 24])[0] * 2
              for i in range(31))
    expect = 1084 + n_pat * 1024 + smp
    pat = data[1084:1084 + n_pat * 1024]
    notes = arps = vibs = 0
    arp_vals = {}
    for off in range(0, len(pat), 4):
        b0, b1, b2, b3 = pat[off:off + 4]
        if (b2 & 0x0F) == 0x00 and b3 and (b0 or b1):
            arps += 1
            arp_vals[b3] = arp_vals.get(b3, 0) + 1
        if (b2 & 0x0F) == 0x04:
            vibs += 1
        if (b0 & 0xF0) or (b2 & 0xF0):
            notes += 1
    print(f"\nfile check on disk: {len(data)} B vs {expect} expected, "
          f"magic {data[1080:1084].decode()}")
    print(f"  {n_pat} patterns, {n_orders} orders, {notes} note cells, "
          f"{smp} B of 8-bit sample data")
    print(f"  arpeggio effects: {arps}, intervals "
          + ", ".join(f"0x{k:02X} x{v}" for k, v in sorted(arp_vals.items())))
    print(f"  vibrato rows: {vibs}")
    assert len(data) == expect, "sample data length disagrees with the headers"
    assert len(arp_vals) >= 2, "chords should show both minor and major triads"
    return 0


if __name__ == "__main__":
    sys.exit(main())