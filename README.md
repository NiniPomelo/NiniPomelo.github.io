# YU-YOU CHOU Portfolio

Static GitHub Pages portfolio focused on Unity, Meta Quest, MR / VR / XR, game systems, and interactive experiences.

## Structure

- `index.html`: portfolio content, hash routing, Image Studio, and primary page interactions.
- `interaction-system.css`: optional hidden-interaction and mini-game presentation.
- `interaction-system.js`: secret discovery, local storage, game manager, and seven mini games.
- `assets/media/p02-voice-chess/`: Unity voice chess screenshot and optimized gameplay video.
- `assets/media/p03-lacquer-fan/`: Digital Lacquer Fan interface and output images.
- `assets/media/p04-undead-rush/`: Undead Rush gameplay video and course screenshots.
- `assets/media/p05-3d-animation/`: Maya work separated by `3D動畫設計` and `3D電腦動畫（二）` course source.

## Project routes

- `#project-you-graduation-topic`: P01 Brawl & Qualifying. The route remains unchanged while updated user media is pending.
- `#project-voice-chess`: P02 Unity voice chess.
- `#project-p5js-creative-sketch`: P03 Digital Lacquer Fan Workshop.
- `#project-undead-rush`: P04 Undead Rush.
- `#project-3d-animation`: P05 3D / Animation course archive.

## Local preview

Serve the repository root with any static server. For example:

```powershell
python -m http.server 8765
```

Then open `http://127.0.0.1:8765`.

## Deployment

The site uses hash routes such as `#projects`, so GitHub Pages does not require a custom `404.html` for project detail views. CSS and JavaScript references include a version query. Increment that version whenever either file changes to reduce stale browser-cache issues after deployment.
