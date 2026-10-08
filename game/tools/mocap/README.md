# Motion capture for the 3D player

The basketball moves come from the CMU Graphics Lab Motion Capture Database (http://mocap.cs.cmu.edu), created with
funding from NSF EIA-0196217, in Bruce Hahne's BVH conversion (github.com/una-dinosauria/cmu-mocap). Free to use;
the raw data may not be resold, so the .bvh files are not kept in this repository. To rebuild the player model,
download into this folder:

| File | Motion |
|---|---|
| `data/006/06_14.bvh` | crossover dribble, shot (the standing dribble loop) |
| `data/006/06_02.bvh` | forward dribble (the dribble on the move) |
| `data/124/124_05.bvh` | jump shot |
| `data/124/124_03.bvh` | set shot (free throws) |
| `data/006/06_15.bvh`, `data/124/124_06.bvh` | dribble and shot, lay-up (not used yet) |

Then run `game/tools/blender/build_player_ubc.py` with this folder as the fourth argument, and
`npm run vendor:player` on its output.
