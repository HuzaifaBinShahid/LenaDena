# Voice entry research history ("say it instead of filling the form")

> **Current implementation:** LenaDena now uses a server-side Deepgram transcription key for short English or Urdu individual-balance commands, then shows a confirmation-first draft. This older on-device-only design note is retained as research context; it is not the current technical contract. Use [Deepgram voice entry](DEEPGRAM_VOICE.md) for setup, privacy rules, testing, and troubleshooting.

Goal: the owner says *"add this expense to Sharjeel's name where I owe him 1500"* and LenaDena records it, from the home screen, the individual-balance form and the group-expense form — **without any AI service** (no LLM, no cloud parsing, no API keys, no per-request cost).

Verdict: **yes, this is buildable and it is the right approach for this app**, because the domain is tiny and closed (an amount, a direction, a person we already know, an optional title, date and group). The two halves are:

1. **Speech → text**: already in the app (`expo-speech-recognition`, on-device). Not AI we build or pay for; it is the OS dictation engine (Apple Speech / Google Speech Services) that also powers the keyboard mic.
2. **Text → a draft entry**: a deterministic grammar we own (`features/voice/grammar.ts`) — patterns, a number parser, a date parser and fuzzy matching against the user's own People, groups and members. No model, no training, fully testable, works offline.

The product rule that makes this reliable: **voice never saves anything by itself.** It fills a draft card that the user confirms with one tap. Every field is editable, and anything unparsed is left empty and highlighted rather than guessed.

## 1. Speech recognition: what the platforms actually give us

Facts (checked against the `expo-speech-recognition` docs, v57, already a dependency):

| Capability | Android | iOS | Notes |
| --- | --- | --- | --- |
| On-device recognition (`requiresOnDeviceRecognition`) | 13+ with a downloaded model | 13+ | Today's `features/capture/speech.ts` forces it, so nothing leaves the phone |
| Continuous mode (longer sentences) | 13+ | 17+ | Below that: recognition ends on silence (~3s on iOS 17-) |
| `contextualStrings` (bias recognition toward given words) | 12+ | 17+ | "Seems to work better on iOS"; Apple documents ~100 phrases max and it is **ignored for on-device recognition on iOS** |
| Punctuation (`addsPunctuation`) | 13+ (on-device only) | 17+ | We strip punctuation before parsing anyway |
| Silence timeout (`EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS`) | yes | n/a | Needed so a pause mid-sentence doesn't cut the user off |
| Offline model check / download (`getSupportedLocales`, `androidTriggerOfflineModelDownload`) | 13+ | n/a | Lets us prompt "download the voice model" instead of failing |
| Expo Go | not available | not available | Needs the dev build / APK (already true for the existing mic buttons) |

Consequences for us:

- **Names are the weak point, and `contextualStrings` is the fix.** We pass the user's own People names, group names and member names (capped at 100, most-recently-used first). On Android this biasing works with on-device recognition; on iOS it only applies when recognition runs through Apple's servers. So iOS gets a per-user choice: stay fully on-device (default, private) or turn on "better name recognition" which uses Apple's service. Android needs no such trade-off.
- **Locale matters more than anything else.** The app already has a voice-language preference. For Pakistan, `en-PK` generally has no offline model; `en-US`, `en-GB` and `en-IN` do. `en-IN` usually handles South-Asian names and accents best. We should check `getSupportedLocales()`, show what's installed, and offer the download prompt.
- **Numbers come back inconsistently** — sometimes "1500", sometimes "fifteen hundred", sometimes "1,500". The parser must accept all three (see below). Roman-Urdu numerals ("pandrah sau", "das hazaar") only appear if the user speaks them; we map the common ones.

## 2. The parser (no AI)

Pure TypeScript, unit-tested, no new dependencies. Pipeline:

```
transcript → normalise → slot extraction → resolve against the user's data → VoiceDraft (+ per-field confidence)
```

**Normalise**: lowercase, strip punctuation, collapse spaces, expand "rs."/"pkr"/"$", keep the original spans so the review card can highlight what came from where.

**Amount** — accepts, in order: digits with separators (`1,500` → 1500), `1.5k` / `2k`, English number words (`fifteen hundred`, `two thousand five hundred`), South-Asian words (`sau`=100, `hazaar`=1000, `lakh`=100000), decimals only for decimal currencies (`12.50`). Rejects numbers that are clearly dates or times ("3 October", "at 7"). Currency from spoken words (`rupees`, `dollars`, `$`) else the group's currency, else the user's main currency.

**Direction** — the app's core meaning, and conveniently the brand name itself (*lena* = take, *dena* = give):
- *You owe* (outgoing): "I owe", "owe him/her/them", "he paid for me", "she lent me", "I borrowed", "mujhe dena hai", "dena hai".
- *Owed to you* (incoming): "owes me", "he owes", "I paid for him", "I lent", "I gave", "I covered", "lena hai".
- If no phrase matches, the field stays empty and the card asks — we never guess who owes whom.

**Person** — candidate names are matched against saved People, then group members, using the existing `normalizeSearchText` plus a similarity check, so "sharjeel", "Sharjil" and "Sarjeel" resolve to the same saved person. An unmatched name becomes a *new person* chip (the API already creates people from a name). Learned aliases: when the user corrects a name in the review card, we store transcript→person locally so the same mishearing resolves next time. That is a lookup table, not AI.

**Kind** — "loan", "lent", "borrowed", "cash" → loan; otherwise expense.

**Date** — "today" (default), "yesterday", "day before yesterday", weekday names ("on Friday" = the most recent one), "2 days ago", "3 October" / "Oct 3". Anything else → today, flagged so the card shows the date chip in an "assumed" state.

**Group** — "in Weekend crew", "with the flat", "group Weekend crew" matched fuzzily against group names; if the phrase names a group, the draft becomes a group expense, otherwise an individual balance.

**Title** — the words after "for" ("for dinner", "for the taxi"), else the leftover noun phrase, else empty (the card asks). Never invented.

**Split (group only)** — "split equally" / "between us" → equal across all members (the app's default). "Exact" and "percentage" splits stay form-only; voice sets equal or leaves it for the form.

## 3. Use-case matrix

Confidence below is an engineering expectation to be verified with the on-device test corpus (§5), not a measured number.

| # | What the user says | Result | Expected reliability | If it goes wrong |
| --- | --- | --- | --- | --- |
| 1 | "add this expense to Sharjeel's name where I owe him 1500" | Individual, expense, you owe, Sharjeel, Rs 1,500, today | High | Any wrong chip is one tap to fix |
| 2 | "Sharjeel owes me 2000 for dinner" | Individual, owed to you, title "dinner" | High | — |
| 3 | "I lent Ali 5000 cash yesterday" | Individual, loan, owed to you, yesterday | High | — |
| 4 | "add 2400 dinner at Monal in Weekend crew split equally" | Group expense, equal split across members | Medium-high | Group/participants shown as chips before saving |
| 5 | "mujhe Sharjeel ko 1500 dena hai" (Roman Urdu mixed) | Individual, you owe | Medium | Depends on the locale model; English words parse, Urdu words are mapped |
| 6 | "chai 300" (fragment, no person, no direction) | Draft with amount + title only | By design | Card highlights the two missing fields |
| 7 | "add 1500 to Sharjeel" (direction unstated) | Amount + person, direction empty | By design | Card asks "you owe / owed to you" — never guessed |
| 8 | "I paid Sharjeel 1500 back" | Phase 2: offers to settle matching open entries | Medium | Phase 1 treats it as a normal entry |
| 9 | "how much do I owe Sharjeel?" | Phase 2: an on-screen answer, no write | High (read-only) | — |
| 10 | Two entries in one breath ("500 for chai and 2000 to Ali") | Phase 1 takes the first, card shows the rest of the transcript | By design | User repeats for the second |
| 11 | Name not in People yet ("add 1500 to Zohaib") | New-person chip; saving creates Zohaib | High, spelling may need a fix | Fix once; biasing improves afterwards |
| 12 | Silence / no speech / permission denied | Clear message, form untouched | High | Existing toast paths |
| 13 | No offline model installed (Android) | Offer "Download voice model" (system dialog) | High | Falls back to typing |
| 14 | Very noisy input, nonsense transcript | Card opens with the raw transcript and empty fields | By design | "Edit as a form" button |

The honest summary: **the slots the app cares about most — amount, direction, person — should be right most of the time; titles and unusual dates will often need a touch-up.** Because the review card is one tap away from saved, "mostly right" is a big win over typing five fields, which is exactly the outcome the owner asked for.

## 4. UX

**Entry points** (as requested):
1. **Home**: a mic action next to the "+" in the dock (long-press "+", plus a visible mic in the add-entry sheet as a third option: "Individual · Group · Speak it").
2. **Individual balance form**: a "Fill by voice" button at the top of the form (the per-field mic buttons stay for dictating a title or note).
3. **Group expense form**: same, scoped to the open group ("in Weekend crew" is implied).

**The flow**:
1. Tap → a `BottomSheet` opens in listening state: the three bouncing dots we already use, a live partial transcript, a big "Stop" target, and a hint line that rotates through examples ("Try: I owe Sharjeel 1500 for dinner").
2. On a final result the sheet becomes the **draft card**: the sentence at the top with the understood parts underlined, then chips — person, direction (coral "You owe" / mint "Owed to you"), amount, date, title, and group when relevant. Missing required chips pulse in coral. Every chip opens the existing control (PersonPicker, the segmented toggle, the amount keypad, DatePickerSheet).
3. "Save" writes through the normal `LedgerProvider` call (same validation, same idempotency, same toast + undo). "Edit as a form" hands everything to the existing form, prefilled.
4. Accessibility: the whole flow works with a screen reader; reduced motion keeps the dots static; a "Type instead" button is always visible.

**Privacy**: on-device by default, nothing recorded or stored. Any optional iOS server-side mode is behind an explicit setting that says what it does.

## 5. How we prove accuracy

- A **test corpus** of ~120 utterances (English, Pakistani English, Roman-Urdu mixes, fragments, hostile cases) with the expected parse, run in Vitest on every change — this measures the *parser*, deterministically.
- An **on-device check sheet**: the same sentences spoken on a real Android phone and an iPhone, recording what the recogniser returned versus what the parser produced, so we can tell recogniser errors from parser errors and tune the phrase lists.
- A hidden **"why did it parse this way"** debug view in dev builds (the spans each rule matched), so failures are diagnosable without guesswork.

## 6. Plan and effort

**Phase 1 — individual balances by voice** (the owner's example sentence): grammar + number/date parsers + matching, the listening/draft sheet, home and individual-form entry points, contextual biasing, locale/model checks, test corpus. ~1–1.5 days of agent work.

**Phase 2 — groups and settling**: group expense sentences, split-equally, "I paid X back" → settle matching entries, member matching. ~0.5–1 day.

**Phase 3 — polish**: learned aliases for misheard names, spoken balance questions ("how much do I owe Sharjeel"), multi-entry sentences, a "voice tips" screen. ~0.5 day.

No new dependencies are required; everything builds on `expo-speech-recognition`, Reanimated, the existing `BottomSheet`, `ListeningDots`, People matching and forms.

## 7. Limits to be honest about

- **A dev build or APK is required** (Expo Go has no speech recognition) — already the case today.
- **Sentences far outside the grammar won't parse.** Without an LLM there is no "understanding", only patterns; the fallback is always the prefilled form, never a wrong save.
- **Pure Urdu sentences** depend on an Urdu model being installed; mixed English/Roman-Urdu is the realistic target.
- **iOS name biasing** only applies when not using strict on-device mode (Apple's limitation).
- If, later, the owner wants free-form understanding ("split last night's dinner with the flat three ways except Hamza"), that needs a model — either a paid API or an on-device small model (whisper.rn / ExecuTorch) — and is a separate decision.
