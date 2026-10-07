# MIDI / symbolic music generation — options survey

Checked 2026-10-05 against the **HuggingFace API directly** (`/api/models`) plus papers,
not blog round-ups. Sizes are the sum of real weight files from the API, not estimates.

The decisive axis for this project is **does the model emit symbolic output (MIDI/ABC) or
only audio?** Symbolic output is editable, resolves to a few KB, and can be split into
adaptive stems. Audio-only output cannot.

## A. Symbolic models — emit MIDI or ABC

| model | weights | output | why it's interesting |
|---|---|---|---|
| **NotaGen** + `anjieliu/notagen-guzheng` | 0.97 GB | ABC | ABC-notation generation; the **guzheng fine-tune** ships code+dataset+weights (Zenodo 19868672). Closest thing to a real 民乐 model. |
| **Text2MIDI** (AAAI 2025) | 0.90 GB | **MIDI** | Caption → MIDI end-to-end. Trained on MidiCaps (168k MIDI+caption pairs). |
| **MIDI-LLM** `slseanwu/MIDI-LLM_Llama-3.2-1B` | 1.11 GB (Q4 GGUF) | MIDI tokens | Has **GGUF releases** → `ollama pull` and done. Llama-3.2-1B backbone. |
| **MIDI-GPT** `Metacreation/MIDI-GPT` | 1.15 GB | MIDI | Multitrack **infilling at track and bar level** — this is "adaptive stems" as a model. |
| **skytnt/midi-model** (MidiJourney) | 0.94 GB | MIDI | Pick instruments, BPM, time signature, key — **or feed it an existing MIDI as a prompt**. |
| **ChatMusician** `m-a-p/ChatMusician` | ~4 GB (Q4 GGUF) | ABC | 7B LLM, 159 likes, GGUF + MLX builds available. |
| **MuPT v1** `m-a-p/MuPT` | 0.38 / 3.93 GB | MIDI tokens | 190M / 550M / 1.97B symbolic music foundation LMs. |
| **sander-wood/text-to-music** | 0.56 GB | ABC | text → ABC (ssar). |
| **MuseCoco** | 14.55 GB | MIDI | text → attribute → music, two-stage. |
| **SheetSage2** `m-a-p/SheetSage2` | 0.23 GB | sheet/MIDI | Newest m-a-p release (2026-10-04), GGUF exists. |
| **PianoFlow** `SyMuPe/PianoFlow-base` | 0.10 GB | MIDI | Piano-focused, tiny. |
| **Magenta** (MelodyRNN, MusicVAE, ImprovRNN) | small | MIDI | The original MIDI-native toolkit. **TF1-era** — painful to install in 2026. |

## B. Audio-only — no MIDI, cannot give editable/adaptive stems

Suno · Udio · YuE2 · ACE-Step 1.5 · Stable Audio 3 · MusicGen · MOSS-Music-8B ·
Alibaba **fun-music-v1** · Qwen-Music.

Great sound, zero editability. Each variation is a fresh, unrelated render, so they cannot
drive a crossfade between intensity layers.

## C. Hosted tools that DO export MIDI

AIVA (MIDI export; free → €11–33/mo) · Soundful (Pro+) · MIDI Agent (DAW plugin) ·
Yuma / AbletonGPT · Scaler 2 · Orb Composer · RapidComposer · Band-in-a-Box.

## Architectural conclusion

**Do not generate music at runtime in the game.** Latency, nondeterminism, and the client
has no GPU. Use these models **offline as a composition assistant**, curate the output by
ear, then pre-render to OGG — the architecture already in §5.2.

The best use of a model here is **MIDI-prompted variation**, not cold text prompts:
`skytnt/midi-model` and `MIDI-GPT` both accept an existing MIDI as input, so feeding them
`jinghong-dawn.mid` yields variations of a style already agreed, instead of a lottery.

## Runnability

**Laotze (192.168.1.29) = RTX 4070 12 GB, 31 GB RAM, 24 cores** — every model in section A
runs comfortably. The 0.1–4 GB sizes make this a non-issue; ChatMusician 7B at Q4 is the
largest and still fits VRAM with room.

Note: 6 of the models in section A emit **ABC notation**, which needs a converter
(`abc2midi`, package `abcmidi`) to become MIDI. Not currently installed.

## Shortlist worth actually testing

1. `notagen-guzheng` — real 民乐 training data, 1 GB.
2. `skytnt/midi-model` — prompted with our own `lanterns.mid`.
3. `MIDI-LLM` — 1B via Ollama, instant, MIDI-native.
4. `MIDI-GPT` — for bar/track-level infilling as an adaptive-layer generator.