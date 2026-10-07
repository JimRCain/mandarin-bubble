# Mandarin Bubble — handoff

Written 2026-10-05, end of session, at Jim's request before a session reset.
Read this first, then `SPEC.md` §8 (delivery plan) and §9 (decisions).

## Update 2026-10-07: shipped and live — the rest of this file is history

The skeleton (step 1) is built, published and playable:
**https://jimrcain.github.io/mandarin-bubble/** (repo `JimRCain/mandarin-bubble`).

- The GitHub blocker below is **resolved**: a deploy key (`~/.ssh/mb_deploy_mb1`,
  registered on the new repo) does the pushing, and `gh` now carries the `repo`
  and `workflow` scopes. Nothing needed a password.
- Files moved as proposed: `docs/SPEC.md`, `docs/spec/`, `music/preview/` and
  `music/loops/` gitignored, app code at the repo root.
- Of the three items "still needing Jim's yes" below: **§1.5 is built** (15 correct
  or 90 s, wrong tap −2 s), **§1.6(a) was removed by Jim** after playing (FR-17
  withdrawn: no teach card), **§1.7 is still open**.
- Jim played it on 2026-10-07 and sent three fixes, all done: bubbles overlapped
  (now one bubble per lane, measured 0 overlap on screen), remove the prelearn
  card, and a correct tap did not clear the round (so one word could be tapped all
  session — the real bug, and the e2e that missed it is fixed too).
- Still open: MIDI/audio is plumbing only (`public/audio/manifest.json` is empty),
  §1.7 sign-off, and whether to strip the 19 MB of finished music from the repo.
- **Pinyin is now a default-on reading aid** (Jim, 2026-10-07): it renders inside
  each bubble under the Hanzi, as the POC did. `DEFAULT_SETTINGS.pinyin` is true,
  and settings carry a `SETTINGS_VERSION` so a stored `false` written before the
  change is discarded once while a deliberate toggle-off still persists.
- **POC mechanics inventory: `docs/POC-MECHANICS.md`.** Jim asked for the original
  game's mechanics to be kept, and stopped the port mid-flight the same night
  ("the original mechanics are largely good; the scoring system I'm still open to
  change on, we will tune as we build"). Read that file before touching the
  board: it has the POC's constants, its loop, its defects, and the port order.
  Nothing of the port is implemented yet — the scoring question is unanswered.
- **Audio batch scheduled.** Cron `9883288857a2` runs once at 2026-10-08 02:00 to
  render the Hanzi clips (probe first, cap 300 clips or 45 min, resumable, no
  commit and no push). 2345 unique word ids are waiting in `content/words/`.

## What the project is

Jim's vibe-coded Hanzi learning game, currently a buggy POC with a few hundred
lines of working loop. The plan is **not** to fix the POC. It is to ship a clean,
spec-driven successor as a **new public GitHub repo**, with Jim's own POC left
alone and online as the reference.

The design thesis, in Jim's words: *"It's a learning tool masquerading as an
arcade game. This is why the bubbles wrap to the top instead of penalizing the
player."* Bubbles wrapping to the top is **deliberate**, not a bug. There are no
misses and no lose condition. Pressure comes from response time.

## Paths

| What | Where |
|---|---|
| Spec (the deliverable) | `~/business/mandarin-bubble/docs/SPEC.md` |
| Critique + audit artifacts | `~/business/mandarin-bubble/spec/` — 6 files |
| Music tooling + assets | `~/business/mandarin-bubble/music/` |
| POC (leave alone) | `~/business/dyad-apps/BubbleMandarin` — clean on `main` |
| POC live | https://jimrcain.github.io/BubbleMandarin/ |
| POC remote | `ssh://git@github.com/JimRCain/BubbleMandarin.git` |

Secrets live in `~/.hermes/.env` and are never printed.

## State: what is decided

Spec went through **two adversarial review rounds** (recorded in §11, including
§11.3 "where my own audit was wrong"). Decisions closed:

- **Learning tool first**, arcade surface second. Wrap-to-top deliberate, no misses.
- **Difficulty is corpus frequency, not HSK.** Zipf ≥ 5.00 / 4.20–5.00 / < 4.20 →
  bands renamed **Common · Mid · Rare**. Word level is a global setting, not a
  per-deck filter. Do **not** reintroduce an HSK basis (§9 A5 vs A9; this
  contradiction was found and fixed 2026-10-05).
- **Deck migration approved**: 50 decks, 2,338 unique words; 8 decks (~236 words)
  were unreachable because display names did not match filenames.
- **Audio: MIDI is source of truth, audio pre-rendered offline.**
- **Pictures**: open emoji SVGs (Noto Emoji, Apache-2.0); photographs deferred to kid mode.
- **Menu**: one decision per screen; deck list generated from data.
- **Hosting: GitHub Pages** (match the working POC). Vite `base` must be `/<repo>/`.
- **Pinyin off by default** (otherwise the loop trains pinyin reading, not Hanzi).
- **Drop the Dyad component-tagger plugin.**

## State: still needing Jim's yes

These do **not** block step 1, but they block steps 3–5. All are proposals in the
spec, not decisions:

1. **§1.5 session shape** — 15 correct or 90 s, progress by correct count, wrong
   tap costs ~2 s and breaks the streak. Kills the unwinnable arithmetic (at the
   POC's +10/−20 with a 200 goal, below ~67% accuracy the player can *never*
   finish).
2. **§1.7 rewards and playtime** — three layers. Jim asked for suggestions and has
   not signed off.
3. **§1.6(a) exposure card** — a word's first appearance shows an untimed card
   (Hanzi + pinyin + audio + English) before it can be quizzed. Marked "accepted
   in principle" by me; needs his explicit yes. Round 2 called this the deepest
   issue in the whole spec.

## Next action: delivery plan step 1

Per `SPEC.md` §8, step 1 is the **skeleton**: repo, strict TS, CI with required
checks, lint, and a test harness. Exit criterion is a **green build with no
features**. Do not start step 3+ before the §1.5/§1.6/§1.7 answers land.

**Structure proposed to Jim (awaiting his nod):** `~/business/mandarin-bubble/`
becomes the repo root, app code at the top level, `SPEC.md` and `spec/` move into
`docs/`, and `music/preview/` plus `music/loops/` get gitignored — that is 551 MiB
of dev renders that must never ship.

**GitHub blocker.** The SSH key on this machine is a **deploy key scoped to the
BubbleMandarin repo**, so it can push to that repo but GitHub refuses to let it
create a new one. `gh` is **not** logged in. Either Jim creates an empty public
repo named `mandarin-bubble` in the browser and sends the URL (preferred), or he
provides a fine-grained token with repo-creation rights. Nothing about step 1
depends on this, so build the skeleton locally meanwhile.

## Next session (2026-10-06): the DSK subset probe

Goal: measure how far the five melodic presets can be downsampled before they
sound wrong, targeting **1–2 MB total**.

- The "low single-digit MB" figure in `music/SOURCES.md` is an **estimate, not a
  measurement** (the SF2 generator tables would not expose per-preset sample
  totals through our parser). Build a real subset and weigh it before quoting.
- Open question 1: **format.** Browsers cannot load SF2 directly, so the shipped
  subset is likely per-note audio unpacked from the font (base64 / Opus bank)
  rather than a `.sf2`.
- Open question 2: **percussion stays out.** DSK's grant covers the five melodic
  presets only, so any shipped subset must exclude bank 0 prog 6.
- Remember `music/.gitignore` ignores `soundfonts/*.SF2`; un-ignore the subset or
  it ships silently missing.

## Toolchain

- `node` v22.23.2, `npm` 10.9.8 — **no pnpm**.
- POC stack is Vite + React + TS + Tailwind + shadcn/Radix. It carries the full
  Dyad dependency set, including 28 Radix packages; do not clone that fat by default.
- **Qwen Code CLI** (`qwen`, 0.24.7) is the orchestrated coding agent. Jim's
  direction: **I orchestrate and review; I do not write bulk app code myself.**
  Use `qwen --approval-mode plan -p "<prompt>"` for design-only passes.
- ffmpeg at `~/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg`, ffprobe at `/usr/bin/ffprobe`.

## Measured numbers worth not re-deriving

- Game audio: **8,704,502 B (8.30 MiB)**, ten songs, 29.7 min, mono Vorbis ~39 kbps.
- MIDI route: **94.5 KiB for all ten songs**; the redistributable-soundfont
  blocker was DSK's licence, now cleared for a reduced subset (see licensing below).
- Voice: **~2 MB** HSK 1+2 (310 words), **~11 MB** for all 2,338 approved words.
- Payload ≈ 17 MiB music + ~15 MiB voice ≈ 32 MiB. If stems are needed it triples.
- Dev dirs to gitignore: `music/preview/` 156 MiB, `music/loops/` 395 MiB.
- **Do not fix POC bugs.** They are catalogued in `SPEC.md` §2.3 as things that
  must not be carried forward.

## Music thread — CLOSED

Jim's verdict: *"we will definitely make some more music in the future"*, and the
Amiga modules were a win. His one correction: **vibrato sparingly, "the key is
using it in the right spots, not everywhere."**

Lessons are banked in the skill `midi-music-generation`, new reference file
`references/chiptune-tracker-modules.md`: the NES-vs-Amiga diagnosis (NES = ideal
oscillators; Paula = 8-bit looped single-cycle samples with no interpolation), the
"write a real ProTracker MOD and render via ffmpeg's libopenmpt demuxer" route,
every MOD format gotcha that cost a debug cycle, and Jim's preferences.

Artifacts: `music/chip/` holds `paula-hero.mod`, `copper-bars.mod`,
`_mod-medley.mp3` (2:13), and `_mod-source.zip`.

## Licensing — DSK, GRANTED

`DSK Asian DreamZ` grants **use** (private and commercial) only; the font itself
was not redistributable. Jim emailed **dskmusic@gmail.com** (Victor Castilla,
Spain) on 2026-10-05 and got a **written yes the same day**: a reduced,
downsampled subset of the five used presets (Pipa, Pipa tremolo, Guzhen, Erhu,
Ban-di) may ship in the open-source repo. Record: `music/soundfonts/PERMISSION-DSK.md`.

Two obligations come with it: credit `Instruments: DSK Music (dskmusic.com)` with
a link in the credits and README, and send him a link once it is live. Jim is
sending him the POC preview himself. Note the grant is for the **five melodic
presets only**; DSK percussion is not covered and would need a second ask.

Either way the **pre-rendered OGG route carries no licensing problem**, since
music made with the instrument is covered by the use grant. The permission only
matters for shipping the font, which it now unblocks. Details in `music/SOURCES.md`.

## Working conventions

- No em dashes in prose written for other people. Jim considers them an AI tell.
- One final message per task, no progress pings. One-shot self-removing cron jobs.
- Concise; Jim is a Linux novice. Never ask him to hand-type a long command.
- He is a foreigner in China and his wife Marie handles KYC signups.