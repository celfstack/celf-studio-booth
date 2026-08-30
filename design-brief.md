# Photo Strip Studio — design brief

## Design read
For people who want a nostalgic keepsake from their camera roll: warm, tactile,
analog register; the tool should feel like a small mechanical ritual, not a SaaS.

## Concept spine
"The page IS the fotoautomat." The whole single page behaves like a vintage
photo booth: you feed it four frames, it develops them behind a curtain, and
the finished strip drops out of a chrome delivery chute at the bottom. Every
UI element is a part of the machine (slots, develop button, chute, strip).

## Delivery tier
editorial. It is a working tool; micro-motion only, EXCEPT one signature
interactive mechanic: the chute delivery (strip slides out of the metal slot
after the user presses the develop button). This is user-input-driven (button
press), not a passive loop. Custom machine-metaphor mechanic (user-mandated in
the brief: "the strip should animate coming out of the delivery rectangle
chute"), stands in for a catalog Tier-1 pick.

## Locked palette (user-specified; overrides default palette bans)
- Paper cream `#FAF6EF` (page ground; user-mandated "#FAF6EF-ish")
- Ink `#2A241E` (single dark text color)
- Dusty red `#A03D2E` (single accent; user offered dusty red or forest green)
- Chrome chute neutrals `#C9C4BB` / `#8F8A81` (machine hardware only)
Defense: the user explicitly specified cream/ink/dusty-red; hardware neutrals
sell the chute as brushed metal like a real booth faceplate.

## Locked type (user-specified serif display)
- Display: Libre Caslon Text (serif; user explicitly asked "serif display font
  for the app title" — written justification: user mandate).
- UI/body: Outfit (clean sans, user asked "clean sans-serif for everything else").
- Strip footer date: Courier Prime (typewriter, canvas-rendered on the strip).

## Signature mechanic
Chute delivery: after "Create My Strip", a brushed-metal delivery slot renders
the strip sliding downward out of it (transform-only, ~1.8s ease-out), with a
faint paper shadow. Reduced motion: strip appears instantly, fully visible.

## Section plan (single-page tool, 4 sections, no repeats)
1. Masthead hero: split layout; left = serif title + one-line sub + steps; right
   = generated fotoautomat line-art illustration. (family: split text+image)
2. Load the frames: 4 upload slots as empty film frames (2x2 on mobile, 1x4 on
   desktop) + inline error line. (family: slot grid / tool surface)
3. Develop: preset toggle (1970s Color / Classic B&W) + the develop CTA.
   (family: control strip)
4. Delivery: chrome chute + strip preview + Download CTA + tiny footer line.
   (family: centered stage)
Eyebrow budget: ceil(4/3)=2 max; we use 0.

## Asset plan
- Hero visual: fine ink line-art fotoautomat booth illustration on cream
  (generated, /assets/booth.png).
- Reference boards: refs/board-1 (masthead+slots), refs/board-2 (chute stage).
- Logo/favicon + OG card + marketplace cover: generate_app_branding.
- Film grain, vignette, paper texture on the strip: canvas-programmatic (part
  of the product output itself, not page chrome).

## CTA inventory (each its own component + interaction identity)
- "Create My Strip" (primary, dusty red; press = machine-clunk scale + shadow
  drop; disabled until 4 slots filled).
- "Download" (ink outline pill on the delivered strip stage; hover = paper
  lift; active = press-in).
Two user-facing controls total beyond these: the preset toggle only.

## Constraints honored
Everything client-side (no DB/R2/KV), exactly 4 photos, no reordering/crop
tools, graceful inline errors, mobile 2x2 slots, gentle motion only.

## Anti-convergence ledger
No previous build in this chat; axes recorded for the next one: cream paper
palette / serif+sans pairing / split hero with line-art asset / machine-chute
mechanic / clunk + paper-lift CTA garments / soft 12-16px corners.
