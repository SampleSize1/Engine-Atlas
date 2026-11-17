# Engine Atlas

Learn the parts of a car engine on a 3D model you can take apart: the block, crankshaft, pistons and rods; the head with its valves, camshafts and timing chain; the fuel, ignition, exhaust, oil, cooling and belt systems. Watch the four-stroke cycle run in slow motion, then study, practice and test yourself.

**Use it here: [samplesize1.com/tools/engine-atlas](https://samplesize1.com/tools/engine-atlas/)**

**In beta.** Made by [@samplesize_1](https://www.instagram.com/samplesize_1/), following [Bone Atlas](https://github.com/SampleSize1/Anatomy-Atlas/tree/main/bone-atlas) and [Muscle Atlas](https://github.com/SampleSize1/Anatomy-Atlas/tree/main/muscle-atlas).

## What it does

- A generic 2-litre four-cylinder petrol engine with 61 kinds of part: the 44 every driver has heard of (Main), or all of them down to the bearing shells and sensors (All). Any one of a set counts: click any piston for "Pistons"
- **Take apart**: the engine comes apart in straight lines, in three stages (covers and bolt-on parts off, head and timing chain off, everything apart); a slider for anything in between
- **Study**: step through the parts outside in, the engine opening as you go deeper; each part says what it does, where it is and what happens when it fails
- **Run engine**: the housings turn to glass and the crankshaft turns; pistons, rods, valves, camshafts, chain and pulleys all move, the gas above each piston is coloured by stroke, and a label over each cylinder names its stroke
- **Practice**: find each part; the engine opens as far as each needs, misses come back until you get them right
- **Test**: every part once, timed, no help, with your best score saved
- **Name it**: Practice and Test can also ask the other way round. One piece is shown on its own and you type its name: clues in Practice (its length, its first letter, then the name), close spellings count. Wide screens start on it, phones on Find it; the Questions switch in Settings changes it
- Zoom to one system (bottom end, top end, air & fuel, exhaust, ignition & electrical, lubrication, cooling, belt drive) and the rest fades; look from the front, rear, intake side, exhaust side, top or bottom
- Hints on or off: names with their other common names ("Oil pan (sump)", "Crankshaft pulley (harmonic balancer)") or plain names
- X-ray and peel modes reach a part behind another; voice commands ("cooling", "take it apart", "run the engine", "whole engine") in Chrome, Edge and Safari
- Progress and best scores stay in your browser: no account, nothing is sent anywhere

## Run it yourself

It's a plain web page with no build step. Browsers won't load the 3D model from a page opened straight from disk, so serve the folder with any static file server:

```sh
git clone https://github.com/SampleSize1/Engine-Atlas.git
cd Engine-Atlas
python3 -m http.server 8000
```

Then open http://localhost:8000.

| File | What it is |
| --- | --- |
| `index.html` | The page, and the settings that make it this atlas (the systems, where to look from, voice words) |
| `machine.js` | What only this atlas does: taking the engine apart and running it |
| `data.js` | Everything the atlas teaches: regions, names, notes, translations |
| `engine.glb` | The 3D model: 211 pieces, every part its own mesh |
| `atlas-engine/atlas.js` | The atlas engine: the code, shared by the 3D atlases on [samplesize1.com](https://samplesize1.com/tools/) |
| `atlas-engine/atlas.css` | The styles, shared by all the 3D atlases on [samplesize1.com](https://samplesize1.com/tools/) |
| `atlas-engine/three-bundle.js` | [three.js](https://threejs.org/) r169, bundled into one file |
| `progress.js` | Saves progress in the browser (localStorage) |

## The model

The engine is not a scan or a download: every part is generated in code (CadQuery / OpenCascade and numpy) from one set of dimensions, so each is a clean mesh with a known name, and the moving parts know how they move. It is a generic engine, not any real make: bore and stroke 86 × 86 mm, DOHC 16-valve, port injection, chain-driven cams, firing order 1-3-4-2. The generator lives with the website's source; the model here is its output.

## Licences and credits

- **Code**: MIT, see [LICENSE](LICENSE).
- **3D model** (`engine.glb`): © SampleSize_1, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): reuse and change it, with credit.
- **three.js**: MIT, see [licenses/three.js.txt](licenses/three.js.txt).

## Updates and feedback

This repository is copied automatically from [samplesize1.com](https://samplesize1.com/tools/) whenever the tool changes, so edits made directly here would be overwritten. Found a bug or have an idea? [Open an issue](https://github.com/SampleSize1/Engine-Atlas/issues).
