# TV UI Element Cutter

A browser-based collection tool for cutting icons and UI components from TV photos. Load a representative TV photo if you want to define a reusable screen focus area, then batch-run a whole folder with the model detector and export every crop plus manifests.

## Features

- Open a representative TV photo or screenshot when you want to draw a screen focus template.
- Batch-run an image folder and export one ZIP for the whole set.
- Always use the ready-made browser model detector in the visible workflow.
- Export both `icons/` and `components/` crops for every source image.
- Preserve original-image coordinates in each per-image `manifest.json`.
- Include a ZIP-level `batch-manifest.json` for downstream dataset tooling.
- Runs fully in the browser; no image is uploaded to a server.

## Quick Start

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Batch Processing

Use the batch folder button in the top toolbar or left panel to select an image folder. The app processes every image file in that folder with the model detector and downloads `tv-ui-crop-batch.zip`.

If a focus region is already selected on the current image, batch mode reuses that focus as a proportional template for every image in the folder. If no focus region is selected, each image is scanned at full frame.

The ZIP contains one folder per source image. Each source folder has `icons/` and `components/` subfolders plus a per-image `manifest.json`. The ZIP root also contains `batch-manifest.json`.

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
│       ├── modelDetector.ts
│       ├── recognizeIcons.ts
│       └── rect.ts
├── test/
│   └── detectElements.test.ts
├── index.html
├── package.json
└── vite.config.ts
```

## How Detection Works

The workflow separates screen focus from element detection. A focus region defines the TV UI area to process; if no region is selected, the full image is used.

The visible workflow uses Transformers.js with the ready-made `Xenova/owlvit-base-patch32` zero-shot object detection model. The app crops the focused TV screen region into an in-browser canvas, asks the model for labels such as `settings icon`, `media app logo`, `ui button`, `app tile`, and `menu item`, then exports the model's boxes as icon/component crops. The first model run downloads and caches model files from Hugging Face, so it can take longer than later runs.

## GitHub Pages

This project builds to static files in `dist/`, so it can be deployed through GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any static host.

For GitHub Pages, set the repository's Pages source to a deployment workflow or publish the `dist/` folder from CI.

## License

MIT
