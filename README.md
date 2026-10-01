# Kauri's game

I am making Kauri's game with my son.

Kauri's game is a peaceful first-person browser game about growing trees, exploring the sea and building a village. Its blocky world has ordinary, metal and diamond trees, flower gardens, friendly neighbours and an underwater reef. Play solo, gather materials and make a home above or below the water. There is no combat, drowning or oxygen timer.

Build with wood, copper, iron, crystal and woven fiber. Build flowing water channels with a pump, corners, splitters, wheels and fountains, or power a lift beside a wheel. Light a curtain with a crystal lamp, or add a hammock. Birds and crabs visit homes made for them. Offshore, an occasional whale swims past.

Choose **Suomi, Svenska or English** on the welcome screen or in the Book. Look at nearby plants, animals and objects—or hover over a menu picture—to see a matching picture and name.

## Run locally

Install Node.js 22.12 or newer, then run these commands from the game folder:

```sh
npm ci
npm run build
npm run preview
```

Open [localhost:4173](http://localhost:4173).

Your worlds save automatically in this browser. Open **Worlds** on the welcome or Escape screen to name a new world, choose an existing one, rename it, or **Copy and play** before testing. Copies are separate: changing a copy leaves the original alone. **Save now** saves the current world; the screen shows its name and save status. Switching worlds first saves the one you are leaving.

Use the same browser and site address to return. Worlds are stored locally, without cloud backup; clearing browser data removes them. Existing single-world saves are kept and imported automatically. If a save fails, the previous stored version is kept and a warning appears. If another tab saved the same world, reload to use that saved version; separate worlds can be played in separate tabs.

## Controls

| Action | Control |
| --- | --- |
| Move / look | WASD / mouse |
| Look when mouse capture is unavailable | Arrow keys or hold right mouse and drag |
| Jump / run | Space / Shift |
| Swim up / down | Space / C or Ctrl |
| Choose a tool | 1–7 or the pictured hotbar |
| Dig, sow, fill, build, remove | Left click |
| Water / chop | Hold left click to water; click repeatedly or hold to chop |
| Change tool, seed or building piece | Mouse wheel, Q / E or choice arrows |
| Change building material | M or the material picture |
| Rotate a building piece | R or the rotate picture |
| Lower / raise building level | Z / X or − / + |
| Build menu / close Build | Tab |
| Book, seeds and help / close Book | J |
| Pause / close an open menu | Escape |
| Resume | Play triangle or paused background |
| Neighbour clothes | Shirt picture or F nearby |
| Sound and volume | Escape → pause settings |
| Return home | Hold H or use the pause menu |
| Read a menu picture's name | Hover or focus with Tab / Shift-Tab |

J and Tab switch menus; pressing the same shortcut again resumes play. Escape closes an open menu directly. Before play has started, closing a menu returns to the landing screen. Shift-Tab and arrow keys navigate menu controls; native input and select controls keep their editing keys. Menus pause the world, and their contents can be scrolled. Plain walls have two placement directions; other pieces have four.

## Grow and build

Dig a hole, choose a seed, plant it, fill the soil and water it. Watered plants mature in about 15–28 seconds of play. Harvest trees and flowers for materials; seeds and water are unlimited. You can also gather from the orchard and wild plants.

You can grow the same trees in underwater soil or sand. Kelp, copper coral and pearl plants grow only underwater and give fiber, copper and diamond respectively. Dig, sow and cover the seed as usual; submerged plots stay watered automatically. Leave room for animals and the grown plant. If you are too close to sow a tree, step back and keep the hole in your sights. Click repeatedly or hold the axe on a mature plant to gather its materials.

Open **Build** to choose materials, building pieces and objects. Aim near the edge where you want a wall, window or door. Add a roof one level above the walls. A home with enclosed sides, a doorway and a roof welcomes a neighbour; underwater homes welcome divers. Neighbours sometimes walk out to admire a nearby plant or pause by the shore, then return home. Keep a clear path through the doorway. Remove upper pieces before their supports. Removing a piece returns its material cost.

Placing a floor, roof or lift deck beneath you raises you onto its top when your whole body has room. A blocked placement spends no materials.

Aim at a nearby object and click the pictured hand to use it. Push a hammock, switch on a crystal lamp beside a curtain, or ride a lift. Lower an occupied lift before removing it.

To make water flow, place a pump on a water tile, or hold the watering can over a channel. A pump can also draw from beside a shore or pier if its intake reaches real water. Pumps need no fuel; use the pump to switch it on or off. Put the next channel or object directly beside the outlet and rotate it with **R** so the outlet faces its inlet. A pump can lift water to a higher supported piece through a visible pipe. After that, channels carry water level or downhill. Copper joins adapt to the height difference automatically. The placement arrows and connection message help you line up the ports. Keep the whole pipe or trough clear of plants, buildings and other objects.

Use corner channels to turn the route and splitters to share water between two branches. Each branch gets half the incoming flow; an open outlet spills its share. Feed a wheel to make it turn, or a fountain to make it spray. A nearby bell can ring with the wheel. Water already in the channels drains after you stop the source.

Place a lift beside a wheel so their drive fittings face and connect. Flow through the wheel moves the lift between its endpoints. A connected lift holds when the water runs out. Disconnecting the drive also holds it in place; use the disconnected lift explicitly to move it by hand again.

Hold **H** while playing to return home, or use **Return home** in the pause menu. Your first completed house on dry land becomes home; **Make this my home** chooses another nearby completed house.

Sound and volume are saved in this browser. The pause menu also has graphics settings and a calmer camera option. Automatic graphics adjusts picture quality to the device; Low reduces shadows and power use. Calmer camera slows looking and removes the walking tool bob.

## Explore

Explore beyond the orchard through birch hills, reed bays, beaches and seagrass channels. Gather from wild plants, plant in suitable soil or underwater sand, and build on supported ground or the seabed. Paths also lead to unusual seeds. Flowers attract butterflies and bees, while deer and birds visit the garden. Swim from the shore to watch crabs, fish schools, sea turtles and an octopus among the reef's corals, sea stars and anemones. Fish schools and crabs also live along suitable stretches of the wider coast; look offshore in deeper, open water for a whale. Build an accessible crab shelter on flat shallow seabed near the reef or outer-coast crabs; use it to invite a visitor, or make an underwater room with crystal windows to watch the sea life outside.

For a static web release, see [Hosting](HOSTING.md).
