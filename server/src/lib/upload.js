import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { ApiError } from '../middleware/error.js';

export const UPLOAD_DIR = path.resolve('uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    /* Never trust the client's filename — it decides a path on our disk. */
    const ext = ALLOWED.get(file.mimetype) || '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new ApiError(415, 'Upload a JPEG, PNG or WebP image'));
    }
    return cb(null, true);
  },
});

/**
 * Stored filename → the path clients fetch it from.
 *
 * Deliberately relative. The same API is reached on three different hosts —
 * localhost from the CMS, 10.0.2.2 from the Android emulator, a LAN IP from a
 * physical device — so an absolute URL baked in here would be wrong for two of
 * the three. Each client resolves this against the base URL it already uses.
 */
export const publicUrl = (filename) => `/uploads/${filename}`;

/**
 * Removes an uploaded file from disk.
 *
 * For the case where somebody has said no to a photograph of themselves:
 * dropping the database row and leaving the image on the server would be
 * keeping exactly the thing they refused.
 *
 * `basename` before joining, because the value may have come back through a
 * record as `/uploads/x.jpg` — or, if anything upstream is ever less careful
 * than it should be, as `../../something`. The only directory this can reach
 * is the uploads one.
 */
export function removeUpload(stored) {
  if (!stored) return;
  const name = path.basename(String(stored));
  if (!name || name === '.' || name === '..') return;
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, name));
  } catch {
    /* Already gone, or never written. Nothing to put right. */
  }
}

/** Rewrites stored image paths into absolute URLs on the way out. */
export const withImageUrls = (doc) => {
  const obj = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  /* Idempotent: some models already map their own paths in `toJSON`, and
     prefixing twice would produce `/uploads/uploads/x.jpg`. */
  const done = (img) => img.startsWith('http') || img.startsWith('/uploads/');
  if (Array.isArray(obj.images)) {
    obj.images = obj.images.map((img) => (done(img) ? img : publicUrl(img)));
  }
  if (obj.image && !done(obj.image)) obj.image = publicUrl(obj.image);
  return obj;
};
