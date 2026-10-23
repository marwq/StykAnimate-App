# Sonic: Green Hill Sunrise

An 18-second StykAnimate animation (1280 × 720, 30 fps, 557 frames) built around the
**Archie Sonic** figure from the StykAnimate community library.

![Sonic leaping in front of the sun](poster.jpg)

| File | What it is |
| --- | --- |
| `sonic-green-hill.styk` | The editable project, opened and saved by StykAnimate itself |
| `sonic-green-hill.mp4` | 1080p preview with sound, rendered from that project with the app's own export renderer |
| `poster.jpg` | A still from the leap |
| `archie-sonic.stkz` | The library figure, unchanged |
| `source/` | The generator that builds the project |

## Story

1. **Dawn.** The camera tilts down from the sun over the sea to Sonic, who taps his foot
   with a hand on his hip and glances up at the sky.
2. **Spin dash.** He crouches, curls into a ball and revs four times: dust, sparks and a
   charge glow that grows with every rev.
3. **Release.** A shockwave, a dust burst and camera shake, then he rolls out and pops
   into a run with blurred afterimages, collecting rows of rings.
4. **Loop-de-loop.** The camera pulls back while he runs the full loop, rings included.
5. **Leap.** A launch ramp throws him into the air; time slows as he passes in front of
   the sun in a golden glow, then he spins down.
6. **Finale.** He lands, skids to a stop, points ahead with a wag, puts his hands on his
   hips and taps his foot. A glint, a light sweep, and an iris-out closes on him.

## How it is made

Everything is native StykAnimate data, so the project stays editable in the app:

- **Sonic** is the library's 41-part joined figure. A small rig (`source/sonic.mjs`)
  rotates whole body parts around their native join handles and solves two-bone IK for
  legs and arms. Every frame is a regular pose key on the *Sonic* layer.
- **Scenery** is built from ordinary figures with polygon fills: even-odd checkerboards,
  scalloped grass, mesas with waterfalls, palms with swaying fronds, sunflowers, a banded
  sea, clouds, mountains, the loop and the ramp. The sky is a gradient background.
- **Depth** comes from the app's layer parallax (13 layers, from the sun at 3% to the
  foreground at 145%) driven by the camera track; scenery layers are locked so only
  Sonic's joints show while editing.
- **Effects** are native effect clips: bloom, colour grading and vignette on the scene,
  shockwave distortions at the release and the landing, a charge glow on the spin ball,
  blur on the afterimages, a golden glow at the apex and a light sweep in the finale.
- **Sound** is three audio tracks in the project (music, effects, ring chimes), all
  synthesized from scratch by `source/audio.py`: an original chiptune score timed to
  the picture (the groove starts on the release and resolves on the landing) and
  original effects.

## Rebuilding

From the repository root, with `npm ci` done and `npm run serve` running:

```sh
cd showcase/sonic-green-hill/source
node build.mjs                                    # project + cue sheet in artifacts/sonic-green-hill/
python3 audio.py ../../../artifacts/sonic-green-hill/sonic.cues.json ../../../artifacts/sonic-green-hill/audio
node build.mjs                                    # again, now embedding the sound
node app-save.mjs ../../../artifacts/sonic-green-hill/sonic.json ../../../artifacts/sonic-green-hill/sonic.styk
node export.mjs ../../../artifacts/sonic-green-hill/sonic.json ../../../artifacts/sonic-green-hill/frames --size 1920x1080
```

`node build.mjs ../../../artifacts/sonic-green-hill/poses.json --poses 40,375,500` writes a sheet of Sonic's poses at those frames.
The output is deterministic.

## Credits

- "Archie Sonic" figure by **Mr.Legend3x**, from the StykAnimate community library.
- Sonic the Hedgehog is a trademark of SEGA. This is a non-commercial fan animation.
- Animation, scenery, effects, music and sound: generated for this showcase.
