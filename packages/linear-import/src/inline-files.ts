import { hashBytes, asRecord, stringValue } from './model.ts';

export type InlineAttachment = {
  id: string;
  url: string;
  issueId: string;
  inline: true;
  originalMarkdown: string;
};

const markdownImagePattern =
  /!\[[^\]]*\]\((https:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/gu;
const bareLinearFilePattern = /https:\/\/[^\s)<>"']+/gu;

export function inlineAttachments(
  payload: unknown,
  issueId: string,
): InlineAttachment[] {
  const text = payloadText(payload);
  const matches = new Map<string, string>();
  for (const match of text.matchAll(markdownImagePattern)) {
    const url = match[1];
    if (url) matches.set(url, match[0]);
  }
  for (const match of text.matchAll(bareLinearFilePattern)) {
    const url = match[0];
    if (url.includes('uploads.linear.app/')) matches.set(url, url);
  }
  return [...matches].map(([url, originalMarkdown]) => ({
    id: `inline-${hashBytes(Buffer.from(`${issueId}:${url}`, 'utf8')).slice(0, 32)}`,
    url,
    issueId,
    inline: true,
    originalMarkdown,
  }));
}

function payloadText(payload: unknown): string {
  const record = asRecord(payload);
  if (!record) return '';
  return [record.description, record.body, record.bodyData]
    .map((value) => {
      const text = stringValue(value);
      if (text) return text;
      if (value && typeof value === 'object') return JSON.stringify(value);
      return '';
    })
    .join('\n');
}
