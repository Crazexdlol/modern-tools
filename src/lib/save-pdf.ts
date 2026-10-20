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

// Legacy: takes an already-materialized Blob. Still works for callers that
// didn't need to fetch/generate the PDF asynchronously, BUT if there was
// any `await` between the user click and this call, Chrome may treat the
// user gesture as stale and silently fall back to the hidden-anchor
// download (no folder picker shown).
//
// NEW CODE should prefer `savePdfPickerFirst` below, which opens the picker
// synchronously as part of the click gesture and then runs the fetch/save
// work after the user has already chosen a folder.
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
      if (err instanceof DOMException && err.name === "AbortError") return false;
      console.warn("showSaveFilePicker failed, falling back to auto-download:", err);
    }
  }

  // Legacy fallback: hand off to the browser's default download handling.
  anchorDownload(blob, suggestedName);
  return true;
}

// Preferred API: call synchronously from a button onClick. Opens the OS
// "Save As" dialog RIGHT AWAY using the click's user gesture (Chrome
// requires this; a chain of `await` before showSaveFilePicker makes the
// gesture stale and the picker throws NotAllowedError, which the legacy
// `savePdfWithPicker` silently masks by auto-downloading). After the user
// picks a destination, `fetchBlob` runs to generate/download the file
// bytes, `onBlob` runs (e.g. to attach a copy to the claim's Documents
// tab), and the result is written to the chosen file.
//
// If the browser doesn't support the picker (Firefox / Safari), falls
// back to a hidden-anchor download under the browser's default location
// after `fetchBlob` resolves.
//
// Returns true on success, false if the user canceled the picker.
export async function savePdfPickerFirst(
  suggestedName: string,
  fetchBlob: () => Promise<Blob>,
  onBlob?: (blob: Blob, name: string) => Promise<void> | void,
): Promise<boolean> {
  return saveFilePickerFirst(suggestedName, "application/pdf", "pdf", fetchBlob, onBlob);
}

// Generic form of savePdfPickerFirst — any MIME type / extension. Use for
// CSV exports, ZIP downloads, document viewer saves, etc.
export async function saveFilePickerFirst(
  suggestedName: string,
  mimeType: string,
  extension: string,
  fetchBlob: () => Promise<Blob>,
  onBlob?: (blob: Blob, name: string) => Promise<void> | void,
): Promise<boolean> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePickerFn }).showSaveFilePicker;
  let handle: FileSystemFileHandle | null = null;

  if (typeof picker === "function") {
    try {
      const ext = extension.startsWith(".") ? extension : `.${extension}`;
      handle = await picker({
        suggestedName,
        types: [{ description: mimeType, accept: { [mimeType]: [ext] } }],
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return false;
      console.warn("showSaveFilePicker failed, falling back to auto-download:", err);
    }
  }

  // Picker is picked (or unsupported). Now fetch the actual content.
  const blob = await fetchBlob();
  if (onBlob) await onBlob(blob, suggestedName);

  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  }

  anchorDownload(blob, suggestedName);
  return true;
}

// Shared fallback-download helper used by both the legacy and new APIs.
function anchorDownload(blob: Blob, suggestedName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}
