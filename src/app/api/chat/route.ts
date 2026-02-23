import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readOngoingMatters } from '@/lib/sheets';
import { isAuthenticated } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set in environment variables');
  }
  return new Anthropic({ apiKey });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { messages } = await req.json();

    // Fetch current sheet data for context
    const matters = await readOngoingMatters();

    const active = matters.filter(m => m.statusClio !== 'Closed');
    const outstanding = matters.filter(m => Number(m.clioOutstanding) > 0);
    const totalOwed = outstanding.reduce((s, m) => s + Number(m.clioOutstanding), 0);
    const flagged = matters.filter(m => m.sendWaUpdate);
    const stale = matters.filter(m => {
      const days = Number(m.daysSinceLastWa);
      return !isNaN(days) && days >= 7;
    });
    const noPhone = matters.filter(m => !m.whatsAppPhone);

    // Build top 15 owing clients for context
    const topOwing = outstanding
      .sort((a, b) => Number(b.clioOutstanding) - Number(a.clioOutstanding))
      .slice(0, 15)
      .map(m => `  - ${m.clientFullName} (${m.clioMatter}): $${Number(m.clioOutstanding).toFixed(2)} outstanding, $${Number(m.clioPaid).toFixed(2)} paid | ${m.responsiblePerson} | Area: ${m.area || 'N/A'} | Phone: ${m.whatsAppPhone || 'MISSING'} | Last WA: ${m.lastWaSent || 'Never'}`);

    // Build team workload
    const workloadMap = new Map<string, { count: number; outstanding: number }>();
    for (const m of active) {
      const person = m.responsiblePerson || 'Unassigned';
      const existing = workloadMap.get(person) || { count: 0, outstanding: 0 };
      existing.count++;
      existing.outstanding += Number(m.clioOutstanding) || 0;
      workloadMap.set(person, existing);
    }
    const workload = Array.from(workloadMap.entries())
      .sort((a, b) => b[1].outstanding - a[1].outstanding)
      .map(([p, w]) => `  - ${p}: ${w.count} matters, $${w.outstanding.toFixed(2)} outstanding`);

    const systemPrompt = `You are the PinhoLaw AI Assistant — a sharp, knowledgeable legal operations agent for PinhoLaw, a Brazilian-American immigration and business law firm in Orlando, FL run by attorney Izi Pinho.

You help the Controller (office manager) and Izi manage their caseload. You have real-time access to the firm's Google Sheet data.

CURRENT DATA SNAPSHOT (${new Date().toLocaleDateString()}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Active Matters: ${active.length}
Total Outstanding: $${totalOwed.toFixed(2)}
Clients with Balance: ${outstanding.length}
Flagged for WA Update: ${flagged.length}
Stale (7+ days no contact): ${stale.length}
Missing WhatsApp Phone: ${noPhone.length}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOP 15 OWING CLIENTS:
${topOwing.join('\n')}

TEAM WORKLOAD:
${workload.join('\n')}

ALL MATTERS DATA: You have access to ${matters.length} matters. When the user asks about specific clients or matters, search through your data context.

FULL MATTERS LIST (for reference):
${matters.slice(0, 50).map(m => `${m.clioMatter} | ${m.clientFullName} | ${m.statusClio} | $${m.clioOutstanding} out / $${m.clioPaid} paid | ${m.responsiblePerson} | ${m.area || 'N/A'} | Phone: ${m.whatsAppPhone || 'NONE'} | Last WA: ${m.lastWaSent || 'Never'} | Days: ${m.daysSinceLastWa || 'N/A'}`).join('\n')}
${matters.length > 50 ? `\n... and ${matters.length - 50} more matters (ask me about specific ones)` : ''}

RULES:
- Be concise but thorough. Use tables and bullet points.
- When asked about billing/money, always reference specific dollar amounts.
- When recommending actions, be specific: "Flag row X for WhatsApp update" or "Contact [client] about $X outstanding balance."
- You understand both English and Portuguese. Respond in whatever language the user writes in.
- You can suggest WhatsApp messages in Brazilian Portuguese when asked.
- If asked to flag someone for WA update, explain they can use the Flag button in the WhatsApp tab.
- You know the firm handles immigration, business law, litigation, and registered agent services.`;

    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    return NextResponse.json({ message: text });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Chat API error:', errMsg);
    if (errMsg.includes('credit balance')) {
      return NextResponse.json({ error: 'AI credits are low. Top up at console.anthropic.com to enable the assistant.' }, { status: 402 });
    }
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
