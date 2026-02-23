import { NextRequest, NextResponse } from 'next/server';
import { findContactByPhone, createContact, sendWhatsApp, sendSMS } from '@/lib/ghl';
import { writeCell } from '@/lib/sheets';

// Column indices for writing back to sheet
const COL_WA_MESSAGE_SENT = 36; // column AK (0-indexed)
const COL_LAST_WA_SENT = 26; // column AA

function colToLetter(col: number): string {
  let letter = '';
  let c = col;
  while (c >= 0) {
    letter = String.fromCharCode((c % 26) + 65) + letter;
    c = Math.floor(c / 26) - 1;
  }
  return letter;
}

export async function POST(req: NextRequest) {
  try {
    const { phone, clientName, message, rowIndex, channel = 'WhatsApp' } = await req.json();

    if (!phone || !message) {
      return NextResponse.json({ error: 'Phone and message are required' }, { status: 400 });
    }

    // Step 1: Find or create contact in GHL
    let contactId: string;
    const existingContacts = await findContactByPhone(phone);

    if (existingContacts.length > 0) {
      contactId = existingContacts[0].id;
    } else {
      // Create new contact
      const created = await createContact(clientName || 'Unknown', phone);
      contactId = created.contact?.id;
      if (!contactId) {
        return NextResponse.json({ error: 'Failed to create contact in GHL' }, { status: 500 });
      }
    }

    // Step 2: Send the message
    let result;
    if (channel === 'SMS') {
      result = await sendSMS(contactId, message);
    } else {
      result = await sendWhatsApp(contactId, message);
    }

    // Step 3: Update the Google Sheet (if rowIndex provided)
    if (rowIndex) {
      try {
        const now = new Date().toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
        });
        // Write last WA sent date
        const lastWaCell = `${colToLetter(COL_LAST_WA_SENT)}${rowIndex}`;
        await writeCell('Ongoing', lastWaCell, now);

        // Write the message that was sent
        const msgCell = `${colToLetter(COL_WA_MESSAGE_SENT)}${rowIndex}`;
        await writeCell('Ongoing', msgCell, message.substring(0, 500));
      } catch (sheetErr) {
        console.error('Failed to update sheet after sending:', sheetErr);
        // Don't fail the whole request - message was already sent
      }
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId || result.id,
      contactId,
      channel,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error('WhatsApp send error:', error);
    return NextResponse.json({ error }, { status: 500 });
  }
}
