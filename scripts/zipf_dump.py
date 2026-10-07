#!/usr/bin/env python3
"""One-shot Zipf dump for the content migration.

`sections 4.6 and 21-content-migration.md` decide word bands by corpus frequency
(wordfreq Zipf, zh) rather than HSK level. wordfreq is a Python package, so this
dump is run once by hand and its output is committed as data: the migration
script and CI never need Python or the network (SPEC 4.3: bands are committed
data, never recomputed at build).

Usage:
    <venv>/bin/python scripts/zipf_dump.py

Writes content/_source/zipf.json: { "<hanzi>": <zipf> } for every word in the
frozen POC snapshot plus every deck-expansion word.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "content" / "_source" / "poc-vocabulary"
ADDED = ROOT / "scripts" / "data" / "added-words.json"
OUT = ROOT / "content" / "_source" / "zipf.json"

HANZI = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")


def corpus_words() -> list[str]:
    words: set[str] = set()
    for path in sorted(SOURCE.glob("*.json")):
        for entry in json.loads(path.read_text(encoding="utf-8")):
            hanzi = (entry.get("hanzi") or "").strip()
            if hanzi:
                words.add(hanzi)
    for entry in json.loads(ADDED.read_text(encoding="utf-8"))["words"]:
        words.add(entry["hanzi"].strip())
    return sorted(words)


def main() -> int:
    try:
        from wordfreq import zipf_frequency
    except ImportError:
        print(
            "wordfreq is not installed in this interpreter. Use the venv:\n"
            "  python3 -m venv ~/.hermes/cache/scratch/venv-wf\n"
            "  ~/.hermes/cache/scratch/venv-wf/bin/pip install wordfreq jieba\n"
            "  ~/.hermes/cache/scratch/venv-wf/bin/python scripts/zipf_dump.py",
            file=sys.stderr,
        )
        return 1

    words = corpus_words()
    data = {w: round(zipf_frequency(w, "zh"), 2) for w in words}
    # A word with no frequency data scores 0.0; call it out rather than hiding it.
    scored_zero = [w for w, z in data.items() if z == 0.0]
    OUT.write_text(
        json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT.relative_to(ROOT)}: {len(data)} words")
    if scored_zero:
        print(f"zero-frequency (banded rare): {len(scored_zero)} -> {' '.join(scored_zero[:20])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())