import { uploadSignatureSchema } from '@/lib/validation';
import { requireUser } from '@/server/auth/guards';
import { apiHandler, ok, parseJsonBody } from '@/server/http';
import { RATE_LIMITS, consume } from '@/server/rate-limit';
import { getStorageProvider } from '@/server/storage';

/**
 * POST /api/uploads/signature — issue a scoped, short-lived upload permission.
 *
 * The browser uploads the photo directly to the storage provider rather than
 * through this API. That is a hard requirement on Vercel, where a serverless
 * request body is capped at 4.5 MB — a 5 MB photo proxied through a route
 * handler would simply fail — and it keeps image bytes out of our functions.
 *
 * Because the client briefly holds a permission, the signature is scoped
 * tightly (fixed folder, allowed formats, size ceiling, short expiry), the
 * endpoint requires authentication, and it is rate limited so nobody can use
 * us as a free upload proxy. The asset is independently re-verified
 * server-side before its URL is ever persisted — that check, not this one, is
 * the security boundary.
 */
export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  consume(`upload:${user.id}`, RATE_LIMITS.upload);

  const input = await parseJsonBody(request, uploadSignatureSchema);
  const ticket = await getStorageProvider().createUploadTicket(input);

  return ok(ticket);
});
