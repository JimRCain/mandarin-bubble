# Permission record: DSK Asian DreamZ (DSK Music / Víctor Castilla)

**Status: GRANTED.** Written permission to create and publicly redistribute a
reduced subset of the font was given by the rights holder on 2026-10-05.

## The grant

From: Víctor Castilla, DSK Music `<dskmusic@gmail.com>`
Date: 2026-10-05 (same-day reply to the request below)

> Hello Jim,
>
> Absolutely, you have my permission to create the reduced version of those five
> instruments and distribute it with your open-source game as described.
>
> Thank you for asking, and I'm glad the instruments are useful for your project.
> The credit and link to DSK Music are more than enough.
>
> Once you have it implemented, please send me a link so I can take a look at the
> game and see how the instruments are being used.
>
> Best regards,
>
> Víctor Castilla
> DSK Music
> https://dskmusic.com

## What it covers

The grant answers, in order, the two points the request raised:

1. Creating a **reduced / downsampled subset** of the five presets the game uses:
   Pipa (bank 0 prog 0), Pipa tremolo (1), Guzhen (3), Erhu (4), Ban-di (5).
2. **Distributing that subset publicly**, meaning committing it to this project's
   open-source repository so anyone who clones or plays the game gets the sound.

"As described" refers to the request (reproduced in `DRAFT-dsk-permission-email.md`).
Permission is to the holder's terms as stated, and nothing here relaxes them.

## What it does NOT cover

- The **full, unmodified Asian DreamZ font** (11.5 MB). Redistribution is granted
  for the reduced subset only. Do not commit the original SF2.
- **Percussion (bank 0 prog 6).** The request named the five melodic presets, and
  the reply grants "those five instruments". If the game ever ships DSK
  percussion inside the subset font, ask him first.
- Any DSK instrument other than Asian DreamZ.

## Obligations we accepted

1. **Credit** in the credits and the README, a line such as
   `Instruments: DSK Music (dskmusic.com)`, with a link to https://dskmusic.com.
2. **Tell him when it is live.** He asked for a link once implemented. Jim is
   sending him the POC preview (https://jimrcain.github.io/BubbleMandarin/) in the
   meantime; the new repo link follows when the font actually ships.

## Provenance

The original message is in Jim's mail account and cannot be read from this
machine; this file reproduces the text Jim supplied, verbatim. It is kept beside
the font so the basis for including the subset travels with the repo. The request
itself is preserved in `../DRAFT-dsk-permission-email.md`.

Received 2026-10-05, roughly 22:30 CST / 16:30 CEST.

## Unchanged: the OGG route never needed this

The pre-rendered `.ogg` files are music *made with* the instrument, which DSK's
published use grant already covered. Only shipping the font needed permission, so
this record unblocks the MIDI + font route and nothing else.