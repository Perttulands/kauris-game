# Kauris

A game I am developing with my son: a peaceful little world for growing trees, exploring a turquoise reef and making homes for friendly neighbours.

Kauris is a first-person, Minecraft-inspired browser game with an authored, blocky orchard and underwater garden. Grow ordinary, metal and diamond trees, gather materials, and build with timber, copper, iron or crystal. Flowers attract butterflies and bees; birds and deer visit the garden. Swim freely, watch shore crabs scuttle and forage, follow a sea turtle, and find an octopus by the reef arch. Loose fish schools, sea stars and anemones inhabit the cove. Discover unusual seeds and welcome a diver into an underwater home. There is no combat, drowning or oxygen timer.

This is a small single-player game in active development. Your world stays in this browser’s local storage; no account or server is needed to play. Keep the same browser and site address to keep using that save.

Choose **Suomi, Svenska or English** on the welcome screen or in the picture book. Menus, guidance and object names change immediately; the language preference is remembered separately from your world. The initial language follows a supported browser language, with English as the fallback.

The evergreen tree is named **Spruce / Kuusi / Gran**; existing worlds keep their trees and materials.

Larger text and picture cards make words easier to notice. Look at a nearby tree, flower, animal, neighbour or building, or point to a picture in the book, to see its name in clear uppercase letters. Keyboard focus works too, including on special seeds you have not found yet. Moving sea creatures also have matching pictured names, with a small aiming allowance that respects walls and rocks. Pictures and words offer a gentle association while playing, without quizzes, narration or claims of tested learning outcomes.

## Run

Use Node 22.12 or newer:

```sh
npm ci
npm test
npm run build
npm run preview
```

Open [localhost:4173](http://localhost:4173). `npm run dev` starts development with live reload. The preview serves a stable build. All game assets and sounds run locally; no runtime AI or external asset service is used.

## Play

| Action | Control |
| --- | --- |
| Move / look | WASD / mouse |
| Embedded browser look | Arrow keys or hold right mouse and drag |
| Jump / run | Space / Shift |
| Swim up / down | Space / C or Ctrl; look and swim forward to change depth |
| Choose a tool | 1–7 or the pictured hotbar |
| Dig, sow, fill, build, remove | Left click |
| Water / chop | Hold left click with the watering can / axe |
| Choose seed or piece | Wheel or Q / E |
| Change building material | M or pictured material button |
| Switch wall axis / rotate roof | R or rotate picture; aim near the edge you want |
| Lower / raise building level | Z / X or − / + |
| Picture book / pause | Tab / Escape |
| Resume | Click the play triangle or paused background |
| Neighbour clothes | Shirt picture or F nearby |
| Sound | Speaker button; preference is remembered |
| Language | Suomi / Svenska / English in the welcome screen or picture book |
| Read a picture's word | Hover or focus with Tab / Shift-Tab in menus |

While a menu is open, Tab and arrow keys retain their normal navigation. Escape returns to the paused welcome screen; the play triangle resumes.

Dig a hole, choose a seed, fill the soil and give it a drink. Watered plants mature in about 15–28 seconds of active play. Harvest the starter orchard or wild plants to get more materials. Seeds and water are unlimited. Menus pause growth and creatures; the picture book remains scrollable in narrow windows.

Build a floor, place walls around its edges, add a doorway and a roof one level above. Connected enclosed rooms share a neighbour. Underwater, use the broad sandy clearing in front of the shell reef; the same house rules welcome a friendly diver. Roofs, all exposed sides and an exterior doorway are required. There is no air-sealing chore. Homes are recognized at their ground or seabed level, rather than across multi-storey layouts. Remove upper pieces before their supports for exact material refunds.

Neighbours remember their homes and clothing. Opening a wall or roof makes them wait calmly until repaired. They follow short safe doorway routes and never block the player. Existing saved houses and planted trees are retained when the game is updated.

## Development

`src/state.js` owns validated commands and saves; `terrain.js`, `building.js` and `residents.js` define the shared physical world. Runtime and asset modules consume those rules. `npm test` runs portable domain and runtime checks. `npm run build` creates the static browser build in `dist/`.

The public repository contains runnable source, original authored assets and tests. Private playtest saves and review recordings are excluded. `python3 scripts/publish-source.py --help` describes the repeatable source-only publication workflow. No public license has been selected.
