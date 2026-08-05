/**
 * Where the API lives.
 *
 * In development this is the empty string, and every request is relative
 * ("/api/products"). Vite's dev server proxies those to the API on :4000, so
 * the browser stays on one origin — no CORS, no absolute URLs in the code.
 *
 * A production build has no dev server and therefore no proxy: it is static
 * files served from somewhere else entirely, so relative URLs would resolve
 * against the static host and 404. Those builds need the API's absolute origin,
 * supplied at build time:
 *
 *     VITE_API_URL=https://faderoom-api.onrender.com npm run build
 *
 * Vite inlines import.meta.env at build time, so this is fixed when the bundle
 * is produced — changing it means rebuilding, not restarting.
 */
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * Absolute URL for an uploaded file.
 *
 * Uploads are stored as server-relative paths ("/uploads/abc.jpg") because the
 * API's own origin is not knowable when the record is written. Prefixing has to
 * happen at render time, here.
 *
 * Anything that already carries a scheme passes through untouched — absolute
 * http(s) URLs (so moving uploads to a CDN later needs no change at the call
 * sites), protocol-relative ones, and the blob:/data: URLs the upload previews
 * use for files that are still only on the user's machine.
 */
export const assetUrl = (path) => {
  if (!path) return path;
  if (path.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
};
