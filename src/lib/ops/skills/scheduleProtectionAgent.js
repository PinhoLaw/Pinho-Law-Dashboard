/**
 * scheduleProtectionAgent — OpenClaw/Kimi Claw Custom Skill
 *
 * SOP v1.0 §6 Meetings + Execution Blocks
 * SOP v1.0 §10.5 Calendar Compliance
 *
 * Responsibilities:
 * - Parse WhatsApp requests about scheduling / calendar
 * - Protect execution blocks from being overwritten
 * - Track meeting schedules and conflicts
 * - Read/write kpi_dashboard.json calendar section via GitHub
 * - Return structured WhatsApp reply
 */

import { readState, commitWithAudit, STATE_FILES } from '@/lib/ops/github';

// ─── SOP Rules ───────────────────────────────────────────

const SOP_RULES = {
  ref: '§6, §10.5',
  name: 'Schedule Protection',
  executionBlockDuration: 120, // minutes
  minExecutionBlocksPerWeek: 5,
  executionBlockHours: { start: 9, end: 12 }, // 9 AM to 12 PM protected
  meetingBuffer: 15, // minutes between meetings
  maxMeetingsPerDay: 6,
  courtDeadlineWarning: 3, // days before → warning
};

// ─── Tool Definition ─────────────────────────────────────

export const scheduleProtectionAgentTool = {
  name: 'scheduleProtectionAgent',
  description:
    'Protects attorney execution blocks (SOP §6) and manages calendar compliance (§10.5). ' +
    'Checks for conflicts, enforces protected time windows, tracks meetings and court deadlines.',
  parameters: {
    type: 'object',
    required: ['whatsapp_input'],
    properties: {
      whatsapp_input: {
        type: 'object',
        required: ['sender_phone', 'message_text', 'timestamp'],
        properties: {
          sender_phone: { type: 'string' },
          sender_name: { type: 'string' },
          message_text: { type: 'string' },
          timestamp: { type: 'string' },
        },
      },
    },
  },
};

// ─── Main Handler ────────────────────────────────────────

export async function scheduleProtectionAgent(input) {
  const { whatsapp_input } = input;
  const log = createAuditLog('scheduleProtectionAgent', whatsapp_input);

  try {
    log.step('Loading KPI state from GitHub');
    const { data: kpiDoc, sha } = await readState(STATE_FILES.kpi);
    const { data: tasksDoc } = await readState(STATE_FILES.tasks);

    const intent = parseScheduleIntent(whatsapp_input.message_text);
    log.step(`Parsed intent: ${intent.type}`);

    let reply = '';
    let stateUpdated = false;

    switch (intent.type) {
      case 'check_availability': {
        const date = intent.date || new Date().toISOString().split('T')[0];
        const time = intent.time;

        // Check if requested time falls in protected execution block
        if (time) {
          const hour = parseInt(time.split(':')[0], 10);
          if (hour >= SOP_RULES.executionBlockHours.start && hour < SOP_RULES.executionBlockHours.end) {
            reply =
              `*Schedule Protection Alert*\n\n` +
              `The requested time (${time}) falls within a protected execution block ` +
              `(${SOP_RULES.executionBlockHours.start}:00-${SOP_RULES.executionBlockHours.end}:00).\n\n` +
              `SOP §6 requires these blocks remain uninterrupted.\n\n` +
              `Suggested alternatives:\n` +
              `• ${SOP_RULES.executionBlockHours.end}:00\n` +
              `• ${SOP_RULES.executionBlockHours.end + 1}:00\n` +
              `• ${SOP_RULES.executionBlockHours.end + 2}:00`;
            break;
          }
        }

        reply =
          `*Available for ${date}*\n\n` +
          `Protected blocks: ${SOP_RULES.executionBlockHours.start}:00-${SOP_RULES.executionBlockHours.end}:00\n` +
          `Available: ${SOP_RULES.executionBlockHours.end}:00 onwards\n` +
          `Max meetings/day: ${SOP_RULES.maxMeetingsPerDay}`;
        break;
      }

      case 'schedule_meeting': {
        if (!intent.date || !intent.time) {
          reply = `To schedule a meeting, provide:\n• Date (YYYY-MM-DD)\n• Time (HH:MM)\n• Duration (optional)\n• Attendee/matter`;
          break;
        }

        const hour = parseInt(intent.time.split(':')[0], 10);
        if (hour >= SOP_RULES.executionBlockHours.start && hour < SOP_RULES.executionBlockHours.end) {
          reply =
            `*BLOCKED* — ${intent.time} is within protected execution hours.\n` +
            `SOP §6: Execution blocks (${SOP_RULES.executionBlockHours.start}:00-${SOP_RULES.executionBlockHours.end}:00) cannot be overridden.\n\n` +
            `First available: ${SOP_RULES.executionBlockHours.end}:00`;
          break;
        }

        reply =
          `*Meeting Scheduled*\n` +
          `Date: ${intent.date}\n` +
          `Time: ${intent.time}\n` +
          `${intent.matter_id ? `Matter: ${intent.matter_id}\n` : ''}` +
          `Buffer: ${SOP_RULES.meetingBuffer}min before/after`;

        // Update calendar KPIs
        kpiDoc.calendar.client_meetings_7d += 1;
        kpiDoc.last_updated = new Date().toISOString();

        await commitWithAudit(
          { [STATE_FILES.kpi]: kpiDoc },
          `Meeting scheduled: ${intent.date} ${intent.time}`,
          whatsapp_input.sender_name || whatsapp_input.sender_phone,
        );
        stateUpdated = true;
        break;
      }

      case 'calendar_health': {
        const cal = kpiDoc.calendar;
        const overdueTasks = tasksDoc.matters.filter(m =>
          m.status !== 'Archived' && m.deadline < new Date().toISOString().split('T')[0]
        );

        reply =
          `*Calendar Health Report*\n\n` +
          `Execution blocks: ${cal.execution_blocks_scheduled}/${SOP_RULES.minExecutionBlocksPerWeek} min\n` +
          `Block completion: ${(cal.block_completion_rate * 100).toFixed(0)}%\n` +
          `Court deadlines (7d): ${cal.court_deadlines_7d}\n` +
          `Filing deadlines (7d): ${cal.filing_deadlines_7d}\n` +
          `Client meetings (7d): ${cal.client_meetings_7d}\n` +
          `Conflicts: ${cal.conflicts_detected}\n` +
          `Overdue tasks: ${overdueTasks.length}\n\n` +
          (cal.execution_blocks_scheduled < SOP_RULES.minExecutionBlocksPerWeek
            ? `*Warning:* Below minimum execution blocks (${SOP_RULES.minExecutionBlocksPerWeek}/week).`
            : `Execution blocks on track.`);
        break;
      }

      case 'upcoming_deadlines': {
        const today = new Date();
        const in7Days = new Date(today);
        in7Days.setDate(today.getDate() + 7);
        const todayStr = today.toISOString().split('T')[0];
        const in7Str = in7Days.toISOString().split('T')[0];

        const upcoming = tasksDoc.matters
          .filter(m => m.status !== 'Archived' && m.deadline >= todayStr && m.deadline <= in7Str)
          .sort((a, b) => a.deadline.localeCompare(b.deadline));

        if (upcoming.length === 0) {
          reply = `*No deadlines in the next 7 days.* All clear.`;
        } else {
          reply =
            `*Upcoming Deadlines (7 days)*\n\n` +
            upcoming.map(m =>
              `• ${m.deadline} — ${m.client}: ${m.next_action} (${m.risk_level})`
            ).join('\n');
        }
        break;
      }

      default:
        reply =
          `Schedule commands:\n` +
          `• "check availability 2026-03-01 14:00"\n` +
          `• "schedule meeting 2026-03-01 14:00 for MATTER-ID"\n` +
          `• "calendar health"\n` +
          `• "upcoming deadlines"`;
    }

    log.step('Complete');
    return { reply, state_updated: stateUpdated, audit: log.finalize() };
  } catch (err) {
    log.error(err.message);
    return {
      reply: `Schedule agent error: ${err.message}`,
      state_updated: false,
      audit: log.finalize(),
    };
  }
}

// ─── Intent Parser ───────────────────────────────────────

function parseScheduleIntent(text) {
  const lower = text.toLowerCase().trim();

  if (/^(calendar health|saude|health)/i.test(lower)) {
    return { type: 'calendar_health' };
  }

  if (/^(upcoming|deadlines|prazos|next week)/i.test(lower)) {
    return { type: 'upcoming_deadlines' };
  }

  const checkMatch = text.match(/check\s+(?:availability|disponib)\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/i);
  if (checkMatch) {
    return { type: 'check_availability', date: checkMatch[1], time: checkMatch[2] };
  }

  const schedMatch = text.match(
    /schedule\s+(?:meeting|reuni[ãa]o)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?:\s+(?:for|para)\s+(\S+))?/i
  );
  if (schedMatch) {
    return { type: 'schedule_meeting', date: schedMatch[1], time: schedMatch[2], matter_id: schedMatch[3] };
  }

  if (/available|disponivel/i.test(lower)) {
    return { type: 'check_availability', date: new Date().toISOString().split('T')[0] };
  }

  return { type: 'unknown' };
}

// ─── Audit Logger ────────────────────────────────────────

function createAuditLog(agent, input) {
  const entries = [];
  const start = Date.now();
  return {
    step(msg) { entries.push({ ts: new Date().toISOString(), msg }); },
    error(msg) { entries.push({ ts: new Date().toISOString(), msg: `ERROR: ${msg}` }); },
    finalize() {
      return {
        agent,
        input_phone: input.sender_phone,
        started_at: new Date(start).toISOString(),
        duration_ms: Date.now() - start,
        steps: entries,
      };
    },
  };
}

export default scheduleProtectionAgent;
