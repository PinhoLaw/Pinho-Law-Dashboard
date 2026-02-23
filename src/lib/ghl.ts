// GoHighLevel API client for WhatsApp messaging

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_KEY = process.env.GHL_API_KEY!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;
const GHL_API_VERSION = '2021-07-28';

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${GHL_API_KEY}`,
    'Content-Type': 'application/json',
    Version: GHL_API_VERSION,
  };
}

// Search for a contact by phone number
export async function findContactByPhone(phone: string) {
  // Normalize phone - strip spaces, parens, dashes
  const normalized = phone.replace(/[\s\-()]/g, '');

  const res = await fetch(
    `${GHL_API_BASE}/contacts/?locationId=${GHL_LOCATION_ID}&query=${encodeURIComponent(normalized)}&limit=5`,
    { headers: headers() }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL contact search failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.contacts || [];
}

// Create a new contact in GHL
export async function createContact(name: string, phone: string, email?: string) {
  const body: Record<string, string> = {
    locationId: GHL_LOCATION_ID,
    name,
    phone,
    source: 'PinhoLaw Dashboard',
  };
  if (email) body.email = email;

  const res = await fetch(`${GHL_API_BASE}/contacts/`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL create contact failed: ${res.status} ${text}`);
  }

  return res.json();
}

// Send a WhatsApp message via GHL Conversations API
export async function sendWhatsApp(contactId: string, message: string) {
  const res = await fetch(`${GHL_API_BASE}/conversations/messages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      type: 'WhatsApp',
      contactId,
      message,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL send WhatsApp failed: ${res.status} ${text}`);
  }

  return res.json();
}

// Send an SMS message via GHL (fallback when WhatsApp not available)
export async function sendSMS(contactId: string, message: string) {
  const res = await fetch(`${GHL_API_BASE}/conversations/messages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      type: 'SMS',
      contactId,
      message,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL send SMS failed: ${res.status} ${text}`);
  }

  return res.json();
}

// Get recent conversations
export async function getConversations(limit = 20) {
  const res = await fetch(
    `${GHL_API_BASE}/conversations/search?locationId=${GHL_LOCATION_ID}&limit=${limit}`,
    { headers: headers() }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL conversations search failed: ${res.status} ${text}`);
  }

  return res.json();
}

// Get messages in a conversation
export async function getConversationMessages(conversationId: string) {
  const res = await fetch(
    `${GHL_API_BASE}/conversations/${conversationId}/messages`,
    { headers: headers() }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL get messages failed: ${res.status} ${text}`);
  }

  return res.json();
}
