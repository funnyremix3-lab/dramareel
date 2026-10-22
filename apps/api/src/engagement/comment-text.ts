/**
 * Comment text hygiene. Output is stored as plain text and rendered as text by clients
 * (never as HTML), so this is about readability and abuse, not XSS escaping.
 */

// Control characters except tab/newline, zero-width and bidi-override characters.
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g;
const URL = /\b(?:https?:\/\/|www\.)\S+/i;

// Deliberately small seed list; moderators handle the rest via reports.
const BLOCKED_TERMS = ['fuck', 'bitch', 'madarchod', 'behenchod', 'bhenchod', 'chutiya', 'randi', 'मादरचोद', 'बहनचोद', 'चूतिया', 'रंडी'];
const BLOCKED = new RegExp(BLOCKED_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'iu');

export function normalizeComment(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type CommentRejection = 'EMPTY' | 'LINK' | 'PROFANITY';

export function checkComment(text: string): CommentRejection | null {
  if (!text) return 'EMPTY';
  if (URL.test(text)) return 'LINK';
  if (BLOCKED.test(text)) return 'PROFANITY';
  return null;
}
