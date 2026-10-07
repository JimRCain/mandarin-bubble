#!/usr/bin/env python3
"""
Concatenate rendered songs into one album mp3.

Use the concat FILTER, not `-c copy`: mp3 frames carry their own timestamps, so a
stream-copy concat emits DTS warnings and unreliable output. Re-encoding through
the filter graph is what worked for the loop medleys.

The delivery bitrate is a parameter because WeChat/iLink throttles large sends.
The 112k previews stay on disk as the reference; the album file is a delivery
format only.
"""
import os
import subprocess
import sys

import full_song as FS

FF = "/home/jimarie/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg"
# MUS lives on compose.py, not full_song; derive it here so this tool is standalone.
MUS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREV = os.path.join(MUS, "preview")


def album(names, out, bitrate="64k", tail_pad=True):
    paths = []
    for n in names:
        p = f"{PREV}/{n}.mp3"
        if not os.path.exists(p):
            raise SystemExit(f"missing preview: {p}")
        paths.append(p)

    args = [FF, "-y", "-loglevel", "error"]
    for p in paths:
        args += ["-i", p]
    chain = "".join(f"[{i}:a]" for i in range(len(paths)))
    args += [
        "-filter_complex", f"{chain}concat=n={len(paths)}:v=0:a=1[out]",
        "-map", "[out]",
        "-c:a", "libmp3lame", "-b:a", bitrate, "-ac", "1",
        "-ar", "22050",
        out,
    ]
    subprocess.run(args, check=True)
    dur = float(subprocess.run(
        ["/usr/bin/ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", out],
        capture_output=True, text=True).stdout.strip())
    return dur, os.path.getsize(out)


if __name__ == "__main__":
    bitrate = sys.argv[1] if len(sys.argv) > 1 else "64k"
    names = [s.name for s in FS.BATCH]
    out = f"{PREV}/_album-eight-keepers.mp3"
    dur, size = album(names, out, bitrate=bitrate)
    print(f"{out}")
    print(f"  {len(names)} songs  {dur:.1f}s  {size:,} B  {size/1048576:.1f} MiB  @{bitrate}")
    if size > 15 * 1048576:
        print("  WARNING: over 15 MiB, may not deliver")