import 'server-only';

import { env } from '@/lib/env';

import { CloudinaryStorageProvider } from './cloudinary';
import { LocalStorageProvider } from './local';
import type { StorageProvider } from './provider';

/**
 * Provider selection.
 *
 * Cloudinary when credentials are present, local disk otherwise. The decision
 * is made once, here — no call site ever branches on which provider is active.
 */

let cached: StorageProvider | undefined;

export function getStorageProvider(): StorageProvider {
  if (!cached) {
    cached = env.hasCloudinary ? new CloudinaryStorageProvider() : new LocalStorageProvider();
    if (!env.hasCloudinary && env.isProduction) {
      console.warn(
        '[storage] Cloudinary is not configured; falling back to local disk. ' +
          'On serverless hosting, uploaded images will not survive between requests.',
      );
    }
  }
  return cached;
}

export { LocalStorageProvider };
export type { StorageProvider, StoredAsset, UploadTicket } from './provider';
