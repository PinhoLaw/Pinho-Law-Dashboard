/**
 * PinhoOps AI v1.0 — LangGraph Tools
 *
 * Tools available to all agent nodes for interacting with
 * GitHub state, Clio, and Microsoft Graph.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { readState, writeState, commitWithAudit, STATE_FILES, type StateFile } from '@/lib/ops/github';
import { createClioTask, createClioTimeEntry } from '@/lib/ops/integrations/clio-v4';
import { readCalendarEvents, createExecutionBlock, checkConflicts } from '@/lib/ops/integrations/microsoft-graph';
import { syncBillingToClioTool, getSyncStatusTool } from '@/lib/ops/pinhoops/tools/clio-sync';

// ─── GitHub State Tools ──────────────────────────────────

export const readStateTool = tool(
  async ({ file }: { file: string }) => {
    const { data } = await readState(file as StateFile);
    return JSON.stringify(data, null, 2);
  },
  {
    name: 'read_state',
    description: 'Read a JSON state file from GitHub. Files: tasks.json, billing_ledger.json, sales_pipeline.json, promises.json, kpi_dashboard.json',
    schema: z.object({
      file: z.enum(['tasks.json', 'billing_ledger.json', 'sales_pipeline.json', 'promises.json', 'kpi_dashboard.json']),
    }),
  },
);

export const writeStateTool = tool(
  async ({ file, data, message }: { file: string; data: string; message: string }) => {
    const parsed = JSON.parse(data);
    const result = await commitWithAudit(
      { [file as StateFile]: parsed },
      message,
      'pinhoops-agent',
    );
    return `Committed: ${result.commitSha.substring(0, 7)} — ${result.filesUpdated.join(', ')}`;
  },
  {
    name: 'write_state',
    description: 'Write updated JSON state to GitHub with audit commit. Always include a descriptive message.',
    schema: z.object({
      file: z.enum(['tasks.json', 'billing_ledger.json', 'sales_pipeline.json', 'promises.json', 'kpi_dashboard.json']),
      data: z.string().describe('JSON string of the updated state'),
      message: z.string().describe('Audit commit message describing what changed'),
    }),
  },
);

// ─── Clio Tools ──────────────────────────────────────────

export const createClioTaskTool = tool(
  async ({ name, description, due_at, matter_id }: {
    name: string; description: string; due_at: string; matter_id: number;
  }) => {
    const result = await createClioTask({
      name,
      description,
      due_at,
      matter: { id: matter_id },
    });
    return `Clio task created: ${result.data.id} — ${name}`;
  },
  {
    name: 'create_clio_task',
    description: 'Create a new task on a Clio matter.',
    schema: z.object({
      name: z.string(),
      description: z.string(),
      due_at: z.string().describe('ISO 8601 date-time'),
      matter_id: z.number().describe('Clio matter ID'),
    }),
  },
);

export const createClioTimeEntryTool = tool(
  async ({ date, hours, rate, description, matter_id }: {
    date: string; hours: number; rate: number; description: string; matter_id: number;
  }) => {
    const result = await createClioTimeEntry({ date, hours, rate, description, matter_id });
    return `Clio time entry created: ${result.data.id} — ${hours}h @ $${rate}`;
  },
  {
    name: 'create_clio_time_entry',
    description: 'Create a time entry on a Clio matter. Requires billing approval for high amounts.',
    schema: z.object({
      date: z.string().describe('YYYY-MM-DD'),
      hours: z.number(),
      rate: z.number(),
      description: z.string(),
      matter_id: z.number(),
    }),
  },
);

// ─── Calendar Tools ──────────────────────────────────────

export const readCalendarTool = tool(
  async ({ start_date, end_date }: { start_date: string; end_date: string }) => {
    const events = await readCalendarEvents(start_date, end_date);
    return JSON.stringify(events.map(e => ({
      subject: e.subject,
      start: e.start.dateTime,
      end: e.end.dateTime,
      categories: e.categories,
    })), null, 2);
  },
  {
    name: 'read_calendar',
    description: 'Read Outlook calendar events for a date range.',
    schema: z.object({
      start_date: z.string().describe('YYYY-MM-DD'),
      end_date: z.string().describe('YYYY-MM-DD'),
    }),
  },
);

export const createExecutionBlockTool = tool(
  async ({ date, start_hour, end_hour, title, matter_id }: {
    date: string; start_hour: number; end_hour: number; title?: string; matter_id?: string;
  }) => {
    // Check for conflicts first
    const { hasConflict, conflicts } = await checkConflicts(date, start_hour, end_hour);
    if (hasConflict) {
      return `BLOCKED: Conflicts with ${conflicts.length} event(s): ${conflicts.map(c => c.subject).join(', ')}`;
    }

    const event = await createExecutionBlock({
      date, startHour: start_hour, endHour: end_hour, title, matterId: matter_id,
    });
    return `Execution block created: ${event.id} — ${date} ${start_hour}:00-${end_hour}:00`;
  },
  {
    name: 'create_execution_block',
    description: 'Create a protected execution block on the calendar (SOP §6). Checks for conflicts automatically.',
    schema: z.object({
      date: z.string().describe('YYYY-MM-DD'),
      start_hour: z.number().describe('Start hour (0-23)'),
      end_hour: z.number().describe('End hour (0-23)'),
      title: z.string().optional(),
      matter_id: z.string().optional(),
    }),
  },
);

// ─── Clio Sync Tools (re-export) ─────────────────────────

export { syncBillingToClioTool, getSyncStatusTool };

// ─── WhatsApp Tools ─────────────────────────────────────

export const sendWhatsAppTool = tool(
  async ({ to, message, reply_to }: {
    to: string; message: string; reply_to?: string;
  }) => {
    const { sendWhatsAppMessage } = await import('@/lib/ops/pinhoops/tools/whatsapp');
    const result = await sendWhatsAppMessage(to, message, reply_to);
    if (!result) return 'Failed to send WhatsApp message. Check credentials.';
    return `WhatsApp sent to ${to}: ${result.messages?.[0]?.id || 'ok'}`;
  },
  {
    name: 'send_whatsapp',
    description: 'Send a WhatsApp message to a phone number. Use for follow-ups, billing reminders, and client updates. Messages should be in Brazilian Portuguese, under 500 chars, signed "Equipe PinhoLaw".',
    schema: z.object({
      to: z.string().describe('Phone number in international format (e.g., "15551234567")'),
      message: z.string().describe('Message text with WhatsApp formatting (*bold*, _italic_)'),
      reply_to: z.string().optional().describe('Message ID to reply to'),
    }),
  },
);

// ─── All Tools ───────────────────────────────────────────

export const ALL_TOOLS = [
  readStateTool,
  writeStateTool,
  createClioTaskTool,
  createClioTimeEntryTool,
  readCalendarTool,
  createExecutionBlockTool,
  syncBillingToClioTool,
  getSyncStatusTool,
  sendWhatsAppTool,
];
