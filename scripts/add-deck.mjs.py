#!/usr/bin/env python3
"""Rebuild content/categories.json and rebuild the word files content-build needs.

The deck builder (scripts/content-migrate.mjs) only emits decks that were in
content/_source/poc-vocabulary, so a deck added by hand (radicals) has its word
file but no category, and content-build refuses to run. This script:

  1. keeps every existing category, in order,
  2. appends any content/words/<id>.json that has no category yet,
  3. regenerates every word file from the raw tables in content/data/ so the
     deck files are reproducible rather than hand-written.

It is deliberately a data step, not a rule change: the validator still decides
whether the result is any good.
"""

import json
import pathlib
import re
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORDS = ROOT / "content" / "words"
DATA = ROOT / "content" / "data"
CATS = ROOT / "content" / "categories.json"

# Groups the tree knows about (src/game/tree.ts WORLD_ORDER plus the ladder),
# mapped to the group a newly added deck should join.
GROUPS = {
    "radicals": "Characters",
}

# The same cuts as BANDS in scripts/content-migrate.mjs. Duplicated because this
# script is plain Python and cannot import the JS constant; tests/content-rules
# fails loudly if the two ever drift apart.
BAND_CUTS = ((5.0, "common"), (4.2, "mid"))


def band(zipf: float) -> str:
    for cut, name in BAND_CUTS:
        if zipf >= cut:
            return name
    return "rare"


def first_reading(pinyin: str) -> str:
    """The first of several comma-separated readings, e.g. 'jī, jǐ' -> 'jī'."""
    return pinyin.split(",")[0].strip()


def slugify(pinyin: str) -> str:
    text = unicodedata.normalize("NFD", pinyin)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("ü", "v").replace("Ü", "V")
    return re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()


def build_radicals() -> list[dict]:
    raw = json.loads((DATA / "radicals-raw.json").read_text("utf-8"))
    # Rank falloff: radical 1 is the most frequent, 214 the least. Mapped onto
    # the same 2..6 log-scale the word decks use, so a rare radical lands in
    # the rare band and a structural one lands in common.
    out = []
    total = len(raw)
    for entry in raw:
        rank = int(entry["id"])
        # Rank falloff: radical 1 most frequent, 214 least, on the word decks'
        # 2..6 scale.
        zipf = round(6.0 - 4.0 * (rank - 1) / max(total - 1, 1), 2)
        hanzi = entry["radical"]
        # One id, one reading: a radical with two readings (几 jī/jǐ) keeps the
        # first for the id and the whole reading in the pinyin field, because
        # the validator's pinyin rule has no commas.
        pinyin = first_reading(entry["pinyin"])
        out.append(
            {
                # SPEC 4.2: an id derives from the word itself, never from its
                # deck. The rank stays in the gloss, not in the id, so the id
                # can be regenerated and still match what the app stored.
                "id": f"{hanzi}-{slugify(pinyin)}",
                "hanzi": hanzi,
                "pinyin": pinyin,
                "english": f'{entry["english"]} (radical {rank})',
                "band": band(zipf),
                "zipf": zipf,
            }
        )
    return out


def main() -> None:
    cats = json.loads(CATS.read_text("utf-8"))
    known = {c["id"] for c in cats}
    order = max((c["order"] for c in cats), default=-1) + 1

    added = []
    for path in sorted(WORDS.glob("*.json")):
        deck_id = path.stem
        if deck_id in known:
            continue
        group = GROUPS.get(deck_id)
        if group is None:
            raise SystemExit(f"{deck_id}.json has words but no category and no group mapping")
        cats.append(
            {
                "id": deck_id,
                "name": deck_id.replace("-", " ").title(),
                "group": group,
                "order": order,
            }
        )
        order += 1
        added.append(deck_id)

    if added:
        CATS.write_text(json.dumps(cats, indent=2, ensure_ascii=False) + "\n", "utf-8")

    (WORDS / "radicals.json").write_text(
        json.dumps(build_radicals(), indent=2, ensure_ascii=False) + "\n", "utf-8"
    )

    print(f"categories: {len(cats)} ({', '.join(added) or 'no change'})")
    print("words/radicals.json rebuilt")


if __name__ == "__main__":
    main()