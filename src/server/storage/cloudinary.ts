import 'server-only';

import { v2 as cloudinary } from 'cloudinary';

import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from '@/lib/constants';
import { env } from '@/lib/env';
import { UploadError } from '@/server/errors';

import type { StorageProvider, StoredAsset, UploadTicket } from './provider';

/**
 * Cloudinary storage provider — signed direct upload.
 *
 * The browser uploads straight to Cloudinary rather than through our API. That
 * is not only a performance choice: Vercel caps a serverless request body at
 * 4.5 MB, so proxying a 5 MB photo through a route handler would fail outright.
 * Sending it directly also keeps function duration (and cost) low and avoids
 * buffering image data in a Node process.
 *
 * The trade is that the client briefly holds an upload permission, so the
 * signature is scoped tightly — a fixed folder, an allowed format list, a size
 * ceiling and a short expiry — and the resulting asset is re-verified
 * server-side before its URL is ever persisted.
 */

let configured = false;

function configure(): void {
  if (configured) return;
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

export class CloudinaryStorageProvider implements StorageProvider {
  readonly name = 'cloudinary' as const;

  async createUploadTicket(input: { contentType: string; byteSize: number }): Promise<UploadTicket> {
    configure();

    if (!ACCEPTED_IMAGE_TYPES.includes(input.contentType as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
      throw new UploadError('Only JPEG, PNG and WebP images are accepted.');
    }
    if (input.byteSize > MAX_UPLOAD_BYTES) {
      throw new UploadError('Image must be 5 MB or smaller.');
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Every parameter that constrains the upload must be part of the signed
    // payload — anything left unsigned could be overridden by the client.
    const params = {
      timestamp,
      folder: env.CLOUDINARY_UPLOAD_FOLDER,
      allowed_formats: 'jpg,jpeg,png,webp',
      resource_type: 'image',
    } as const;

    const signature = cloudinary.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET);

    return {
      provider: 'cloudinary',
      uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
      fields: {
        api_key: env.CLOUDINARY_API_KEY,
        timestamp: String(timestamp),
        folder: env.CLOUDINARY_UPLOAD_FOLDER,
        allowed_formats: 'jpg,jpeg,png,webp',
        signature,
      },
    };
  }

  async verifyAsset(publicId: string): Promise<StoredAsset> {
    configure();

    // A client could send any public id, including one belonging to a
    // different complaint. Constraining it to our folder is the first check.
    if (!publicId.startsWith(`${env.CLOUDINARY_UPLOAD_FOLDER}/`)) {
      throw new UploadError('That image could not be verified.');
    }

    let resource: {
      public_id: string;
      secure_url: string;
      width: number;
      height: number;
      bytes: number;
      format: string;
      resource_type: string;
    };

    try {
      resource = await cloudinary.api.resource(publicId, { resource_type: 'image' });
    } catch (error) {
      throw new UploadError('That image could not be verified. Please upload it again.', {
        cause: error,
      });
    }

    if (resource.resource_type !== 'image') {
      throw new UploadError('Uploaded file is not an image.');
    }
    if (resource.bytes > MAX_UPLOAD_BYTES) {
      throw new UploadError('Image must be 5 MB or smaller.');
    }

    return {
      publicId: resource.public_id,
      url: resource.secure_url,
      width: resource.width,
      height: resource.height,
      bytes: resource.bytes,
      format: resource.format,
    };
  }

  async deleteAsset(publicId: string): Promise<void> {
    configure();
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (error) {
      // Orphaning a file is strictly better than failing the user's action.
      console.warn('[storage] cloudinary delete failed', publicId, error);
    }
  }

  thumbnailUrl(publicId: string, size: number): string {
    configure();
    return cloudinary.url(publicId, {
      secure: true,
      transformation: [
        { width: size, height: size, crop: 'fill', gravity: 'auto' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });
  }
}
