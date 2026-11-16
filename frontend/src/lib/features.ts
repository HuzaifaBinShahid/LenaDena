/**
 * Everything that uses the microphone (the "Speak it" entry, "Fill by voice", the mic icons that dictate into a field,
 * and the "Voice language" setting) is off. Voice entry was not accurate enough to ship (2026-11-16), and without it the
 * app asks for no microphone permission at all, which keeps store review and the privacy forms simple.
 *
 * To bring it back, set `EXPO_PUBLIC_VOICE_ENTRY=true` in `frontend/.env.local` and rebuild: the same flag puts the
 * Android microphone permission back (`app.config.ts`).
 */
export const VOICE_ENABLED = process.env.EXPO_PUBLIC_VOICE_ENTRY === "true";
