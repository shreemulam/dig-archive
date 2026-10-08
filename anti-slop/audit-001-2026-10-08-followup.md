# antislop follow-up — audit-001

Date: 2026-10-08
Mode: 2 (AFTER / audit)
Approved for fix: findings 1, 2, 3, 4, 5
Untouched by instruction: findings 6 through 16

---

## 1 — Em dashes in record copy (R-02, HIGH) — FIXED

3,152 em dashes across `records.json` are now 0.

Rewritten by script (`scratchpad/dedash.py`), not by hand, so the transform is
auditable and repeatable. Fields covered: `fact`, `more[]`, `connections[].note`,
`spec`, `capRight`, `gallery[].cap`, `byline.sub`, `cat`, `imgCaption`, `title`.

The script picks a replacement from what follows the dash rather than applying one
substitution everywhere:

| what follows | becomes | example |
| --- | --- | --- |
| a coordinating conjunction | comma | `looted, but never returned` |
| a subject + finite verb within 10 words | full stop + capital | `Klimt never signed it. The gallery added the label` |
| a capitalised word | colon | `one buyer: the Nazi Party` |
| anything else | comma | `gold leaf, applied by hand` |
| a matched pair of dashes | parentheses | `(then 24)` |

Backup of the pre-pass file: `scratchpad/records.backup.json`.

**72 em dashes remain and are deliberate.** They sit inside `discourse[]` — quoted
Reddit, Bluesky, Hacker News and Instagram text written by other people. R-02 governs
agent-written text. Editing a quote to satisfy a style rule would make the quote wrong,
which is a C-5 (evidence) failure. They stay as published.

## 2 — Em dashes in UI strings (R-02, HIGH) — FIXED

All user-facing strings are now free of em dashes:

- RSS item title separator
- the `REC —/—` placeholder, now `REC ···`
- the daily share string
- `scripts/make-rss.mjs` (the generator, so the fix survives a regeneration)
- `rss.xml` regenerated: 651 to 0
- the ticker strings `DIG OF THE DAY`, `LAST DIG`, `TODAY'S RECORD` (now `·`)
- the Today-in-culture line, `1965 — text` to `1965: text`
- the export failure alert

The audit counted 3; a full sweep found 5 more. Fixing them is the same approved finding,
not new scope.

**15 em dashes remain in `index.html`, all inside code comments.** Comments are the
`antislop-code` skill's concern, which is not among the approved findings. Untouched.

## 3 — Core interaction was mouse-only (R-25, HIGH) — FIXED

Opening a constellation node — the thing the whole site is for — could only be done with
a pointer. The cause is historical: nodes carry no click listener at all. An earlier
pointer-capture bug meant `setPointerCapture` retargeted clicks to the map background, so
activation was rebuilt as a hit-test on `pointerup` against `document.elementFromPoint`.
That fixed the mouse and left the keyboard with nothing to trigger.

Three changes:

1. `tabindex="0"` and a role on every div that is really a control: constellation nodes,
   atlas nodes, gallery thumbnails, breadcrumbs, the case strip, the daily and resume
   tickers, hint and abandon buttons, export.
2. One delegated `keydown` handler. Enter or Space on a focused control opens its record
   by `data-ref`, or falls through to `.click()`. It calls `preventDefault()` so Space
   does not scroll the page out from under the user.
3. `keepNodeInView()`, bound to `focusin`. The constellation is a panned surface, so a
   node can be focused while sitting outside the viewport. The handler pans the map so
   the focused node lands at least 28px inside the frame.

Verified: 28 tab stops reachable, every node activates with Enter, and a node panned
1400px off-screen is brought back into the frame when focused.

## 4 — Tap targets under 44px (R-27, HIGH) — FIXED

11 of 25 controls were under 44px at 390px wide. Now 0 of 25.

Padding was added inside a `@media (max-width:700px)` block rather than changing the
desktop layout, so the visual density of the mouse build is unchanged. Three measured
examples: 23px to 37px to 44px on breadcrumbs, 14px to 42px to 44px on the next-fact
control, 15px to 42px to 44px on discourse source links. The last two needed a second
pass — a 14px pad left them at 42px, which looks finished and is not.

Two elements stay unfocusable on purpose: the `here` breadcrumb is the page you are
already on, and `.d-item` is a container whose actual control is the link inside it.

## 5 — No loading or error state (C-4, HIGH) — FIXED

The app rendered an empty shell while `records.json` loaded, and a failure showed only a
line of ticker text that read like a glitch.

Added `#bootState`, which covers the shell until data is parsed, and names what is
happening: *Opening the archive / Loading 500 records and the connections between them.*

On failure the same surface becomes the error, with two different messages because the
two causes need different actions from the reader:

- **offline:** says the device has no cached copy yet and to reconnect
- **everything else:** says `records.json` could not be read, and that opening the file
  from disk will not work, with the command to serve it over HTTP

A retry button is added at that point rather than being present and inert beforehand.

Verified: `bootHidden: true` once 500 records parse; the record title renders behind it.

---

## Not touched

Findings 6 through 16 were not approved and were not modified. They remain open in
`audit-001-2026-10-08.md`: the blinking brand dot, `globePulse`, the background grid,
monospace typography, the glow dose cap, decorative arrows, the 10-token palette, the
forced dark theme, control border contrast at 1.36:1, and the absence of written reasons
for the techniques in use.

That last one is the one worth doing next, and it is the one `DESIGN.md` answers.

## A probe that lied, twice

Worth recording, because both readings were wrong in the direction of raising a false alarm:

1. The first focus probe called `.focus()` and read `outlineStyle: none`, which suggested
   there was no focus indicator anywhere. Re-running it with real `Input.dispatchKeyEvent`
   Tab presses showed every native control does get Chrome's `auto 1px` ring through
   `:focus-visible`. That downgraded finding 14 from a Hard Gate failure to a Low.
2. The focus-panning check reported `broughtIntoView: false` and `focusinFired: 0`.
   Calling `keepNodeInView()` directly moved the node into view correctly. Headless Chrome
   suppresses focus events when the window is not focused; the fix is
   `Emulation.setFocusEmulationEnabled`, after which the same test passes.

Neither was a defect in the page. Check the probe before reporting the bug.
