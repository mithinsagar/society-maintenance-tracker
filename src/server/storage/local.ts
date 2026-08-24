import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from '@/lib/constants';
import { UploadError } from '@/server/errors';

import type { StorageProvider, StoredAsset, UploadTicket } from './provider';

/**
 * Local-disk storage provider — development and credential-free environments.
 *
 * This exists so the entire product runs, and can be evaluated, with no
 * third-party account. The upload flow is deliberately shaped like
 * Cloudinary's (get a ticket, upload, verify by public id) so the client code
 * is identical and the production path is genuinely exercised in development.
 *
 * Not suitable for production on serverless: each instance has its own
 * ephemeral filesystem, so an image written by one invocation is invisible to
 * the next. That limitation is the reason object storage exists, and it is
 * why the Cloudinary provider is selected whenever credentials are present.
 */

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const PUBLIC_PREFIX = '/uploads';

/**
 * Magic-byte signatures.
 *
 * A `Content-Type` header is client-supplied and trivially forged; the first
 * bytes of the file are not. Checking these is what stops a script being
 * uploaded with an image content type.
 */
const SIGNATURES: Array<{ ext: string; mime: string; test: (buffer: Buffer) => boolean }> = [
  {
    ext: 'jpg',
    mime: 'image/jpeg',
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: 'png',
    mime: 'image/png',
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    test: (b) =>
      b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
];

export function detectImageType(buffer: Buffer): { ext: string; mime: string } | null {
  return SIGNATURES.find((signature) => signature.test(buffer)) ?? null;
}

/** Minimal intrinsic-dimension reader for the three formats we accept. */
export function readImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  // PNG: IHDR width/height are big-endian uint32 at offsets 16 and 20.
  if (buffer.length > 24 && buffer.toString('ascii', 12, 16) === 'IHDR') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // WebP (VP8/VP8L/VP8X variants).
  if (buffer.length > 30 && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (chunk === 'VP8 ') {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === 'VP8L') {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  // JPEG: walk the segment markers to the start-of-frame.
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === undefined) break;
      // SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15 carry the dimensions.
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isStartOfFrame) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }

  return null;
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local' as const;

  async createUploadTicket(input: { contentType: string; byteSize: number }): Promise<UploadTicket> {
    if (!ACCEPTED_IMAGE_TYPES.includes(input.contentType as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
      throw new UploadError('Only JPEG, PNG and WebP images are accepted.');
    }
    if (input.byteSize > MAX_UPLOAD_BYTES) {
      throw new UploadError('Image must be 5 MB or smaller.');
    }

    return {
      provider: 'local',
      // Handled by our own route, which performs the same validation the
      // Cloudinary signature encodes.
      uploadUrl: '/api/uploads/local',
      fields: { token: randomUUID() },
    };
  }

  /** Writes a validated buffer to disk. Called by the local upload route. */
  async store(buffer: Buffer): Promise<StoredAsset> {
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new UploadError('Image must be 5 MB or smaller.');
    }

    const detected = detectImageType(buffer);
    if (!detected) {
      throw new UploadError('That file is not a JPEG, PNG or WebP image.');
    }

    const id = randomUUID();
    const filename = `${id}.${detected.ext}`;

    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, filename), buffer);

    const dimensions = readImageDimensions(buffer) ?? { width: 1200, height: 900 };

    return {
      publicId: filename,
      url: `${PUBLIC_PREFIX}/${filename}`,
      width: dimensions.width,
      height: dimensions.height,
      bytes: buffer.byteLength,
      format: detected.ext,
    };
  }

  async verifyAsset(publicId: string): Promise<StoredAsset> {
    // Path traversal guard: a public id is a bare filename, never a path.
    if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(publicId)) {
      throw new UploadError('That image could not be verified.');
    }

    const filePath = path.join(UPLOAD_DIR, publicId);
    // Belt and braces — confirm the resolved path is still inside the folder.
    if (!filePath.startsWith(UPLOAD_DIR)) {
      throw new UploadError('That image could not be verified.');
    }

    try {
      const stats = await stat(filePath);
      const buffer = await readFile(filePath);
      const dimensions = readImageDimensions(buffer) ?? { width: 1200, height: 900 };
      const detected = detectImageType(buffer);

      if (!detected) throw new UploadError('Uploaded file is not a valid image.');

      return {
        publicId,
        url: `${PUBLIC_PREFIX}/${publicId}`,
        width: dimensions.width,
        height: dimensions.height,
        bytes: stats.size,
        format: detected.ext,
      };
    } catch (error) {
      if (error instanceof UploadError) throw error;
      throw new UploadError('That image could not be verified. Please upload it again.', {
        cause: error,
      });
    }
  }

  async deleteAsset(publicId: string): Promise<void> {
    try {
      await unlink(path.join(UPLOAD_DIR, publicId));
    } catch (error) {
      console.warn('[storage] local delete failed', publicId, error);
    }
  }

  thumbnailUrl(publicId: string): string {
    // No transformation pipeline on disk; the browser scales the original.
    return `${PUBLIC_PREFIX}/${publicId}`;
  }
}
