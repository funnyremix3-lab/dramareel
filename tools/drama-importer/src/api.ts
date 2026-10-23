import { readFile, stat } from 'node:fs/promises';

interface Presigned {
  uploadUrl: string;
  headers: Record<string, string>;
}

/** Thin client for the Admin API. Every write goes through the same permission and audit checks as the admin panel. */
export class AdminApi {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  /** Development only: mints a token for a seeded account through POST /dev/token. */
  static async devToken(baseUrl: string, account: string): Promise<string> {
    const res = await fetch(`${baseUrl}/dev/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account }) });
    if (!res.ok) throw new Error(`dev token failed: HTTP ${res.status} (set ADMIN_TOKEN instead)`);
    return ((await res.json()) as { accessToken: string }).accessToken;
  }

  async request<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    // The API rate-limits per user; back off and retry instead of failing a long import.
    if (res.status === 429 && attempt < 6) {
      await new Promise((r) => setTimeout(r, 5_000 * 2 ** attempt));
      return this.request<T>(method, path, body, attempt + 1);
    }
    if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** PUTs a local file to a presigned URL; Content-Length must match the size the URL was signed for. */
  async upload(presigned: Presigned, file: string): Promise<void> {
    const data = await readFile(file);
    const res = await fetch(presigned.uploadUrl, { method: 'PUT', headers: { ...presigned.headers, 'Content-Length': String(data.length) }, body: data });
    if (!res.ok) throw new Error(`upload ${file} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  createDrama(input: Record<string, unknown>) {
    return this.request<{ id: string; slug: string }>('POST', '/admin/dramas', input);
  }

  updateDrama(id: string, input: Record<string, unknown>) {
    return this.request<{ id: string }>('PATCH', `/admin/dramas/${id}`, input);
  }

  createEpisode(dramaId: string, input: { number: number; title: string; synopsis?: string }) {
    return this.request<{ id: string; number: number }>('POST', `/admin/dramas/${dramaId}/episodes`, input);
  }

  async uploadVideo(episodeId: string, file: string): Promise<string> {
    const size = (await stat(file)).size;
    const p = await this.request<Presigned & { assetId: string }>('POST', `/admin/episodes/${episodeId}/video-assets`, { contentType: 'video/mp4', sizeBytes: size });
    await this.upload(p, file);
    await this.request('POST', `/admin/video-assets/${p.assetId}/complete`);
    return p.assetId;
  }

  async uploadSubtitle(episodeId: string, language: string, label: string, isDefault: boolean, file: string): Promise<void> {
    const size = (await stat(file)).size;
    const p = await this.request<Presigned>('POST', `/admin/episodes/${episodeId}/subtitles/upload-url`, { language, sizeBytes: size });
    await this.upload(p, file);
    await this.request('POST', `/admin/episodes/${episodeId}/subtitles`, { language, label, isDefault });
  }

  async uploadPoster(dramaId: string, file: string): Promise<string> {
    const size = (await stat(file)).size;
    const p = await this.request<Presigned & { key: string }>('POST', `/admin/dramas/${dramaId}/poster-upload-url`, { contentType: 'image/jpeg', sizeBytes: size });
    await this.upload(p, file);
    return p.key;
  }

  videoAsset(id: string) {
    return this.request<{ id: string; status: string; lastError?: string | null }>('GET', `/admin/video-assets/${id}`);
  }

  publishEpisode(id: string) {
    return this.request('POST', `/admin/episodes/${id}/publish`);
  }

  publishDrama(id: string) {
    return this.request('POST', `/admin/dramas/${id}/publish`);
  }
}
