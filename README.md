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

No external 3D assets — the steeds, characters, terrain relief, landmarks,
weather and audio are all procedural. The only texture is the parchment map
(`public/assets/map.jpg`) from the original concept. (The GLBs in
`public/models` are only a fallback: a character whose model URL names no
procedural figure is loaded from there.)

## Controls

| Input | Action |
| --- | --- |
| `W` / `↑` | Soar ahead (rider-oriented, like a first-person game) |
| `A D` / `← →` | Wheel your steed left / right (banked turns) |
| `S` / `↓` | Ease up (airbrake — the eagle fans its tail wide) |
| `W A S D` in map view | Glide over the map in screen directions |
| `SHIFT` | Soar swifter (boost, wider FOV, glide) |
| `F` / `Space` | Dragon-fire, or the Great Eagle's beacon-kindling cry (lights the Beacons of Gondor) |
| `M` | Map view (the high aerial overview) |
| Click a marker / quest / minimap | Autopilot to that place |
| `Esc` | Close scroll / drawer / raven |
| Touch devices | Virtual joystick + FIRE / SOAR buttons |

## What's inside (concept parity → and more)

**Everything from the 2D concept:** book-cover intro, five career regions
(Shire · Erebor · Elf Realms · Minas Tirith · Mordor) with proximity-opened
parchment scrolls, quest log with artifacts and six earned titles, Common
Tongue ↔ Elvish tone toggle, five LOTR cursors, per-region weather with
captions and Mordor lightning, procedural WebAudio soundscape (pad, wind,
zone filters, chimes, thunder), “Send a Raven” contact form (posted to
`/api/contact`) with the flying raven, toasts, Esc handling, autopilot travel.

**Expanded for 3D:**

- **Two steeds** — choose on the title page (or swap mid-flight from the
  HUD): the dragon, or a procedural **Great Eagle** with ~50 individually
  articulated feathers — slotted primaries that open on the upstroke,
  secondaries, golden coverts, an alula that pops when braking, and a
  white-banded tail that fans wide as an airbrake and rudder. The eagle
  wheels tighter and cruises faster; its battle-cry (F) kindles the beacons.
- **The dragon** — procedurally built and skinned: 17-bone undulating spine,
  hierarchical wing beats with tip lag and membrane billow, banking into
  turns, head stabilization, glide at speed, fire breath with light-casting
  particles, real shadows.
- **Flight physics** — shared by both steeds: they roll into a turn before
  the nose swings round (coordinated turns), carry momentum wide through hard
  turns, trade speed for height on a climb and win it back in a dive, and
  hold their altitude on a critically damped spring over a look-ahead
  envelope of land, forest canopy and landmarks — they climb over Orthanc
  rather than through it, and the camera never ends up inside a tower.
- **The world** — the parchment morphs into a heightfield authored after the
  actual map (Misty Mountains, White Mountains, Mordor's rim, Erebor, Mount
  Doom, the Rivendell valley), and the map *comes alive* as the camera
  descends to it: grass by climate and region (the Shire's green, Rohan's
  gold, Mordor's ash), craggy rock and latitude-aware snow lines, beaches,
  rivers and roads cut into the ground, lava channels down Orodruin, and
  thousands of instanced trees in Mirkwood, Fangorn, Lórien and the woods
  traced from the map — turning back into parchment from the map view. A
  reflective sea with shore surf, drifting cloud shadows and procedural
  landmarks seated on levelled ground: Hobbiton, Rivendell + Lórien,
  Erebor's gate cut into the mountain, seven-tiered Minas Tirith against
  Mindolluin, Barad-dûr with a sweeping Eye, and an erupting Mount Doom.
- **Performance** — the terrain is baked once in a Web Worker on a 2-unit
  grid while the cover is open, then drawn as GPU-displaced chunks in four
  distance-based LOD rings (one instanced draw per ring, per-pixel normals);
  forests stream around the camera; the steeds' rigid parts are merged or
  instanced (the dragon went from ~130 draw calls to ~30); and the render
  resolution adapts to hold the frame rate on retina screens and
  integrated GPUs.
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
  noise.ts              heightAt() — the single source of terrain truth
                        (relief, crags, landmark pads)
  terrainBake.ts        the baked grid: heights, normals, biome, rivers,
                        roads, forests (run in terrain.worker.ts)
  ways.ts               rivers, roads and woods traced from the map art
  Forests.tsx           instanced, camera-streamed trees
  flight.ts             shared steed physics; obstacles.ts = solid envelope
src/ui/                 book cover, HUD, scroll panel, quest log, contact,
                        toasts, raven, minimap, touch controls
```

A personal, non-commercial fan homage; Middle-earth names belong to the
Tolkien Estate.
