'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Archive, Pencil, Pin, PinOff, Plus, RotateCcw, Send, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { NoticeBoard } from '@/components/patterns/notice-board';
import { Button } from '@/components/ui/button';
import { CharacterCount, Field, Input, Textarea } from '@/components/ui/field';
import { api, describeError, ApiError } from '@/lib/api-client';
import { createNoticeSchema } from '@/lib/validation';
import type { SerializedNotice } from '@/server/services/notice.service';

const TITLE_MAX = 160;
const BODY_MAX = 8000;

/**
 * Notice management.
 *
 * The composer is a Radix dialog, which supplies the focus trap, escape
 * handling and `aria-modal` semantics that a hand-rolled modal almost always
 * misses. Actions are inline on each notice rather than hidden behind an
 * overflow menu — there are only three of them and hiding them would cost a
 * click for no gain.
 */
export function NoticeManager({ notices }: { notices: SerializedNotice[] }) {
  const router = useRouter();
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SerializedNotice | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function togglePin(notice: SerializedNotice) {
    setBusyId(notice.id);
    try {
      await api.patch(`/api/admin/notices/${notice.id}`, { isImportant: !notice.isImportant });
      toast.success(notice.isImportant ? 'Notice unpinned' : 'Notice pinned to the top');
      router.refresh();
    } catch (caught) {
      const described = describeError(caught);
      toast.error(described.title, { description: described.description });
    } finally {
      setBusyId(null);
    }
  }

  async function archive(notice: SerializedNotice) {
    setBusyId(notice.id);
    try {
      await api.delete(`/api/admin/notices/${notice.id}`);
      toast.success('Notice archived', {
        description: 'Residents no longer see it. The record is kept for reference.',
      });
      router.refresh();
    } catch (caught) {
      const described = describeError(caught);
      toast.error(described.title, { description: described.description });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setComposerOpen(true);
          }}
        >
          <Plus aria-hidden />
          New notice
        </Button>
      </div>

      <NoticeBoard
        notices={notices}
        emptyDescription="Post your first announcement to let residents know what is happening in the society."
        actions={(notice) => (
          <>
            {!notice.archivedAt ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={notice.isImportant ? 'Unpin notice' : 'Pin as important'}
                  aria-label={notice.isImportant ? 'Unpin notice' : 'Pin notice as important'}
                  disabled={busyId === notice.id}
                  onClick={() => void togglePin(notice)}
                >
                  {notice.isImportant ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Edit notice"
                  aria-label="Edit notice"
                  disabled={busyId === notice.id}
                  onClick={() => {
                    setEditing(notice);
                    setComposerOpen(true);
                  }}
                >
                  <Pencil aria-hidden />
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Archive notice"
                  aria-label="Archive notice"
                  disabled={busyId === notice.id}
                  onClick={() => void archive(notice)}
                >
                  <Archive aria-hidden />
                </Button>
              </>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-subtle">
                <RotateCcw className="size-3" aria-hidden />
                Archived
              </span>
            )}
          </>
        )}
      />

      <NoticeComposer
        open={composerOpen}
        notice={editing}
        onOpenChange={(open) => {
          setComposerOpen(open);
          if (!open) setEditing(null);
        }}
      />
    </div>
  );
}

function NoticeComposer({
  open,
  notice,
  onOpenChange,
}: {
  open: boolean;
  notice: SerializedNotice | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/25 data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-overlay data-[state=open]:animate-overlay-in">
          {/*
            Keying on the notice id (and 'new' for a fresh notice) remounts the
            form whenever the target changes, so its state initialises cleanly
            instead of being reconciled by an effect.
          */}
          <ComposerForm key={notice?.id ?? 'new'} notice={notice} onOpenChange={onOpenChange} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ComposerForm({
  notice,
  onOpenChange,
}: {
  notice: SerializedNotice | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(notice);

  /**
   * State is initialised from props rather than synced in an effect. The
   * dialog body is keyed on the notice id (see the `key` below), so opening a
   * different notice remounts this form with the correct initial values —
   * React's recommended answer to "reset state when a prop changes", and it
   * avoids a cascading render on every open.
   */
  const [title, setTitle] = React.useState(notice?.title ?? '');
  const [body, setBody] = React.useState(notice?.body ?? '');
  const [isImportant, setIsImportant] = React.useState(notice?.isImportant ?? false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = createNoticeSchema.safeParse({ title, body, isImportant });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.');
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSaving(true);

    try {
      if (isEdit && notice) {
        await api.patch(`/api/admin/notices/${notice.id}`, parsed.data);
        toast.success('Notice updated');
      } else {
        const result = await api.post<{ notification: { recipients: number; delivered: number } }>(
          '/api/admin/notices',
          parsed.data,
        );

        const notification = result.data.notification;
        if (parsed.data.isImportant && notification.recipients > 0) {
          toast.success('Important notice published', {
            description:
              notification.delivered === notification.recipients
                ? `Emailed to ${notification.recipients} residents.`
                : `Queued for ${notification.recipients} residents; ${notification.delivered} delivered so far. See Email log.`,
          });
        } else {
          toast.success('Notice published');
        }
      }

      onOpenChange(false);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.details?.length) {
        setErrors(caught.fieldErrors);
      } else {
        const described = describeError(caught);
        toast.error(described.title, { description: described.description });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <Dialog.Title className="text-sm font-semibold text-foreground">
            {isEdit ? 'Edit notice' : 'New notice'}
          </Dialog.Title>
          <Dialog.Description className="mt-0.5 text-xs text-subtle">
            {isEdit
              ? 'Changes appear on the resident board immediately.'
              : 'This will be published to the board for every resident.'}
          </Dialog.Description>
        </div>
        <Dialog.Close asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Close">
            <X aria-hidden />
          </Button>
        </Dialog.Close>
      </div>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Field label="Title" required error={errors.title}>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={TITLE_MAX}
              placeholder="e.g. Water tanker schedule revised from Monday"
              autoFocus
            />
          </Field>

          <Field label="Notice" required error={errors.body}>
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={9}
              maxLength={BODY_MAX}
              placeholder="Write the announcement. Blank lines are preserved, so you can use paragraphs."
            />
            <div className="flex justify-end pt-1">
              <CharacterCount value={body} max={BODY_MAX} />
            </div>
          </Field>

          {/*
                A labelled checkbox rather than a switch: this has a real
                consequence (an email to every resident), and a checkbox with
                an explicit description reads less like a toggle to flip idly.
              */}
          <label
            className={[
              'flex cursor-pointer items-start gap-3 rounded-md border px-3.5 py-3 transition-colors',
              isImportant
                ? 'border-status-progress-border bg-status-progress-bg'
                : 'border-border bg-surface-sunken/50 hover:border-border-strong',
            ].join(' ')}
          >
            <input
              type="checkbox"
              checked={isImportant}
              onChange={(event) => setIsImportant(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[hsl(var(--status-progress))]"
            />
            <span>
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                <Pin className="size-3.5 text-status-progress" aria-hidden />
                Mark as important
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-subtle">
                Pins this to the top of the notice board
                {!isEdit ? ' and emails every active resident' : ''}. Use it for things people
                genuinely need to act on.
              </span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-sunken/50 px-5 py-3">
          <Dialog.Close asChild>
            <Button type="button" variant="ghost" disabled={saving}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button type="submit" loading={saving}>
            {!saving ? <Send aria-hidden /> : null}
            {saving ? 'Publishing…' : isEdit ? 'Save changes' : 'Publish notice'}
          </Button>
        </div>
      </form>
    </>
  );
}
