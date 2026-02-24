/**
 * WhatsApp Business Cloud API — Send/Verify Service
 *
 * Official Meta WhatsApp Business Cloud API integration.
 * Handles message sending, signature verification, and typing indicators.
 *
 * Env vars:
 *   WHATSAPP_PHONE_NUMBER_ID     — Phone number ID from Meta dashboard
 *   WHATSAPP_BUSINESS_ACCOUNT_ID — Business account ID
 *   WHATSAPP_ACCESS_TOKEN        — System user or permanent access token
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN— Secret for webhook verification
 */

import { opsLog } from '@/lib/ops/pinhoops/logger';

// ─── Configuration ──────────────────────────────────────

const PHONE_NUMBER_ID = () => process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = () => process.env.WHATSAPP_ACCESS_TOKEN!;
const VERIFY_TOKEN = () => process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'pinhoops-verify-2026';
const API_VERSION = 'v21.0';
const API_BASE = `https://graph.facebook.com/${API_VERSION}`;

const log = opsLog.child('whatsapp');

// ─── Types ──────────────────────────────────────────────

export interface WhatsAppIncomingMessage {
  /** Message ID from Meta */
  messageId: string;
  /** Sender phone number (international format, no +) */
  from: string;
  /** Sender name (profile name) */
  senderName: string;
  /** Message text content */
  text: string;
  /** Timestamp (epoch seconds) */
  timestamp: number;
  /** Whether this is from a group */
  isGroup: boolean;
  /** Group JID (if group message) */
  groupId?: string;
  /** Phone number ID that received the message */
  phoneNumberId: string;
  /** Raw message type */
  type: string;
}

export interface WhatsAppSendResult {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

// ─── Signature Verification ─────────────────────────────

/**
 * Verify webhook signature from Meta.
 * Meta signs payloads with SHA-256 HMAC using the app secret.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    log.warn('WHATSAPP_APP_SECRET not set — skipping signature verification');
    return true; // Allow in development
  }

  // Signature format: sha256=<hex>
  const expectedSig = signature.replace('sha256=', '');

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const hexSig = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return hexSig === expectedSig;
}

/**
 * Verify webhook verification challenge from Meta.
 * Called during webhook URL registration.
 */
export function verifyWebhookChallenge(
  mode: string | null,
  token: string | null,
  challenge: string | null,
): { valid: boolean; challenge?: string } {
  if (mode === 'subscribe' && token === VERIFY_TOKEN()) {
    log.info('Webhook verification successful');
    return { valid: true, challenge: challenge || '' };
  }
  log.warn('Webhook verification failed', { mode, token_match: token === VERIFY_TOKEN() });
  return { valid: false };
}

// ─── Parse Incoming Message ─────────────────────────────

/**
 * Parse a Meta webhook payload into a structured message.
 * Handles text messages from both DMs and groups.
 */
export function parseIncomingMessage(
  body: any,
): WhatsAppIncomingMessage | null {
  try {
    const entry = body?.entry?.[0];
    if (!entry) return null;

    const changes = entry?.changes?.[0];
    if (!changes || changes.field !== 'messages') return null;

    const value = changes.value;
    if (!value?.messages?.[0]) return null;

    const message = value.messages[0];
    const contact = value.contacts?.[0];

    // Only handle text messages for now
    if (message.type !== 'text') {
      log.info('Non-text message received, ignoring', { type: message.type });
      return null;
    }

    const parsed: WhatsAppIncomingMessage = {
      messageId: message.id,
      from: message.from,
      senderName: contact?.profile?.name || message.from,
      text: message.text?.body || '',
      timestamp: parseInt(message.timestamp, 10),
      isGroup: !!message.group_id,
      groupId: message.group_id,
      phoneNumberId: value.metadata?.phone_number_id || PHONE_NUMBER_ID(),
      type: message.type,
    };

    log.info('Parsed incoming message', {
      from: parsed.from,
      sender: parsed.senderName,
      is_group: parsed.isGroup,
      text_length: parsed.text.length,
      text_preview: parsed.text.substring(0, 60),
    });

    return parsed;
  } catch (err: any) {
    log.logError('Failed to parse incoming message', err);
    return null;
  }
}

// ─── Send Messages ──────────────────────────────────────

/**
 * Send a text message via WhatsApp Business Cloud API.
 *
 * @param to — Phone number in international format (e.g., "15551234567")
 * @param text — Message text (supports WhatsApp formatting: *bold*, _italic_, ~strikethrough~)
 * @param replyToMessageId — Optional message ID to reply to
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string,
  replyToMessageId?: string,
): Promise<WhatsAppSendResult | null> {
  const phoneNumberId = PHONE_NUMBER_ID();
  const accessToken = ACCESS_TOKEN();

  if (!phoneNumberId || !accessToken) {
    log.error('WhatsApp credentials not configured', {
      has_phone_id: !!phoneNumberId,
      has_token: !!accessToken,
    });
    return null;
  }

  // WhatsApp has a 4096 char limit per message
  // Split long messages into chunks
  const chunks = splitMessage(text, 4000);

  let lastResult: WhatsAppSendResult | null = null;

  for (let i = 0; i < chunks.length; i++) {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: chunks[i],
      },
    };

    // Only reply to the original message for the first chunk
    if (i === 0 && replyToMessageId) {
      payload.context = { message_id: replyToMessageId };
    }

    try {
      log.startTimer(`send:${i}`);

      const response = await fetch(
        `${API_BASE}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const ms = log.endTimer(`send:${i}`);

      if (!response.ok) {
        const errorBody = await response.text();
        log.error('WhatsApp send failed', {
          status: response.status,
          error: errorBody.substring(0, 200),
          to,
          chunk: i + 1,
          total_chunks: chunks.length,
          duration_ms: ms,
        });
        return null;
      }

      lastResult = await response.json();

      log.info('WhatsApp message sent', {
        to,
        message_id: lastResult?.messages?.[0]?.id,
        chunk: i + 1,
        total_chunks: chunks.length,
        duration_ms: ms,
      });

      // Small delay between chunks to maintain order
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err: any) {
      log.logError('WhatsApp send error', err, { to, chunk: i });
      return null;
    }
  }

  return lastResult;
}

/**
 * Mark a message as read (sends read receipt).
 */
export async function markMessageAsRead(messageId: string): Promise<void> {
  const phoneNumberId = PHONE_NUMBER_ID();
  const accessToken = ACCESS_TOKEN();

  if (!phoneNumberId || !accessToken) return;

  try {
    await fetch(`${API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  } catch {
    // Read receipts are non-critical
  }
}

// ─── Helpers ────────────────────────────────────────────

/**
 * Split a long message into chunks at natural break points.
 */
function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    // Find the last newline before the limit
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt < maxLength * 0.5) {
      // If no good newline, split at last space
      splitAt = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitAt < maxLength * 0.3) {
      // If no good space, hard split
      splitAt = maxLength;
    }

    chunks.push(remaining.substring(0, splitAt).trim());
    remaining = remaining.substring(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

// ─── Monitored Groups ───────────────────────────────────

/**
 * Check if a group is in the monitored list.
 * Set WHATSAPP_MONITORED_GROUPS as comma-separated group JIDs.
 * If empty, all groups with @PinhoOps trigger are handled.
 */
export function isMonitoredGroup(groupId: string | undefined): boolean {
  if (!groupId) return false;
  const monitored = process.env.WHATSAPP_MONITORED_GROUPS;
  if (!monitored) return false; // Not monitoring specific groups
  return monitored.split(',').map(g => g.trim()).includes(groupId);
}

/**
 * Determine if a message should be processed by PinhoOps.
 */
export function shouldProcessMessage(message: WhatsAppIncomingMessage): boolean {
  // Always process if contains @PinhoOps trigger
  if (/@PinhoOps/i.test(message.text)) return true;

  // Process all DMs (non-group messages)
  if (!message.isGroup) return true;

  // Process messages from monitored groups
  if (isMonitoredGroup(message.groupId)) return true;

  return false;
}
