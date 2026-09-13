# OweYaar Design System

## Direction

OweYaar uses a mixed dark-and-light interface: a near-black plum shell flows into saturated violet, translucent bordered surfaces create a lightweight glass effect, and pale lavender working surfaces keep financial information readable. Positive green, negative coral, and warning amber remain semantic colors rather than brand decoration.

The direction borrows proven information patterns without copying another product:

- [Spliit](https://spliit.app/) demonstrates fast group entry, explicit advanced splits, receipts, and concise balance views.
- [Tricount](https://www.tricount.com/en-in/) keeps positive and negative positions easy to scan and makes settlement the next obvious action.
- [Splitwise mobile](https://assets.splitwise.com/mobile) validates keeping groups, balances, and activity close to the main navigation.
- [Apple layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout) emphasizes alignment, safe areas, visual hierarchy, and adequate space around controls.
- [Apple tab-bar guidance](https://developer.apple.com/design/human-interface-guidelines/tab-bars) treats top-level navigation as a stable control layer and recommends fewer, consistently available tabs.
- The supplied [Weather App UI Design](https://www.figma.com/design/t4RGh4IOycjzrwngdZ7BEr/Weather-App-UI-Design--Community-?node-id=2-2214) establishes the plum, violet, lavender, and translucent-control visual reference.

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

- `Button` owns every button size, state, icon placement, loading state, haptic, visual variant, and full-width decision-row presentation.
- `Input` owns focus, invalid, icon, placeholder, and text-entry styling and renders raw native input nodes to keep focus independent of styling interop.
- `Input` also owns the system date-picker variant. Event dates display as day, full month name, and year while storage remains ISO calendar text.
- `Field` owns labels, required state, errors, and hints.
- `TopTabs` has a floating glass bottom-navigation appearance and a compact segmented-control appearance. Badges are absolutely positioned so they never push labels together.
- `Icon` maps semantic names to one rounded Ionicons family. Screens never import an icon pack directly.
- `GroupAvatar` gives imageless crews a consistent people glyph tinted with the chosen group accent.
- `Spinner` is the only loading indicator.
- `Text` owns the bundled Manrope family and maps the shared weight classes to exact font files.
- `Touch` is the shared low-cost press engine for tappable cards and component internals. It uses a raw native `Pressable`, keeps Reanimated transforms on its outer wrapper, and places optional NativeWind visuals on a non-interactive inner view.

## Financial hierarchy

The personal plan leads with one net position, then shows owe and owed totals as supporting values. Red and green are accompanied by labels and signs. The next actions are visible without scrolling. Group rows prioritize name, membership, and personal position in that order. Payment claims use amber until the recipient makes a decision.

Activity uses filled green downward arrows for amounts owed to the user and filled coral upward arrows for amounts the user owes. Filters stay collapsed until requested and expose date window, personal/group source, transaction type, balance side, and status without leaving the timeline. Individual rows use a clear `Mark settled` action and remain visible as history afterward.
