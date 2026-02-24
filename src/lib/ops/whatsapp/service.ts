/**
 * WhatsApp Business Cloud API Service
 *
 * Meta Graph API v21.0 integration for sending/receiving messages.
 * Handles webhook verification, signature validation, message parsing.
 *
 * Required env vars:
 *   WHATSAPP_PHONE_NUMBER_ID  — Your WA Business phone number ID
 *   WHATSAPP_ACCESS_TOKEN     — Permanent access token from Meta
 *   WHATSAPP_VERIFY_TOKEN     — Webhook verification token (you choose)
 *   WHATSAPP_APP_SECRET       — App secret for HMAC signature verification
 */

import crypto from 'crypto';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const MAX_WA_MESSAGE_LENGTH = 4096;

// ─── Webhook Verification ────────────────────────────────

export function verifyWebhookChallenge(
  mode: string | null,
  token: string | null,
  challenge: string | null,
): { valid: boolean; challenge?: string } {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'pinhoops-verify-2026';

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    console.log('[WhatsApp] Webhook verified successfully');
    return { valid: true, challenge };
  }

  console.warn('[WhatsApp] Webhook verification failed', { mode, tokenMatch: token === verifyToken });
  return { valid: false };
}

// ─── Signature Verification ──────────────────────────────

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.warn('[WhatsApp] WHATSAPP_APP_SECRET not set — skipping signature verification');
    return true; // Allow during development
  }

  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  return `sha256=${expectedHash}` === signature;
}

// ─── Message Parsing ─────────────────────────────────────

export interface ParsedMessage {
  messageId: string;
  from: string;         // Phone number (e.g., "5511999999999")
  senderName: string;
  text: string;
  timestamp: string;
  isGroup: boolean;
  groupId?: string;
  isStatus: boolean;
}

export function parseIncomingMessage(body: any): ParsedMessage | null {
  try {
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) return null;

    // Status updates (delivered, read, etc.) — ignore
    if (value.statuses) {
      return null;
    }

    const message = value.messages?.[0];
    if (!message) return null;

    // Only process text messages for now
    if (message.type !== 'text') {
      console.log(`[WhatsApp] Ignoring non-text message type: ${message.type}`);
      return null;
    }

    const contact = value.contacts?.[0];
    const isGroup = !!message.context?.group_id;

    return {
      messageId: message.id,
      from: message.from,
      senderName: contact?.profile?.name || message.from,
      text: message.text?.body || '',
      timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
      isGroup,
      groupId: message.context?.group_id,
      isStatus: false,
    };
  } catch (err) {
    console.error('[WhatsApp] Failed to parse message:', err);
    return null;
  }
}

// ─── Send Message ────────────────────────────────────────

export async function sendWhatsAppMessage(
  to: string,
  text: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error('[WhatsApp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return { success: false, error: 'WhatsApp not configured' };
  }

  // Chunk long messages
  const chunks = chunkMessage(text);
  let lastMessageId: string | undefined;

  for (const chunk of chunks) {
    try {
      const response = await fetch(
        `${GRAPH_API_BASE}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: { body: chunk },
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('[WhatsApp] Send failed:', response.status, error);
        return {
          success: false,
          error: `Meta API error ${response.status}: ${JSON.stringify(error)}`,
        };
      }

      const data = await response.json();
      lastMessageId = data.messages?.[0]?.id;

      // Small delay between chunks
      if (chunks.length > 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err: any) {
      console.error('[WhatsApp] Network error:', err.message);
      return { success: false, error: err.message };
    }
  }

  return { success: true, messageId: lastMessageId };
}

// ─── Mark as Read ────────────────────────────────────────

export async function markMessageAsRead(messageId: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) return;

  try {
    await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  } catch {
    // Non-critical — don't throw
  }
}

// ─── Check if Message Should Be Processed ────────────────

export function shouldProcessMessage(parsed: ParsedMessage): boolean {
  if (!parsed.text) return false;
  if (parsed.isStatus) return false;

  // DMs are always processed
  if (!parsed.isGroup) return true;

  // In groups, only process @PinhoOps mentions
  if (parsed.text.includes('@PinhoOps') || parsed.text.includes('@pinhoops')) {
    return true;
  }

  return false;
}

// ─── Helpers ─────────────────────────────────────────────

function chunkMessage(text: string): string[] {
  if (text.length <= MAX_WA_MESSAGE_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_WA_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Find a good break point (newline or space)
    let breakPoint = remaining.lastIndexOf('\n', MAX_WA_MESSAGE_LENGTH);
    if (breakPoint < MAX_WA_MESSAGE_LENGTH * 0.5) {
      breakPoint = remaining.lastIndexOf(' ', MAX_WA_MESSAGE_LENGTH);
    }
    if (breakPoint < MAX_WA_MESSAGE_LENGTH * 0.5) {
      breakPoint = MAX_WA_MESSAGE_LENGTH;
    }

    chunks.push(remaining.substring(0, breakPoint));
    remaining = remaining.substring(breakPoint).trim();
  }

  return chunks;
}
