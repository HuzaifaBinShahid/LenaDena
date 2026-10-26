# Voice balance entry with Deepgram

LenaDena can turn a short spoken **individual** balance into a reviewable draft. It supports a deliberately simple first version: English or Urdu is selected before recording, a short clip is transcribed by Deepgram, and the app extracts an amount, person, balance direction, type, title, and date. Nothing reaches the ledger until the user reads the draft and chooses **Save balance**.

## Security and data flow

```text
Microphone → LenaDena app → authenticated LenaDena API → Deepgram transcription
                                      ↓
                          reviewable draft in the app
                                      ↓ (only after Save balance)
                              normal ledger endpoint
```

- `DEEPGRAM_API_KEY` stays on the Fastify server. Never place it in `frontend/.env.local`, an `EXPO_PUBLIC_*` variable, source control, a build log, or the app binary.
- The app sends an authenticated, short audio recording to `POST /v1/voice/transcribe`; the server forwards the in-memory clip to Deepgram and returns text only.
- Audio is not written to the LenaDena database, Storage, or an app ledger record. The server keeps it only while forwarding that request.
- The server sends saved person and group names as optional recognition hints, never account IDs, amounts, balances, or transaction history.
- Transcription is rate limited to 20 requests per signed-in user per minute. Financial writes remain protected by the existing normal confirmation and idempotent transaction path.

## Configure the key

1. In the Deepgram Console, create an API key for the LenaDena backend.
2. In your existing ignored `backend/.env`, add this one line and replace the placeholder locally:

   ```dotenv
   DEEPGRAM_API_KEY=replace_with_your_deepgram_api_key
   ```

   The tracked [backend/.env.example](../backend/.env.example) contains the same placeholder. Do not edit or commit another person's real `.env` file.
3. Restart the backend. Environment files are read when the server starts.
4. For a deployed API, set the same secret in that host's server environment, then redeploy/restart it. The Android app must point `EXPO_PUBLIC_API_URL` at that backend; putting the key only on your laptop will not enable a Loadly-installed APK using a remote API.

There is no frontend Deepgram variable to configure. The mobile app has no access to the secret.

## Build requirement

Voice balance entry uses Expo Audio, a native module. Rebuild the Android app after pulling this change:

```bash
pnpm check:nativewind
pnpm run dist:android
```

Expo Go cannot validate this feature. Use the generated Android build on a physical device. For local device testing, run the backend and set `EXPO_PUBLIC_API_URL` to your computer's reachable LAN address before building or starting Expo.

## Test checklist

1. Start the backend with the key set and open **Add entry → Speak it** (or **Fill by voice** inside the individual form).
2. Choose the spoken language before recording. Start, say one short command, then stop.
3. Check the displayed transcript and the extracted balance before saving. Correct it with **Edit in form** whenever any detail is wrong.
4. Confirm that nothing appears on Home or Activity until **Save balance** is pressed.

English examples:

- “I owe Ali 500 rupees for chai.”
- “I lent Sara fifteen hundred cash for books yesterday.”

The first should create an outgoing expense; the second an incoming loan dated yesterday. If a name is already saved in People, LenaDena matches it case-insensitively. A new recognized name remains reviewable and follows the normal create-person-on-save behavior.

## What the parser intentionally does not guess

The local draft parser is conservative. It will never save a draft if it cannot find all four required items: amount, balance direction, person, and title. It highlights the missing fields and makes **Edit in form** the safe path. It recognizes common English money words and `Rs`/`PKR`, plus selected Roman Urdu balance wording; it does not claim to interpret every mixed-language or ambiguous phrase.

Version one is for private individual balances, not group expense splitting. Users choose English or Urdu for each clip rather than relying on automatic language switching. Treat Deepgram's transcript and the parser's output as suggestions—confirmation is the source of truth.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| “Voice transcription is not configured” | Add `DEEPGRAM_API_KEY` to the backend environment and restart/redeploy the API. |
| 401/403 from Deepgram | Create or replace the server key in Deepgram Console; do not put it in the app. |
| “LenaDena can't reach its server” | Verify `EXPO_PUBLIC_API_URL` is reachable from the phone and the backend CORS/network configuration accepts the app. |
| Microphone permission denied | Enable Microphone for LenaDena in the device settings, then try again. |
| The draft has missing or incorrect details | Use **Edit in form**. Do not save until the amount, direction, person, date, and purpose are correct. |
| The feature is absent or the app crashes in Expo Go | Install a newly built development/distribution APK; Expo Audio requires a native build. |

## Implementation map

- Mobile recording and confirmation UI: `frontend/src/features/voice/VoiceEntrySheet.tsx`
- Conservative local draft parser: `frontend/src/features/voice/grammar.ts`
- Authenticated app upload: `frontend/src/lib/api.ts`
- Server route: `POST /v1/voice/transcribe`
- Server-only Deepgram client: `backend/src/voice/DeepgramTranscriber.ts`

The endpoint deliberately returns only `{ transcript, provider, language }`; it cannot write, settle, or alter a balance.
