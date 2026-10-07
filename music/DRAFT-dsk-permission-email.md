# Draft email to DSK Music (Victor Castilla) — permission to bundle a subset font

To: dskmusic@gmail.com
Subject: Permission to bundle a small subset of Asian DreamZ in a free open-source learning app?

---

Dear Victor,

I'm Jim Cain, a hobbyist developer, and I've been using your Asian DreamZ
soundfont for a free Mandarin-learning game I'm building — an open-source
vocabulary game that runs in the browser.

The music is original pentatonic pieces I compose as MIDI, and I render them
with your Pipa, Pipa tremolo, Guzhen, Erhu and Ban-di voices. They sound
wonderful, and honestly nothing else free comes close.

I've read your site, where you kindly allow private and commercial use — that
covers the music itself. What I'd like to ask about is something smaller but
different. I'd like to ship a soundfont with the game, so the browser can play
the music directly instead of me pre-rendering every track.

Specifically, I'd like your permission to:

1. Create a **reduced, downsampled subset** of Asian DreamZ containing only
   those five presets. The samples would be converted to a lower sample rate and
   mono. It's for phone speakers, so this cuts it to a couple of megabytes.
2. **Distribute that subset publicly** as part of the game's open-source
   repository on GitHub, so anyone who clones or plays the game gets the sound.

I'd credit you prominently — a line such as "Instruments: DSK Music
(dskmusic.com)" in the credits and README, with a link. The project is free,
there's no revenue, and nothing is sold.

If you're not comfortable with this, that's completely fine — I'll keep shipping
only rendered audio and won't include the font. Either way, thank you for making
these. They've made this project possible.

Best regards,
Jim Cain

---

## The one-line grant to ask for, if he says yes

If he replies with a plain "sure, go ahead", that's a use grant phrased loosely,
and it would leave us guessing later. Worth asking him to confirm a sentence
like this, which makes the permission unambiguous:

> Permission granted to include a modified, downsampled subset of the DSK Asian
> DreamZ soundfont (Pipa, Pipa tremolo, Guzhen, Erhu and Ban-di presets) in your
> open-source project, and to redistribute it publicly as part of that project,
> with credit to DSK Music. — Victor Castilla, DSK Music

## Notes

* Optional, adds concreteness: the proof-of-concept game is already live at
  <https://jimrcain.github.io/BubbleMandarin/>. Including it shows good faith.
* If he answers by asking questions rather than granting, answer them and ask
  again — a reply that dodges the two numbered points isn't permission.
* **File the reply.** Save whatever he sends as the licence record, e.g.
  `music/soundfonts/PERMISSION-DSK.md`, so the permission travels with the repo.
* Nothing about the current OGG delivery depends on this. The rendered audio is
  already clear; this only unblocks shipping a font.