# LenaDena Design System

## Direction

LenaDena uses a mixed dark-and-light interface: a near-black plum shell flows into saturated violet, translucent bordered surfaces create a lightweight glass effect, and pale lavender working surfaces keep financial information readable. Positive green, negative coral, and warning amber remain semantic colors rather than brand decoration.

The home gradient must continue behind the status-bar safe area. The pale workspace overlaps the gradient with a 32-point rounded top edge, a subtle highlight, and a restrained upward shadow so the transition feels layered rather than segmented.

The direction borrows proven information patterns without copying another product:

- [Spliit](https://spliit.app/) demonstrates fast group entry, explicit advanced splits, receipts, and concise balance views.
- [Tricount](https://www.tricount.com/en-in/) keeps positive and negative positions easy to scan and makes settlement the next obvious action.
- [Splitwise mobile](https://assets.splitwise.com/mobile) validates keeping groups, balances, and activity close to the main navigation.
- [Apple layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout) emphasizes alignment, safe areas, visual hierarchy, and adequate space around controls.
- [Apple tab-bar guidance](https://developer.apple.com/design/human-interface-guidelines/tab-bars) treats top-level navigation as a stable control layer and recommends fewer, consistently available tabs.
- The supplied [Weather App UI Design](https://www.figma.com/design/t4RGh4IOycjzrwngdZ7BEr/Weather-App-UI-Design--Community-?node-id=2-2214) establishes the plum, violet, lavender, and translucent-control visual reference.
- The supplied [Login / SignUp Web & Mobile App Design](https://www.figma.com/design/Iw7efQu0M9cFdaHizEifaM/Login---SignUp-Web---Mobile-App-Design--Community-?node-id=1-4) establishes the sign-up, sign-in, and app-lock composition.

## Authentication and lock screens

These screens follow the Login / SignUp reference, translated into LenaDena's palette:

- A deep night-to-plum sky fills the screen. `SpaceBackdrop` draws the scene in SVG: a mint-teal planet (the monogram's exchange dot) bleeding off the top right with marbled cloud bands and a tilted orbit ring, a lavender moon cropped at the left edge, violet nebula glow, stars, sparkles, and one shooting streak. The mint dot rides the near ring.
- The header pairs the light `BrandMark` with an uppercase, letter-spaced mode link: `Have an account? Sign in` / `New here? Sign up`. Narrow phones drop the wordmark.
- An oversized uppercase Manrope ExtraBold heading (`Sign up`, `Sign in`, `Welcome back,` with the name in lavender) sits below the scene, followed by one short label, dark inputs, and the violet-to-blue `gradient` button.
- The reference's "Or continue with" row holds the biometric sign-in shortcut when it is available; LenaDena shows no social buttons it does not support. The small print states that LenaDena never holds or moves money, and a quiet copyright closes the page.
- At 900 points and wider the layout splits like the reference web frame: the scene fills the left panel with `Shared money, / minus the awkward.` in white and lavender, and the form centers on the right.
- The scene makes one finite entrance (planet, moon, and stars fade and settle) and stays still under reduced motion. Stars are kept out of the form area on phones, and a top scrim keeps the header legible over the planet.

## Feedback

- Toasts are dark plum cards with a tinted tone icon (success mint, error coral, warning amber, info lavender), a bold title, an optional message, and an optional action. They stack newest first (three at most) at the top right, spring in from the right, reflow smoothly, and leave by timeout, tap, or a swipe to the right. Errors and longer messages stay longer.
- Pastel filled panels for status or explanation are not used. Explanatory copy is a quiet inline line; state belongs in a toast, a badge, or the screen itself.

## Foundations

- Page gutter: 20 points.
- Main vertical section gap: 32 points.
- Card radius: 20 points; financial hero radius: 24 points.
- Minimum touch target: 44 by 44 points.
- Navigation target: four equal-width tabs in a centered floating bottom bar, each at least 58 points high.
- Typography: bundled Manrope 400–800 weights, 26–34 point screen or financial headlines, and 13–15 point body copy.
- Shadows: violet-tinted depth under financial heroes and floating controls; subtle elevation elsewhere.
- Motion: 80–180 ms touch and selection feedback; a 1.85-second composed splash; opacity and transform only; reduced-motion aware.

## Color roles

| Role | Value | Use |
| --- | --- | --- |
| Ink | `#171129` | Primary text |
| Plum | `#1B103B` | Dark shell and glass navigation |
| Canvas | `#F5F2FA` | Main working background |
| Raised | `#FCFAFF` | Cards and selected segmented controls |
| Violet | `#7657F6` | Primary actions and focus |
| Lavender | `#B5A5FF` | Highlights, active indicators, and ambient glow |
| Positive | `#139A78` | Money owed to the user and success |
| Negative | `#E86383` | Money the user owes and destructive states |
| Warning | `#C78A35` | Pending payment review |

## Component rules

- `Button` owns every button size, state, icon placement, loading state, haptic, visual variant, and full-width decision-row presentation. The `gradient` variant is reserved for the primary action on dark space screens.
- `Input` owns focus, invalid, icon, placeholder, and text-entry styling and renders raw native input nodes to keep focus independent of styling interop. Its `dark` appearance uses a near-opaque night fill, lavender focus, and a dark keyboard.
- `Input` also owns the system date-picker variant. Event dates display as day, full month name, and year while storage remains ISO calendar text.
- `Field` owns labels, required state, errors, and hints, with a matching `dark` appearance. A field may omit its visible label only when a group heading names it and the input has an accessibility label.
- `Switch` owns on/off settings: a 52 by 32 track with a spring-animated thumb, haptic selection, a busy spinner, and switch accessibility state.
- `Toast` (`ToastProvider` and `useToast()`) owns transient feedback; see Feedback.
- `Badge` is a neutral outlined pill with a semantic dot and label.
- `TopTabs` has a floating glass bottom-navigation appearance and a compact segmented-control appearance. Badges are absolutely positioned so they never push labels together.
- `Icon` maps semantic names to one rounded Ionicons family. Screens never import an icon pack directly. The `face-id` glyph, which Ionicons lacks, is drawn inside `Icon` to match the outline weight.
- `GroupAvatar` gives imageless crews a consistent people glyph tinted with the chosen group accent.
- `Avatar` renders a private signed profile image when present and a consistent two-initial fallback otherwise. Person photos are never recreated ad hoc in feature screens.
- `Spinner` is the only loading indicator.
- `Text` owns the bundled Manrope family and maps the shared weight classes to exact font files.
- `Touch` is the shared low-cost press engine for tappable cards and component internals. It uses a raw native `Pressable`, keeps Reanimated transforms on its outer wrapper, and places optional NativeWind visuals on a non-interactive inner view.

## Financial hierarchy

The personal plan leads with one net position, then shows owe and owed totals as supporting values. Red and green are accompanied by labels and signs. The next actions are visible without scrolling. Group rows prioritize name, membership, and personal position in that order. Incoming payment claims use amber until the recipient makes a decision; sent claims use a neutral waiting state and a labeled green state only when payer fallback is available.

Activity uses filled green downward arrows for amounts owed to the user and filled coral upward arrows for amounts the user owes. Filters stay collapsed until requested and expose date window, personal/group source, transaction type, balance side, and status without leaving the timeline. Individual rows use a clear `Mark settled` action and remain visible as history afterward.
