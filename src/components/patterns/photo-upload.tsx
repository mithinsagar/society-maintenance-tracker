'use client';

import { AlertCircle, ImageUp, Loader2, X } from 'lucide-react';
import * as React from 'react';

import {
  ACCEPTED_IMAGE_EXTENSIONS,
  ACCEPTED_IMAGE_TYPES,
  CLIENT_IMAGE_MAX_EDGE,
  MAX_UPLOAD_BYTES,
} from '@/lib/constants';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/**
 * Complaint photo upload.
 *
 * Flow:
 *   1. Validate type and size in the browser (fast rejection, not security).
 *   2. Downscale to a 1600px longest edge on a canvas. A modern phone photo is
 *      4–8 MB; resizing before upload turns a slow upload on society wifi into
 *      an instant one, and nothing in this product needs more resolution than
 *      that to see a leaking pipe.
 *   3. Ask the server for a scoped upload ticket.
 *   4. Upload directly to storage with real progress via XHR.
 *   5. Hand the resulting publicId back — the server independently re-verifies
 *      it before persisting anything.
 *
 * Every failure is recoverable in place: the file is kept, the error is shown,
 * and Retry re-runs the upload without losing the rest of the form.
 */

export interface UploadedPhoto {
  publicId: string;
  url: string;
  width: number;
  height: number;
}

type Status = 'idle' | 'preparing' | 'uploading' | 'done' | 'error';

interface UploadTicket {
  provider: 'cloudinary' | 'local';
  uploadUrl: string;
  fields: Record<string, string>;
}

export function PhotoUpload({
  value,
  onChange,
  disabled,
}: {
  value: UploadedPhoto | null;
  onChange: (photo: UploadedPhoto | null) => void;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [status, setStatus] = React.useState<Status>(value ? 'done' : 'idle');
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(value?.url ?? null);
  const [dragging, setDragging] = React.useState(false);
  const lastFile = React.useRef<File | null>(null);

  // Object URLs must be revoked or they leak for the page's lifetime.
  React.useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleFile(file: File) {
    setError(null);
    lastFile.current = file;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
      setStatus('error');
      setError('That file type is not supported. Use a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus('error');
      setError(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB — try a smaller photo.`,
      );
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setStatus('preparing');
    setProgress(0);

    try {
      const prepared = await downscale(file);
      const { data: ticket } = await api.post<UploadTicket>('/api/uploads/signature', {
        contentType: prepared.type,
        byteSize: prepared.size,
      });

      setStatus('uploading');
      const photo = await uploadFile(ticket, prepared, setProgress);

      setStatus('done');
      setProgress(100);
      onChange(photo);
    } catch (caught) {
      setStatus('error');
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'The photo could not be uploaded. Check your connection and try again.',
      );
    }
  }

  function reset() {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStatus('idle');
    setProgress(0);
    setError(null);
    lastFile.current = null;
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const busy = status === 'preparing' || status === 'uploading';

  // ---------------- Uploaded / uploading preview ----------------
  if (previewUrl) {
    return (
      <div className="space-y-2">
        <div
          className={cn(
            'relative overflow-hidden rounded-lg border bg-surface-sunken',
            status === 'error' ? 'border-danger/40' : 'border-border',
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Preview of the photo attached to this complaint"
            className={cn(
              'block max-h-64 w-full object-contain transition-opacity duration-200',
              busy && 'opacity-60',
            )}
          />

          {busy ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-surface/70">
              <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
              <div className="w-40">
                <div
                  className="h-1 overflow-hidden rounded-full bg-border"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Upload progress"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1.5 text-center text-[11px] text-muted tabular">
                  {status === 'preparing' ? 'Preparing image…' : `Uploading ${progress}%`}
                </p>
              </div>
            </div>
          ) : null}

          {!busy ? (
            <button
              type="button"
              onClick={reset}
              disabled={disabled}
              aria-label="Remove photo"
              className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md border border-border bg-surface/90 text-muted backdrop-blur-sm transition-colors hover:bg-surface hover:text-danger"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="flex items-start gap-2" role="alert">
            <AlertCircle className="mt-px size-3.5 shrink-0 text-danger" aria-hidden />
            <p className="flex-1 text-xs leading-relaxed text-danger">{error}</p>
            <button
              type="button"
              onClick={() => lastFile.current && handleFile(lastFile.current)}
              className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : status === 'done' ? (
          <p className="text-xs text-success">Photo attached.</p>
        ) : null}
      </div>
    );
  }

  // ---------------- Empty dropzone ----------------
  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (disabled) return;
          const file = event.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        className={cn(
          'rounded-lg border border-dashed transition-colors duration-150',
          dragging ? 'border-primary bg-primary-subtle' : 'border-border-strong bg-surface-sunken/50',
          disabled && 'opacity-50',
        )}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex w-full flex-col items-center gap-1.5 px-4 py-7 text-center"
        >
          <span className="flex size-9 items-center justify-center rounded-md border border-border bg-surface text-subtle">
            <ImageUp className="size-4" aria-hidden />
          </span>
          <span className="text-[13px] font-medium text-foreground">
            Drop a photo here, or click to browse
          </span>
          <span className="text-xs text-subtle">
            JPEG, PNG or WebP · up to 5 MB · optional but very helpful
          </span>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_EXTENSIONS.join(',')}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {error ? (
        <div className="flex items-start gap-2" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0 text-danger" aria-hidden />
          <p className="text-xs leading-relaxed text-danger">{error}</p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Downscales an image on a canvas before upload.
 *
 * Returns the original untouched if it is already small enough, or if anything
 * goes wrong — a failed resize must degrade to "upload the original", never to
 * "the user cannot attach a photo".
 */
async function downscale(file: File): Promise<File> {
  if (typeof document === 'undefined') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const longestEdge = Math.max(bitmap.width, bitmap.height);

    if (longestEdge <= CLIENT_IMAGE_MAX_EDGE) {
      bitmap.close();
      return file;
    }

    const scale = CLIENT_IMAGE_MAX_EDGE / longestEdge;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext('2d');
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      // PNG is preserved to keep transparency; everything else becomes JPEG.
      canvas.toBlob(resolve, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85),
    );

    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name, { type: blob.type, lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** XHR rather than fetch, because fetch still cannot report upload progress. */
function uploadFile(
  ticket: UploadTicket,
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadedPhoto> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', ticket.uploadUrl);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error('The storage service rejected the upload. Please try again.'));
        return;
      }
      try {
        const body = JSON.parse(xhr.responseText);
        // The two providers return different shapes; normalise here so the
        // rest of the component never branches on provider.
        const payload = ticket.provider === 'cloudinary' ? body : body.data;
        resolve({
          publicId: payload.public_id ?? payload.publicId,
          url: payload.secure_url ?? payload.url,
          width: payload.width,
          height: payload.height,
        });
      } catch {
        reject(new Error('The upload response could not be read.'));
      }
    });

    xhr.addEventListener('error', () =>
      reject(new Error('The upload failed. Check your connection and try again.')),
    );
    xhr.addEventListener('abort', () => reject(new Error('The upload was cancelled.')));

    xhr.send(form);
  });
}
