# TV UI Element Cutter

A browser-based tool for finding, cutting, and naming icons inside TV UI screenshots. Drop in a photo or screenshot, focus the screen UI region first, scan icons inside that region, then export every detected crop plus a manifest.

## Features

- Upload or drop a TV photo or UI screenshot into the workspace.
- Focus the actual screen UI region before icon segmentation.
- Cut detected icons from the focused region while preserving original-image coordinates.
- Upload reference icons such as `netflix.png`, `settings.png`, or `youtube.png`; file names become labels.
- Detect compact app/function icons with a tunable image-processing pass that filters long text-like regions and large panels.
- Match candidates against uploaded reference icons.
- Apply local heuristic labels for common icon-like patterns such as Netflix-like red-on-dark tiles and Settings-like neutral icons.
- Adjust sensitivity, minimum area, merge gap, crop padding, and maximum result count.
- Click boxes on the canvas or items in the icon list to select export targets.
- Export selected crops as a ZIP with labeled PNG file names and a labeled `manifest.json`.
- Export a standalone JSON manifest for downstream tooling.
- Runs fully in the browser; no image is uploaded to a server.

## Quick Start

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Scripts

```bash
npm run dev      # Start the development server
npm test         # Run unit tests
npm run build    # Type-check and build production assets
npm run preview  # Preview the production build
```

## Project Structure

```text
.
├── .github/workflows/ci.yml
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   └── lib/
│       ├── detectElements.ts
│       ├── exportElements.ts
│       ├── recognizeIcons.ts
│       └── rect.ts
├── test/
│   └── detectElements.test.ts
├── index.html
├── package.json
└── vite.config.ts
```

## How Detection Works

The workflow separates screen focus from icon segmentation. A focus region defines the TV UI area to process; if no region is selected, the full image is used. The icon detector then builds a signal mask from local luminance contrast, color saturation, and bright-panel edges inside that focused region. It dilates nearby pixels, extracts connected components, filters tiny noise, rejects long text-like regions and oversized panels, merges nearby icon fragments, applies padding, maps coordinates back to the original image, and sorts the final crop regions from top to bottom.

Each crop is then converted into compact visual features: color ratios, edge density, aspect ratio, and a small luminance hash. The recognizer first compares those features against uploaded reference icons, then falls back to local heuristics.

The controls expose the most useful tuning points:

- `Sensitivity`: lowers or raises edge/color detection thresholds.
- `Min area`: filters small artifacts.
- `Merge gap`: joins nearby text, icon, and panel fragments.
- `Padding`: adds breathing room around exported crops.
- `Max`: caps the result count.

## GitHub Pages

This project builds to static files in `dist/`, so it can be deployed through GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any static host.

For GitHub Pages, set the repository's Pages source to a deployment workflow or publish the `dist/` folder from CI.

## License

MIT
