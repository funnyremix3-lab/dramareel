/**
 * Browser → presigned URL upload with progress. Uses XMLHttpRequest because fetch()
 * has no upload progress events. The presigned URL signs Content-Type (and for videos
 * Content-Length), so the headers returned by the API must be sent unchanged.
 */
export interface UploadOptions {
  headers?: Record<string, string>;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export function putFile(url: string, file: Blob, opts: UploadOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(opts.headers ?? {})) {
      // Browsers set Content-Length themselves and refuse to let scripts set it.
      if (k.toLowerCase() === "content-length") continue;
      xhr.setRequestHeader(k, v);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) opts.onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(1);
        resolve();
      } else {
        reject(new UploadError(`Storage rejected the upload (HTTP ${xhr.status})`, xhr.status));
      }
    };
    xhr.onerror = () => reject(new UploadError("Upload failed: network error or the storage bucket does not allow this origin (CORS)", 0));
    xhr.onabort = () => reject(new UploadError("Upload canceled", 0));
    if (opts.signal) {
      if (opts.signal.aborted) {
        reject(new UploadError("Upload canceled", 0));
        return;
      }
      opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}

export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"] as const;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Some browsers report .mkv as "" — fall back to the extension. */
export function videoContentType(file: File): string | null {
  if ((VIDEO_TYPES as readonly string[]).includes(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const byExt: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska", webm: "video/webm" };
  return ext ? (byExt[ext] ?? null) : null;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
