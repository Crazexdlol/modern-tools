"use client";

// File System Access API types (available in Chromium browsers).
// Kept local so we don't have to add a dependency for a single call.
type SaveFilePickerFn = (opts: {
  suggestedName: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<FileSystemFileHandle>;

interface FileSystemFileHandle {
  createWritable: () => Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}

// Prompts the user to pick a save location for `blob` using the File System
// Access API when the browser supports it (Chromium: Chrome, Edge). Falls back
// to the classic hidden-<a>.click() download flow on other browsers. Returns
// true if the file was saved, false if the user canceled.
export async function savePdfWithPicker(blob: Blob, suggestedName: string): Promise<boolean> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePickerFn }).showSaveFilePicker;

  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName,
        types: [{ description: "PDF file", accept: { "application/pdf": [".pdf"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      // AbortError = user canceled the picker. Treat as no-op.
      if (err instanceof DOMException && err.name === "AbortError") return false;
      // Any other picker failure (permission denied, etc.) falls through to the
      // legacy download flow below so the user still gets their file.
      console.warn("showSaveFilePicker failed, falling back to auto-download:", err);
    }
  }

  // Legacy fallback: hand off to the browser's default download handling.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
