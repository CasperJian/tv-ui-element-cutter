# TV UI Element Cutter

A browser-based collection tool for cutting icons and UI components from TV photos. Drop in a photo or screenshot, focus the screen UI region first, choose whether to collect icons, components, or both, then export every detected crop plus a manifest.

## Features

- Upload or drop a TV photo or UI screenshot into the workspace.
- Focus the actual screen UI region before icon segmentation.
- Cut detected icons and larger UI components from the focused region while preserving original-image coordinates.
- Choose `icons`, `components`, or `both` for single-image and batch runs.
- Batch-run an image folder and export one ZIP for the whole set.
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

## Batch Processing

Use the folder button in the top toolbar to select an image folder. The app processes every image file in that folder and downloads `tv-ui-crop-batch.zip`.

If a focus region is already selected on the current image, batch mode reuses that focus as a proportional template for every image in the folder. If no focus region is selected, each image is scanned at full frame.

Each batch run also applies reference-icon recognition and heuristic labels to every crop. The ZIP contains one folder per source image. Each source folder has `icons/` and/or `components/` subfolders plus a per-image `manifest.json`. The ZIP root also contains `batch-manifest.json`.

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

There is no neural-network model in the current version. The extraction core is a deterministic computer-vision pipeline: contrast/saturation masking, dilation, connected components, geometry filtering, and optional reference-icon feature matching. Icon extraction uses tighter geometry filters; component extraction uses looser merging to capture cards, buttons, panels, and other larger UI blocks.

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
