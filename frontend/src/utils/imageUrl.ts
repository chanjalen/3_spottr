/**
 * Supabase CDN image URL utility.
 *
 * Converts `/storage/v1/object/public/` URLs to the Supabase render endpoint
 * (`/storage/v1/render/image/public/`) so that the CDN resizes and caches images
 * before they reach the client.  Non-Supabase and local URIs are returned unchanged.
 *
 * Presets:
 *   avatar    — 200 × q60  (profile pictures, group/org icons)
 *   thumbnail — 200 × q60  (notification thumbnails, calendar grid cells)
 *   feed      — 400 × q60  (feed card images, PiP, message shared-post thumbs)
 *   detail    — 800 × q70  (full-screen media viewer, story viewer)
 */

export type ImagePreset = 'avatar' | 'thumbnail' | 'feed' | 'detail';

const PRESETS: Record<ImagePreset, { width: number; quality: number }> = {
  avatar:    { width: 200, quality: 60 },
  thumbnail: { width: 400, quality: 60 },
  feed:      { width: 1080, quality: 75 },
  detail:    { width: 1600, quality: 80 },
};

const OBJECT_SEGMENT = '/storage/v1/object/public/';
const RENDER_SEGMENT = '/storage/v1/render/image/public/';

/**
 * Returns a CDN-optimised URL for a Supabase Storage image.
 * Returns `null` when `url` is null/undefined, and returns the original
 * string unchanged for local file URIs, data URIs, or unknown hosts.
 */
export function getImageUrl(
  url: string | null | undefined,
  preset: ImagePreset,
): string | null {
  if (!url) return null;

  // Leave local / in-memory URIs untouched (camera captures, image picker, etc.)
  if (
    url.startsWith('file://') ||
    url.startsWith('content://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return url;
  }

  const { width, quality } = PRESETS[preset];
  // resize=contain: scale proportionally to fit within the width, never crop.
  // Without this Supabase defaults to cover which can crop to an implied square.
  const params = `?width=${width}&quality=${quality}&resize=contain`;

  // Already a render URL — strip existing query string and re-apply our params.
  if (url.includes(RENDER_SEGMENT)) {
    return url.split('?')[0] + params;
  }

  // Standard object URL — swap the path segment and apply params.
  if (url.includes(OBJECT_SEGMENT)) {
    return url.split('?')[0].replace(OBJECT_SEGMENT, RENDER_SEGMENT) + params;
  }

  // Unknown URL format — return as-is so nothing breaks.
  return url;
}
