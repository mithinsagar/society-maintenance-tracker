import { MAX_UPLOAD_BYTES } from '@/lib/constants';
import { requireUser } from '@/server/auth/guards';
import { UploadError } from '@/server/errors';
import { apiHandler, ok } from '@/server/http';
import { RATE_LIMITS, consume } from '@/server/rate-limit';
import { LocalStorageProvider, getStorageProvider } from '@/server/storage';

/**
 * POST /api/uploads/local — receive a file for the local-disk provider.
 *
 * Only active when Cloudinary is not configured. It exists so the product is
 * fully usable, and reviewable, with no third-party account, and it mirrors
 * the Cloudinary flow closely enough that the client code is identical.
 *
 * Validation here is stricter than a content-type check: the declared MIME
 * type is client-supplied and trivially forged, so the provider inspects the
 * file's magic bytes and rejects anything that is not genuinely a JPEG, PNG or
 * WebP — which is what stops a script being uploaded with an image header.
 */
export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  consume(`upload-local:${user.id}`, RATE_LIMITS.upload);

  const provider = getStorageProvider();
  if (!(provider instanceof LocalStorageProvider)) {
    throw new UploadError('Direct uploads are not enabled on this deployment.');
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');

  if (!file || !(file instanceof File)) {
    throw new UploadError('No file was received.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError('Image must be 5 MB or smaller.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const asset = await provider.store(buffer);

  return ok({
    publicId: asset.publicId,
    url: asset.url,
    width: asset.width,
    height: asset.height,
  });
});
