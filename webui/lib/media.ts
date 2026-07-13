// Client for the Waygerz media service (presigned S3 uploads).
import { API } from './api-paths';
import { apiJson } from './http';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export type MediaPurpose = 'comment' | 'message' | 'league_logo' | 'avatar';

export interface MediaAsset {
  id: string;
  owner_id: string;
  purpose: MediaPurpose;
  s3_key: string;
  content_type: string;
  byte_size: number;
  status: 'pending' | 'ready' | 'deleted';
  created_at: string;
  ready_at?: string;
  download_url?: string;
}

export interface PresignResponse {
  asset: MediaAsset;
  mock: boolean;
  upload_url: string | null;
  upload_method: 'PUT';
  upload_headers: Record<string, string>;
  expires_in: number;
}

export const mediaApi = {
  presign: (purpose: MediaPurpose, file: File) =>
    apiJson<PresignResponse>(`${BASE}${API.media}/uploads/presign`, {
      method: 'POST',
      body: JSON.stringify({
        purpose,
        content_type: file.type,
        byte_size: file.size,
      }),
    }),

  complete: (assetId: string) =>
    apiJson<{ asset: MediaAsset }>(`${BASE}${API.media}/uploads/${assetId}/complete`, {
      method: 'POST',
    }),

  get: (assetId: string) =>
    apiJson<{ asset: MediaAsset }>(`${BASE}${API.media}/uploads/${assetId}`),

  /** Resolve a member-visible display key (league logo / avatar) to a short-lived
   *  presigned GET URL. Any signed-in user may resolve these. */
  resolve: (key: string) =>
    apiJson<{ url: string }>(`${BASE}${API.media}/uploads/resolve?key=${encodeURIComponent(key)}`).then((d) => d.url),

  /** Upload file end-to-end: presign → PUT to S3 (or mock skip) → complete. */
  async upload(purpose: MediaPurpose, file: File): Promise<MediaAsset> {
    const presign = await mediaApi.presign(purpose, file);
    if (presign.upload_url) {
      const put = await fetch(presign.upload_url, {
        method: presign.upload_method,
        headers: presign.upload_headers,
        body: file,
      });
      if (!put.ok) throw new Error(`upload failed (${put.status})`);
    }
    const { asset } = await mediaApi.complete(presign.asset.id);
    return asset;
  },
};