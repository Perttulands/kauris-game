# Kauri's game

I am making Kauri's game with my son.

Kauri's game is a peaceful first-person browser game about growing trees, exploring the sea and building a village. Its blocky world has ordinary, metal and diamond trees, flower gardens, friendly neighbours and an underwater reef. Play solo, gather materials and make a home above or below the water. There is no combat, drowning or oxygen timer.

Build with wood, copper, iron, crystal and woven fiber. Connect a water channel to a wheel and bell, light a curtain with a crystal lamp, or add a hammock and lift. Birds and crabs visit homes made for them. Offshore, an occasional whale swims past.

Choose **Suomi, Svenska or English** on the welcome screen or in the Journal. Look at nearby plants, animals and objects—or hover over a menu picture—to see a matching picture and name.

## Run locally

Install Node.js 22.12 or newer, then run these commands from the game folder:

```sh
npm ci
npm run build
npm run preview
```

Open [localhost:4173](http://localhost:4173).

Your world is saved automatically in this browser. Use the same browser and site address to return to it. **Create new world** on the pause screen replaces the current world, including its buildings and plants, after confirmation.

## Controls

| Action | Control |
| --- | --- |
| Move / look | WASD / mouse |
| Look when mouse capture is unavailable | Arrow keys or hold right mouse and drag |
| Jump / run | Space / Shift |
| Swim up / down | Space / C or Ctrl |
| Choose a tool | 1–7 or the pictured hotbar |
| Dig, sow, fill, build, remove | Left click |
| Water / chop | Hold left click with the watering can / axe |
| Choose seed or building piece | Mouse wheel or Q / E |
| Change building material | M or the material picture |
| Rotate a building piece | R or the rotate picture |
| Lower / raise building level | Z / X or − / + |
| Build menu | Tab or the house button |
| Journal, seeds and help | J or the book button |
| Pause / back | Escape |
| Resume | Play triangle or paused background |
| Neighbour clothes | Shirt picture or F nearby |
| Sound | Speaker button |
| Read a menu picture's name | Hover or focus with Tab / Shift-Tab |

Tab and arrow keys navigate normally inside menus. Menus pause the world, and their contents can be scrolled. Plain walls have two placement directions; other pieces have four.

## Grow and build

Dig a hole, choose a seed, plant it, fill the soil and water it. Watered plants mature in about 15–28 seconds of play. Harvest trees and flowers for materials; seeds and water are unlimited. You can also gather from the orchard and wild plants.

Open **Build** to choose materials, building pieces and objects. Aim near the edge where you want a wall, window or door. Add a roof one level above the walls. A home with enclosed sides, a doorway and a roof welcomes a neighbour; underwater homes welcome divers. Remove upper pieces before their supports. Removing a piece returns its material cost.

Aim at a nearby object and click the pictured hand to use it. Pour into a water channel with the watering can, place a wheel beside its spout and a bell nearby. Push a hammock, switch on a crystal lamp beside a curtain, or ride a lift. Lower an occupied lift before removing it.

## Explore

Follow paths to discover unusual seeds. Flowers attract butterflies and bees, while deer and birds visit the garden. Swim from the shore to watch crabs, fish schools, sea turtles and an octopus among the reef's corals, sea stars and anemones. Build a crab shelter on the flat sand before the reef, or make an underwater room with crystal windows to watch the sea life outside.

For a static web release, see [Hosting](HOSTING.md).
