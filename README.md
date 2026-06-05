# TV UI Icon Cutter

A browser-based tool for uploading TV photos and cutting out detected UI icons. Select image files or a folder, let the model run, then download `tv-ui-icons.zip`.

## Features

- Upload multiple TV photos or select a whole image folder.
- Always use the ready-made browser model detector.
- Export icon crops only.
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

Select image files, drag images into the page, or select a folder. The app processes every image with the model detector and downloads `tv-ui-icons.zip`.

The ZIP contains one folder per source image. Each source folder has an `icons/` subfolder plus a per-image `manifest.json`. The ZIP root also contains `batch-manifest.json`.

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

## How It Works

The app uses Transformers.js with the ready-made `Xenova/owlvit-base-patch32` zero-shot object detection model. It scans each full TV photo for icon-like labels such as `settings icon`, `media app logo`, `streaming service logo`, `navigation icon`, and `search icon`, then exports the model's icon boxes as PNG crops. The first model run downloads and caches model files from Hugging Face, so it can take longer than later runs.

## GitHub Pages

This project builds to static files in `dist/`, so it can be deployed through GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any static host.

For GitHub Pages, set the repository's Pages source to a deployment workflow or publish the `dist/` folder from CI.

## License

MIT
