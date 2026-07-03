import { env } from "./env";

type Json = Record<string, unknown> | unknown[];

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  // Serialize concurrent refreshes into one network call
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${env.apiUrl}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { access_token: string };
      accessToken = body.access_token;
      return accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: Json;
  signal?: AbortSignal;
  auth?: boolean; // default true
}

async function doFetch(
  path: string,
  opts: RequestOptions,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false && token)
    headers["Authorization"] = `Bearer ${token}`;

  return fetch(`${env.apiUrl}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "include",
    signal: opts.signal,
  });
}

export async function api<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  let res = await doFetch(path, opts, accessToken);

  // On 401, try refresh once, then retry
  if (res.status === 401 && opts.auth !== false) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      res = await doFetch(path, opts, fresh);
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const b = body as { error?: { code?: string; message?: string } } | null;
    const err: ApiError = {
      status: res.status,
      code: b?.error?.code ?? "unknown",
      message: b?.error?.message ?? res.statusText,
    };
    throw err;
  }

  return body as T;
}

// Convenience for a manual refresh probe on app start.
export async function bootRefresh(): Promise<string | null> {
  return refreshAccessToken();
}

/**
 * POST to a path expecting a file response (e.g. CSV).
 * Handles the token refresh dance internally and triggers a browser download.
 */
/**
 * POST to a path expecting a file response.
 * For large responses uses File System Access API to stream directly to disk.
 * Falls back to blob-based download for smaller files or older browsers.
 */
export async function downloadFile(
  path: string,
  body: Json,
  suggestedFilename: string,
): Promise<void> {
  const token = getAccessToken();

  let res = await fetch(`${env.apiUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    credentials: "include",
  });

  if (res.status === 401) {
    const fresh = await bootRefresh();
    if (fresh) {
      res = await fetch(`${env.apiUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${fresh}`,
        },
        body: JSON.stringify(body),
        credentials: "include",
      });
    }
  }

  if (!res.ok) {
    throw new Error(`download failed: ${res.status}`);
  }

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? suggestedFilename;

  // Prefer File System Access API for large streaming downloads
  // (Chrome/Edge/Opera; Firefox falls through to blob path)
  const fsAccess = (
    window as unknown as {
      showSaveFilePicker?: (opts?: unknown) => Promise<{
        createWritable: () => Promise<{
          write: (chunk: unknown) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    }
  ).showSaveFilePicker;

  if (fsAccess && res.body) {
    try {
      // Ask user where to save; streams directly to disk.
      const handle = await fsAccess({
        suggestedName: filename,
      });
      const writable = await handle.createWritable();

      const reader = res.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
      }
      await writable.close();
      return;
    } catch (e) {
      // User cancelled OR API failed — fall through to blob path
      // (some browsers throw AbortError when cancelled)
      if ((e as { name?: string })?.name === "AbortError") return;
      console.warn("File System Access failed, falling back to blob", e);
    }
  }

  // Fallback: buffer to blob (works for smaller files or Firefox)
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
