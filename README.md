# ✈ Sky Messenger

A tiny **low-poly flying-courier game** built with [Three.js](https://threejs.org/) —
an original take inspired by playful browser games like *messenger.abeto.co*.

You pilot a little paper-red plane over a cozy low-poly town. Swoop down to
grab a glowing letter, then drop it at the matching **mailbox** before the
clock runs out. Chain deliveries for bonus time and climb the courier ranks.

## 🎮 Play

**[▶ Play it on GitHub Pages](https://cronicweb.github.io/sky-messenger/)**

## Controls

| Action | Keys |
| ------ | ---- |
| Steer  | `W` `A` `S` `D` or Arrow keys |
| Boost  | `Shift` |
| Brake / dive | `Space` |
| Look assist | Mouse |
| Mobile | On-screen joystick + BOOST button |

## How it works

- **Pick up** the glowing letter by flying within range of it.
- The mailbox that matches the letter's colour lights up — **deliver** there.
- Every delivery adds **+6 seconds** and one point.
- The whole town (houses, trees, river, roads) is generated procedurally with a
  fixed seed so the map is the same every run.

## Tech

- Pure **Three.js** (loaded from CDN via an import map) — no build step.
- Single `index.html` + `game.js`. Runs anywhere you can serve static files.
- Procedural geometry, flat-shaded low-poly aesthetic, dynamic shadows,
  a live minimap, and lightweight WebAudio blips.

## Run locally

Because it uses ES modules, serve it over HTTP (not `file://`):

```bash
# from the project folder
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy

Pushing to `main` triggers the workflow in `.github/workflows/deploy.yml`,
which publishes the site to GitHub Pages automatically.

---

Made for fun. Not affiliated with abeto.co — this is an independent,
original re-imagining of the "flying messenger" idea.
