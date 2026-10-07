# Content migration plan — decks, bands, menu names

**Status:** proposal for v1, 2026-10-05. Source: measured audit of the POC (`spec/20-category-audit.md`).
Jim's direction: *"We can merge some of them, for example, animals. You are also free to expand any decks with any words you see fit."* and *"I do not think we need to conform to HSK to grade the word difficulty. I think the more common words should be considered easy and the less common words: difficult."*

---

## 1. Word level is derived from corpus frequency, not HSK

Scored every unique word with **wordfreq** (Zipf frequency, `zh`) — rank-calibrated cut points:

| Band | Condition | ≈ Chinese rank | Unique words |
|---|---|---|---|
| `simple` | Zipf ≥ 5.00 | top ~1,200 | 674 (29%) |
| `medium` | 4.20 ≤ Zipf < 5.00 | ~1,200–5,600 | 863 (38%) |
| `hard` | Zipf < 4.20 | beyond ~5,600 | 756 (33%) |

Calibration: Zipf 5.11 = Chinese rank 1,000 (出版); Zipf 4.31 = rank 5,000 (武力). The corpus skews rare — only **23% of its words are in the top 1,000** Chinese words and 12.6% in the top 500.

This fixes the inversion. Formerly HSK 5 was 100% `simple` while Sports was 70% `hard`; now every HSK deck has all three bands and 排球 (3.60) sorts below 安排 (5.03), which is the truth.

### 1.1 Two things the data forced on me

**(a) Rename the bands.** `hard` for 排球 *volleyball* reads as nonsense even though it is correct — the word is rare. Label the control by what it measures: **Common · Mid · Rare**. Same three buckets, honest name.

**(b) Word level must be a global setting, not a per-deck filter.** Thematic decks are inherently rare-heavy, so `simple` is nearly empty in them:

| Deck | simple | medium | hard |
|---|---|---|---|
| Fruits | 1 | 0 | 29 |
| Vegetables | 0 | 1 | 29 |
| Colors | 0 | 6 | 24 |
| Furniture | 0 | 6 | 24 |
| Clothing | 0 | 4 | 22 |
| Animals (pets) | 1 | 4 | 6 |
| HSK 1 | 105 | 42 | 12 |
| HSK 5 | 390 | 397 | 76 |

Fruits is 29 hard of 30. That is not a defect — 芒果 and 猕猴桃 *are* rarer than 我 and 是 — but it means a per-deck filter would be dead in most decks, which is exactly the §1.9 finding. Filter globally over the pool instead. HSK decks, being core vocabulary, get all three bands (all five decks: 3 usable bands each, formerly 1).

### 1.2 Caveat on the frequency source

`wordfreq`'s Chinese data is a blend (subtitles + Wikipedia) and is noisy at the edges: 12 HSK 1 words score below 4.20, and 羽绒服 *down jacket* = 1.07 and 椰汁 *coconut milk* = 1.66 are implausibly low. Bands are good enough to sort a deck; they are not precise. **Commit the bands as data** (§4.3) so a hand correction sticks, and never recompute at build time.

---

## 2. Deck consolidation: merge the three animal decks

`Animals (pets)` 11 + `Animals (farm)` 14 + `Animals (wild basic)` 23 = **`Animals`, 48 words**. The pets/farm/wild split was arbitrary (is a rabbit a pet or a farm animal?), all three were too small to play alone, and two had **no usable band at all**.

Post-merge band spread: 2 simple / 12 medium / 34 hard.

No other merges are recommended. `Food`/`Drinks` are both small but genuinely distinct — and high-value for a restaurant family.

---

## 3. Deck expansion — 45 words across five decks

Pinyin auto-generated with `pypinyin` (子-suffix forced to neutral tone), frequency band from the §1 scheme. **Pinyin needs a hand pass** — it is machine output.

### Family (immediate) — 15 → 35

| Hanzi | Pinyin | English | Zipf | Band |
|---|---|---|---|---|
| 外公 | wài gōng | maternal grandfather | 3.58 | `hard` |
| 外婆 | wài pó | maternal grandmother | 3.73 | `hard` |
| 叔叔 | shū shū | uncle (father's younger brother) | 4.25 | `medium` |
| 伯伯 | bó bo | uncle (father's older brother) | 3.50 | `hard` |
| 姑姑 | gū gū | aunt (father's sister) | 3.95 | `hard` |
| 舅舅 | jiù jiù | uncle (mother's brother) | 3.66 | `hard` |
| 姨妈 | yí mā | aunt (mother's sister) | 3.75 | `hard` |
| 表哥 | biǎo gē | older male cousin | 3.61 | `hard` |
| 表姐 | biǎo jiě | older female cousin | 3.36 | `hard` |
| 堂弟 | táng dì | younger male cousin | 2.75 | `hard` |
| 孙子 | sūn zi | grandson | 4.29 | `medium` |
| 孙女 | sūn nǚ | granddaughter | 3.80 | `hard` |
| 侄子 | zhí zi | nephew | 3.75 | `hard` |
| 侄女 | zhí nǚ | niece | 3.53 | `hard` |
| 岳父 | yuè fù | father-in-law (wife's father) | 3.72 | `hard` |
| 岳母 | yuè mǔ | mother-in-law (wife's mother) | 3.38 | `hard` |
| 女婿 | nǚ xù | son-in-law | 4.01 | `hard` |
| 儿媳 | ér xí | daughter-in-law | 3.49 | `hard` |
| 亲戚 | qīn qī | relatives | 4.37 | `medium` |
| 阿姨 | ā yí | auntie | 4.32 | `medium` |

### Drinks — 18 → 30

| Hanzi | Pinyin | English | Zipf | Band |
|---|---|---|---|---|
| 可乐 | kě lè | cola | 3.97 | `hard` | *(already in corpus — add to this deck)*
| 橙汁 | chéng zhī | orange juice | 2.40 | `hard` |
| 矿泉水 | kuàng quán shuǐ | mineral water | 3.53 | `hard` |
| 白开水 | bái kāi shuǐ | plain boiled water | 2.42 | `hard` |
| 白酒 | bái jiǔ | baijiu (liquor) | 3.58 | `hard` |
| 汤力水 | tāng lì shuǐ | tonic water | 2.24 | `hard` |
| 拿铁 | ná tiě | latte | 3.63 | `hard` |
| 美式咖啡 | měi shì kā fēi | americano | 2.58 | `hard` |
| 椰汁 | yē zhī | coconut milk | 1.66 | `hard` |
| 能量饮料 | néng liàng yǐn liào | energy drink | 3.25 | `hard` |
| 冰水 | bīng shuǐ | ice water | 3.23 | `hard` |
| 果茶 | guǒ chá | fruit tea | 3.23 | `hard` |

### Clothing — 26 → 31

| Hanzi | Pinyin | English | Zipf | Band |
|---|---|---|---|---|
| 内衣 | nèi yī | underwear | 4.00 | `hard` |
| 睡衣 | shuì yī | pajamas | 3.71 | `hard` |
| 大衣 | dà yī | overcoat | 3.57 | `hard` |
| 羽绒服 | yǔ róng fú | down jacket | 1.07 | `hard` |
| 口罩 | kǒu zhào | face mask | 3.99 | `hard` |

### Food — 26 → 32

| Hanzi | Pinyin | English | Zipf | Band |
|---|---|---|---|---|
| 牛肉 | niú ròu | beef | 4.16 | `hard` |
| 猪肉 | zhū ròu | pork | 4.14 | `hard` |
| 鸡肉 | jī ròu | chicken meat | 3.78 | `hard` |
| 盐 | yán | salt | 4.34 | `medium` |
| 酱油 | jiàng yóu | soy sauce | 3.61 | `hard` |
| 醋 | cù | vinegar | 3.70 | `hard` |

### Body parts — 29 → 31

| Hanzi | Pinyin | English | Zipf | Band |
|---|---|---|---|---|
| 指甲 | zhǐ jiǎ | fingernail | 3.79 | `hard` |
| 嗓子 | sǎng zi | throat | 3.53 | `hard` |

`可乐` already exists elsewhere in the corpus, which is fine — one word, one id (§4.2).

---

## 4. The menu points at eight decks that do not exist

`CategoryMenu.tsx`'s `GROUPS` array names categories that do not match any vocabulary filename. Because the menu name resolves to nothing, **these decks are unselectable — ~236 words are dead in the UI.**

| Menu says | File is |
|---|---|
| `Numbers (1‑20)  ← U+2011 non-breaking hyphen` | `Numbers (1-20)` |
| `Food (snacks/meals)` | `Food` |
| `House / rooms` | `House-rooms` |
| `Movement verbs` | `Body actions (run, jump, sit, clap, etc.)` |
| `Emotion/state verbs` | `Emotion-state verbs` |
| `Size & shape` | `Size-shape` |
| `Months / seasons` | `Months-seasons` |
| `Greetings & polite phrases` | `Greetings-polite-phrases` |

A `Food` deck cannot be played today. This is the sharpest argument for §4.1 (one home for category identity) and for §1.9's deck list being **generated from the data**, never hand-listed: a hand-maintained name array drifts from the filesystem, and the failure is silent.

---

## 5. Post-migration inventory

50 decks, 3087 entries, 2338 unique words.

| Deck | words | Common | Mid | Rare | usable bands |
|---|---|---|---|---|---|
| HSK 5 | 863 | 390 | 397 | 76 | 3 |
| HSK 4 | 276 | 130 | 109 | 37 | 3 |
| HSK 3 | 258 | 134 | 97 | 27 | 3 |
| HSK 1 | 159 | 105 | 42 | 12 | 3 |
| HSK 2 | 151 | 62 | 58 | 31 | 3 |
| Animals | 48 | 2 | 12 | 34 | 2 |
| Family (immediate) | 35 | 5 | 13 | 17 | 2 |
| Chinese license plates | 33 | 3 | 11 | 19 | 2 |
| Food | 32 | 0 | 8 | 24 | 1 |
| Clothing | 31 | 0 | 4 | 27 | 1 |
| Body parts | 31 | 3 | 13 | 15 | 2 |
| Emotion-state verbs | 30 | 4 | 14 | 12 | 2 |
| Prepositions & location words | 30 | 11 | 13 | 6 | 2 |
| Time expressions (relative) | 30 | 16 | 12 | 2 | 2 |
| School objects | 30 | 3 | 4 | 23 | 1 |
| Health | 30 | 2 | 6 | 22 | 1 |
| Weather | 30 | 1 | 8 | 21 | 1 |
| Nature | 30 | 2 | 17 | 11 | 2 |
| Personality traits | 30 | 1 | 13 | 16 | 2 |
| Nationalities & languages | 30 | 4 | 7 | 19 | 1 |
| Common adverbs of degree | 30 | 16 | 11 | 3 | 2 |
| Sports | 30 | 2 | 3 | 25 | 1 |
| Months-seasons | 30 | 0 | 15 | 15 | 2 |
| Mental verbs | 30 | 10 | 13 | 7 | 2 |
| Size-shape | 30 | 5 | 11 | 14 | 2 |
| Daily routines | 30 | 20 | 6 | 4 | 1 |
| House-rooms | 30 | 1 | 8 | 21 | 1 |
| Physical conditions | 30 | 2 | 14 | 14 | 2 |
| Shopping & money | 30 | 3 | 12 | 15 | 2 |
| Numbers (1-20) | 30 | 9 | 18 | 3 | 1 |
| Furniture | 30 | 0 | 6 | 24 | 1 |
| Body actions (run, jump, sit, clap, etc.) | 30 | 7 | 7 | 16 | 1 |
| Vegetables | 30 | 0 | 1 | 29 | 1 |
| Emotions | 30 | 6 | 16 | 8 | 1 |
| Social activities | 30 | 3 | 11 | 16 | 2 |
| Cooking & household verbs | 30 | 0 | 10 | 20 | 2 |
| Travel & directions | 30 | 3 | 13 | 14 | 2 |
| Drinks | 30 | 1 | 4 | 25 | 1 |
| Frequency adverbs | 30 | 10 | 14 | 6 | 2 |
| Days of week | 30 | 10 | 12 | 8 | 2 |
| Opposites | 30 | 12 | 17 | 1 | 2 |
| Transportation | 30 | 2 | 6 | 22 | 1 |
| Greetings-polite-phrases | 30 | 3 | 9 | 18 | 1 |
| Occupations (basic) | 30 | 8 | 12 | 10 | 2 |
| Communication verbs | 30 | 16 | 8 | 6 | 1 |
| Modal verbs | 30 | 22 | 6 | 2 | 1 |
| Fruits | 30 | 1 | 0 | 29 | 1 |
| Hobbies | 30 | 4 | 6 | 20 | 1 |
| Colors | 30 | 0 | 6 | 24 | 1 |
| Sensory verbs | 30 | 5 | 8 | 17 | 1 |

**Decks still under 30 words:** none — all are now playable with a band or two usable.

**Decks with fewer than 2 usable bands:** 23. Band filtering is a global setting (§1.1b), so this is informational, not blocking.
