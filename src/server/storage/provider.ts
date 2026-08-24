import 'server-only';

/**
 * Storage abstraction for complaint photos.
 *
 * Two implementations satisfy this interface: Cloudinary (production) and
 * local disk (development, and any environment without credentials). The
 * application depends only on this interface, so the whole product is testable
 * and demonstrable without a third-party account, and swapping to S3 or
 * Supabase Storage later means adding one file.
 *
 * Binaries never go into Postgres. Storing images as bytea would inflate every
 * backup and `pg_dump`, consume a database connection to serve each image,
 * and forfeit CDN caching and on-the-fly resizing.
 */

export interface UploadTicket {
  /** Where the browser should POST the file. */
  uploadUrl: string;
  /** Fields the browser must include alongside the file. */
  fields: Record<string, string>;
  /** Provider name, so the client knows which upload flow to run. */
  provider: 'cloudinary' | 'local';
}

export interface StoredAsset {
  publicId: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
}

export interface StorageProvider {
  readonly name: 'cloudinary' | 'local';

  /**
   * Issues a short-lived, scoped permission for the browser to upload
   * directly. The API secret is used to sign but never leaves the server.
   */
  createUploadTicket(input: { contentType: string; byteSize: number }): Promise<UploadTicket>;

  /**
   * Re-reads the stored asset from the provider and returns its true
   * properties.
   *
   * This is the security boundary for uploads. The `publicId` that comes back
   * from the browser is untrusted input — a client could claim any id, or one
   * belonging to another complaint. Verifying server-side means the URL we
   * persist describes an asset that actually exists, lives in our folder, and
   * is genuinely an image of an acceptable size.
   */
  verifyAsset(publicId: string): Promise<StoredAsset>;

  /** Best-effort cleanup. Failure is logged, never propagated to the user. */
  deleteAsset(publicId: string): Promise<void>;

  /** A resized delivery URL, used for table thumbnails. */
  thumbnailUrl(publicId: string, size: number): string;
}
