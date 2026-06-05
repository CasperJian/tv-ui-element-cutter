import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen, Image as ImageIcon, Scissors, Upload } from "lucide-react";
import { BatchExportSource, downloadBatchCropsAsZip } from "./lib/exportElements";
import { detectWithModel } from "./lib/modelDetector";
import { Rect } from "./lib/rect";

type StatusTone = "idle" | "busy" | "ok" | "error";

type Status = {
  label: string;
  tone: StatusTone;
};

type ResultSummary = {
  name: string;
  iconCount: number;
};

type PreviewState = {
  url: string;
  name: string;
  icons: Rect[];
};

const MAX_ICONS_PER_IMAGE = 200;

export default function App() {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status>({ label: "Ready", tone: "idle" });
  const [isDragging, setIsDragging] = useState(false);
  const [results, setResults] = useState<ResultSummary[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");

    return () => {
      if (preview) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview]);

  const processFiles = useCallback(async (files: FileList | File[] | null) => {
    const imageFiles = Array.from(files ?? [])
      .filter((file) => isImageFile(file))
      .sort((a, b) => batchFilePath(a).localeCompare(batchFilePath(b)));

    if (imageFiles.length === 0) {
      setStatus({ label: "Choose image files", tone: "error" });
      return;
    }

    if (preview) {
      URL.revokeObjectURL(preview.url);
      setPreview(null);
    }

    setResults([]);
    setStatus({ label: `Loading model`, tone: "busy" });

    const objectUrls: string[] = [];
    const sources: BatchExportSource[] = [];
    const summaries: ResultSummary[] = [];
    let retainedPreviewUrl: string | null = null;

    try {
      for (const [index, file] of imageFiles.entries()) {
        setStatus({ label: `Cutting ${index + 1}/${imageFiles.length}`, tone: "busy" });
        const url = URL.createObjectURL(file);
        objectUrls.push(url);
        const image = await loadImageElement(url);
        const icons = await detectWithModel(image, fullImageRegion(image), {
          target: "icons",
          maxElements: MAX_ICONS_PER_IMAGE
        });

        sources.push({
          sourceName: file.name,
          sourcePath: batchFilePath(file),
          image,
          rects: icons
        });
        summaries.push({
          name: file.name,
          iconCount: icons.length
        });

        if (index === 0) {
          retainedPreviewUrl = url;
          setPreview({
            url,
            name: file.name,
            icons
          });
        }
      }

      setResults(summaries);
      await downloadBatchCropsAsZip(sources, "tv-ui-icons.zip");
      const totalIcons = summaries.reduce((total, item) => total + item.iconCount, 0);
      setStatus({ label: `${totalIcons} icons exported`, tone: "ok" });
    } catch (error) {
      setStatus({
        label: error instanceof Error ? error.message : "Icon cutting failed",
        tone: "error"
      });
    } finally {
      for (const url of objectUrls) {
        if (url !== retainedPreviewUrl) {
          URL.revokeObjectURL(url);
        }
      }
    }
  }, [preview]);

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    processFiles(event.dataTransfer.files);
  };

  const totalIcons = results.reduce((total, item) => total + item.iconCount, 0);

  return (
    <main
      className={`app-shell ${isDragging ? "is-dragging" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={() => setIsDragging(true)}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={imageInputRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        multiple
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          processFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        multiple
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          processFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <header className="topbar">
        <div className="brand">
          <Scissors size={22} aria-hidden="true" />
          <span>TV UI Icon Cutter</span>
        </div>
        <span className={`status-pill ${status.tone}`}>{status.label}</span>
      </header>

      <section className="tool-surface" aria-label="TV UI icon cutter">
        <div className="upload-panel">
          <ImageIcon size={42} aria-hidden="true" />
          <h1>Upload TV photos</h1>
          <div className="upload-actions">
            <button className="primary-button" type="button" onClick={() => imageInputRef.current?.click()}>
              <Upload size={18} aria-hidden="true" />
              <span>Images</span>
            </button>
            <button className="secondary-button" type="button" onClick={() => folderInputRef.current?.click()}>
              <FolderOpen size={18} aria-hidden="true" />
              <span>Folder</span>
            </button>
          </div>
        </div>

        <div className="result-panel">
          <div className="result-heading">
            <strong>{totalIcons} icons</strong>
            <span>{results.length} images</span>
          </div>

          {preview ? (
            <div className="preview-card">
              <img src={preview.url} alt={preview.name} />
              <div className="preview-meta">
                <strong>{preview.name}</strong>
                <span>{preview.icons.length} icons in first image</span>
              </div>
            </div>
          ) : (
            <div className="empty-preview">Drop images anywhere</div>
          )}

          <div className="result-list">
            {results.map((result) => (
              <div className="result-row" key={result.name}>
                <span>{result.name}</span>
                <strong>{result.iconCount}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function fullImageRegion(image: HTMLImageElement) {
  return {
    x: 0,
    y: 0,
    width: image.naturalWidth,
    height: image.naturalHeight
  };
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded"));
    image.src = src;
  });
}

function batchFilePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(avif|bmp|gif|jpe?g|png|webp)$/i.test(file.name);
}
