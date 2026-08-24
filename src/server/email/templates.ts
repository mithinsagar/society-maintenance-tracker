import 'server-only';

import { CATEGORY_LABELS, STATUS_LABELS } from '@/lib/constants';
import { env } from '@/lib/env';
import type { ComplaintCategory, ComplaintStatus } from '@/server/db/schema';

import type { EmailMessage } from './provider';

/**
 * Email templates.
 *
 * Built as inlined-style HTML with a plain-text alternative, because email
 * clients strip <style> blocks and many recipients read in plain text. The
 * visual language matches the product — same pine-teal accent, same typographic
 * hierarchy — so a status update looks like it came from the same system the
 * resident just used.
 */

const COLORS = {
  ink: '#16211f',
  muted: '#5c6b68',
  border: '#e2e5e1',
  surface: '#fbfbf9',
  primary: '#12554e',
  open: '#5c6b68',
  inProgress: '#9a6212',
  resolved: '#1f6b45',
} as const;

const STATUS_COLOR: Record<ComplaintStatus, string> = {
  OPEN: COLORS.open,
  IN_PROGRESS: COLORS.inProgress,
  RESOLVED: COLORS.resolved,
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(options: {
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  societyName: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(options.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${COLORS.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.surface};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${COLORS.border};border-radius:10px;overflow:hidden;">
      <tr><td style="padding:22px 28px;border-bottom:1px solid ${COLORS.border};">
        <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${COLORS.primary};vertical-align:middle;"></span>
        <span style="font-size:13px;font-weight:600;letter-spacing:0.02em;vertical-align:middle;margin-left:9px;">${escapeHtml(options.societyName)}</span>
        <span style="font-size:13px;color:${COLORS.muted};vertical-align:middle;"> · Maintenance</span>
      </td></tr>
      <tr><td style="padding:30px 28px 8px;">
        <h1 style="margin:0 0 14px;font-size:19px;line-height:1.35;font-weight:600;">${escapeHtml(options.heading)}</h1>
        ${options.body}
      </td></tr>
      <tr><td style="padding:8px 28px 30px;">
        <a href="${options.ctaUrl}" style="display:inline-block;background:${COLORS.primary};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 20px;border-radius:6px;">${escapeHtml(options.ctaLabel)}</a>
      </td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid ${COLORS.border};background:${COLORS.surface};">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.muted};">
          You are receiving this because you are a registered resident of ${escapeHtml(options.societyName)}.
          This is an automated message from the maintenance tracker — please do not reply.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:7px 0;font-size:13px;color:${COLORS.muted};width:120px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:7px 0;font-size:13px;color:${COLORS.ink};font-weight:500;">${value}</td>
  </tr>`;
}

// ---------------------------------------------------------------------------
// Complaint status changed
// ---------------------------------------------------------------------------

export interface StatusChangeTemplateInput {
  residentName: string;
  reference: string;
  title: string;
  category: ComplaintCategory;
  fromStatus: ComplaintStatus;
  toStatus: ComplaintStatus;
  note?: string | null;
  actorName: string;
  societyName: string;
  complaintId: string;
}

export function renderStatusChangeEmail(input: StatusChangeTemplateInput): EmailMessage {
  const url = `${env.APP_URL}/complaints/${input.complaintId}`;
  const toLabel = STATUS_LABELS[input.toStatus];
  const fromLabel = STATUS_LABELS[input.fromStatus];

  const subject =
    input.toStatus === 'RESOLVED'
      ? `${input.reference} resolved — ${input.title}`
      : `${input.reference} is now ${toLabel} — ${input.title}`;

  const noteBlock = input.note
    ? `<div style="margin:18px 0 0;padding:14px 16px;background:${COLORS.surface};border:1px solid ${COLORS.border};border-left:3px solid ${COLORS.primary};border-radius:0 6px 6px 0;">
         <p style="margin:0 0 5px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.muted};">Note from ${escapeHtml(input.actorName)}</p>
         <p style="margin:0;font-size:14px;line-height:1.6;">${escapeHtml(input.note)}</p>
       </div>`
    : '';

  const html = layout({
    preheader: `${input.reference} moved from ${fromLabel} to ${toLabel}.`,
    heading:
      input.toStatus === 'RESOLVED'
        ? 'Your complaint has been resolved'
        : `Your complaint is now ${toLabel}`,
    societyName: input.societyName,
    ctaLabel: 'View complaint',
    ctaUrl: url,
    body: `
      <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:${COLORS.muted};">
        Hello ${escapeHtml(input.residentName)}, there is an update on the complaint you raised.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${COLORS.border};">
        ${detailRow('Reference', `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(input.reference)}</span>`)}
        ${detailRow('Issue', escapeHtml(input.title))}
        ${detailRow('Category', escapeHtml(CATEGORY_LABELS[input.category]))}
        ${detailRow(
          'Status',
          `<span style="color:${COLORS.muted};">${escapeHtml(fromLabel)}</span>
           <span style="color:${COLORS.muted};padding:0 6px;">&rarr;</span>
           <span style="color:${STATUS_COLOR[input.toStatus]};font-weight:600;">${escapeHtml(toLabel)}</span>`,
        )}
        ${detailRow('Updated by', escapeHtml(input.actorName))}
      </table>
      ${noteBlock}`,
  });

  const text = [
    `Hello ${input.residentName},`,
    '',
    `There is an update on the complaint you raised.`,
    '',
    `Reference:  ${input.reference}`,
    `Issue:      ${input.title}`,
    `Category:   ${CATEGORY_LABELS[input.category]}`,
    `Status:     ${fromLabel} -> ${toLabel}`,
    `Updated by: ${input.actorName}`,
    ...(input.note ? ['', `Note: ${input.note}`] : []),
    '',
    `View the complaint: ${url}`,
    '',
    `— ${input.societyName} Maintenance`,
  ].join('\n');

  return { to: '', subject, html, text };
}

// ---------------------------------------------------------------------------
// Important notice published
// ---------------------------------------------------------------------------

export interface ImportantNoticeTemplateInput {
  residentName: string;
  title: string;
  body: string;
  authorName: string;
  societyName: string;
  noticeId: string;
}

export function renderImportantNoticeEmail(input: ImportantNoticeTemplateInput): EmailMessage {
  const url = `${env.APP_URL}/notices#${input.noticeId}`;
  const excerpt = input.body.length > 420 ? `${input.body.slice(0, 420).trimEnd()}…` : input.body;

  const html = layout({
    preheader: input.title,
    heading: input.title,
    societyName: input.societyName,
    ctaLabel: 'Open notice board',
    ctaUrl: url,
    body: `
      <p style="margin:0 0 16px;">
        <span style="display:inline-block;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9a6212;background:#fdf6e7;border:1px solid #f0dcb4;border-radius:4px;padding:3px 8px;">Important notice</span>
      </p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:${COLORS.muted};">
        Hello ${escapeHtml(input.residentName)}, the management committee has posted an important notice.
      </p>
      <div style="font-size:14px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(excerpt)}</div>
      <p style="margin:18px 0 0;font-size:13px;color:${COLORS.muted};">Posted by ${escapeHtml(input.authorName)}</p>`,
  });

  const text = [
    `Hello ${input.residentName},`,
    '',
    'IMPORTANT NOTICE',
    '',
    input.title,
    '',
    excerpt,
    '',
    `Posted by ${input.authorName}`,
    '',
    `Open the notice board: ${url}`,
    '',
    `— ${input.societyName} Maintenance`,
  ].join('\n');

  return { to: '', subject: `Important notice: ${input.title}`, html, text };
}
