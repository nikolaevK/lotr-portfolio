# There and Back Again — Middle-earth Portfolio

An interactive 3D portfolio for **Konstantin Nikolaev**, rebuilt from the 2D
“Middle Earth Portfolio” concept into a production Next.js + React +
**Three.js** (via `@react-three/fiber`) experience.

A leather-bound book opens onto the parchment map of Middle-earth. When the
journey begins, the map **rises into living 3D terrain** — and you fly Smaug
across it, charting the five lands of a career, lighting beacons with
dragon-fire, and recovering the lost pages of the Red Book.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm start          # serve the production build
```

No external 3D assets, no model files — the dragon, terrain relief,
landmarks, weather and audio are all procedural. The only texture is the
parchment map (`public/assets/map.jpg`) from the original concept.

## Controls

| Input | Action |
| --- | --- |
| `W` / `↑` | Soar ahead (rider-oriented, like a first-person game) |
| `A D` / `← →` | Wheel your steed left / right (banked turns) |
| `S` / `↓` | Ease up (airbrake — the eagle fans its tail wide) |
| `W A S D` in map view | Glide over the map in screen directions |
| `SHIFT` | Soar swifter (boost, wider FOV, glide) |
| `F` | Dragon-fire, or the Great Eagle's beacon-kindling cry |
| `F` / `Space` | Dragon-fire (lights the Beacons of Gondor) |
| `M` | The eagle's view (tactical overview) |
| Click a marker / quest / minimap | Autopilot to that place |
| `Esc` | Close scroll / drawer / raven |
| Touch devices | Virtual joystick + FIRE / SOAR buttons |

## What's inside (concept parity → and more)

**Everything from the 2D concept:** book-cover intro, five career regions
(Shire · Erebor · Elf Realms · Minas Tirith · Mordor) with proximity-opened
parchment scrolls, quest log with artifacts and six earned titles, Common
Tongue ↔ Elvish tone toggle, five LOTR cursors, per-region weather with
captions and Mordor lightning, procedural WebAudio soundscape (pad, wind,
zone filters, chimes, thunder), “Send a Raven” contact (mailto) with the
flying raven, toasts, Esc handling, autopilot travel.

**Expanded for 3D:**

- **Two steeds** — choose on the title page (or swap mid-flight from the
  HUD): the dragon, or a procedural **Great Eagle** with ~50 individually
  articulated feathers — slotted primaries that open on the upstroke,
  secondaries, golden coverts, an alula that pops when braking, and a
  white-banded tail that fans wide as an airbrake and rudder. The eagle
  wheels tighter and cruises faster; its battle-cry (F) kindles the beacons.
- **The dragon** — procedurally built and skinned: 17-bone undulating spine,
  hierarchical wing beats with tip lag and membrane billow, banking into
  turns, head stabilization, glide at speed, terrain-following flight with
  look-ahead climbs, fire breath with light-casting particles, real shadows.
- **The world** — the parchment morphs into a heightfield authored after the
  actual map (Misty Mountains, White Mountains, Mordor's rim, Erebor, Mount
  Doom, the Rivendell valley), with sea sheets, drifting cloud shadows,
  billboard clouds and procedural landmarks: Hobbiton, Rivendell + Lórien,
  Erebor's gate, seven-tiered Minas Tirith, Barad-dûr with a sweeping Eye,
  and an erupting Mount Doom.
- **Weather patterns** — full atmosphere blending per region (fog, sun,
  hemisphere light, sky dome, cloud tint), god-ray shafts over the blessed
  lands, GPU particle systems (embers, elf-light, leaves, ash, silver
  motes), lightning bolts with delayed thunder and camera shake.
- **Game systems** — XP bar, collectible **Lost Pages of the Red Book** (8),
  the **Beacons of Gondor** minigame (light 3 pyres with dragon-fire),
  achievement toasts, persistent save (localStorage) with “begin a new
  journey”, parchment minimap with click-to-travel, eagle-view camera,
  quality toggle (HIGH/LOW), bloom + vignette post-processing, WebGL
  fallback page, résumé download in the contact scroll.

## Voice lines — bring your own audio

Fourteen movie-moment trigger points are wired in (Mordor's black speech at
Barad-dûr, a wizard's voice at the Gates of Moria, horns over Minas Tirith,
a stirring beneath Erebor, and more), plus three event moments (journey
begins, beacons lit, journey complete). The repo ships **silent**: drop your
own legally sourced MP3s into `public/audio/` using the filenames listed in
`public/audio/README.txt` and they play automatically with movie-style
subtitles, ducking the ambient soundscape. Missing files are skipped
gracefully.

Included so far, all from freesound.org (see `public/audio/README.txt`
for credits): `mordor.mp3` — "Voice of Sauron" (#656063) by ihitokage ·
`moria.mp3` — "gondaft" (#168951) by puniho · `erebor.mp3` —
"Erebor-like horns" (#345830) by vendarro.

## Structure

```
app/                    Next.js app shell (fonts, metadata, page)
src/App.tsx             Canvas + overlay + input wiring
src/data/content.ts     All region/quest/page/beacon content
src/state/store.ts      zustand game state (persisted)
src/game/               runtime (per-frame mutable state), shared actions
src/input/controls.ts   keyboard/touch → one input record
src/audio/engine.ts     procedural WebAudio engine
src/three/              terrain, sky, clouds, dragon, weather, particles,
                        god rays, landmarks, markers, beacons, pages, fire
src/ui/                 book cover, HUD, scroll panel, quest log, contact,
                        toasts, raven, minimap, touch controls
```

A personal, non-commercial fan homage; Middle-earth names belong to the
Tolkien Estate.
