/**
 * taskDelegationAgent — OpenClaw/Kimi Claw Custom Skill
 *
 * SOP v1.0 §9.5 Escalation Ladder + §3 Team Roster
 * SOP v1.0 §5 Delegation & Accountability
 *
 * Responsibilities:
 * - Assign/reassign tasks to team members
 * - Enforce escalation ladder when deadlines are at risk
 * - Balance workload across the team
 * - Read/write tasks.json via GitHub helpers
 * - Return structured WhatsApp reply
 */

import { readState, commitWithAudit, STATE_FILES } from '@/lib/ops/github';

// ─── SOP Rules ───────────────────────────────────────────

const SOP_RULES = {
  ref: '§3, §5, §9.5',
  name: 'Task Delegation',

  // §3: Team Roster
  roster: [
    { name: 'Guillerme', role: 'Attorney', maxMatters: 25, specialties: ['Litigation', 'Corporate'] },
    { name: 'Inez', role: 'Paralegal', maxMatters: 30, specialties: ['Immigration', 'Family'] },
    { name: 'Daniel', role: 'Attorney', maxMatters: 25, specialties: ['Immigration', 'Real Estate'] },
    { name: 'Mariana', role: 'Paralegal', maxMatters: 30, specialties: ['Litigation', 'Criminal'] },
  ],

  // §9.5: Escalation Ladder
  escalationLadder: [
    { level: 1, trigger: 'deadline_within_48h', action: 'Notify assigned person', notify: 'assigned_to' },
    { level: 2, trigger: 'deadline_within_24h', action: 'Notify lead attorney', notify: 'lead_attorney' },
    { level: 3, trigger: 'deadline_missed', action: 'Notify managing partner', notify: 'Guillerme' },
    { level: 4, trigger: 'deadline_missed_72h', action: 'Emergency escalation to all partners', notify: 'ALL_PARTNERS' },
  ],

  maxReassignmentsPerDay: 10,
};

// ─── Tool Definition ─────────────────────────────────────

export const taskDelegationAgentTool = {
  name: 'taskDelegationAgent',
  description:
    'Handles task assignment, reassignment, workload balancing, and escalation ladder enforcement (SOP §3, §5, §9.5). ' +
    'Parses WhatsApp requests about delegation and team workload.',
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

export async function taskDelegationAgent(input) {
  const { whatsapp_input } = input;
  const log = createAuditLog('taskDelegationAgent', whatsapp_input);

  try {
    log.step('Loading tasks state from GitHub');
    const { data: tasksDoc } = await readState(STATE_FILES.tasks);

    const intent = parseDelegationIntent(whatsapp_input.message_text);
    log.step(`Parsed intent: ${intent.type}`);

    let reply = '';
    let stateUpdated = false;

    switch (intent.type) {
      case 'assign': {
        const matter = tasksDoc.matters.find(m =>
          m.clio_matter_id === intent.matter_id || m.client.toLowerCase().includes((intent.matter_id || '').toLowerCase())
        );
        if (!matter) {
          reply = `Matter "${intent.matter_id}" not found.`;
          break;
        }

        const person = SOP_RULES.roster.find(r => r.name.toLowerCase() === (intent.assignee || '').toLowerCase());
        if (!person) {
          reply = `Person "${intent.assignee}" not in roster.\nTeam: ${SOP_RULES.roster.map(r => r.name).join(', ')}`;
          break;
        }

        // Check workload capacity
        const currentLoad = tasksDoc.matters.filter(m =>
          m.status !== 'Archived' && (m.assigned_to === person.name || m.lead_attorney === person.name || m.paralegal === person.name)
        ).length;

        if (currentLoad >= person.maxMatters) {
          reply =
            `*Workload Warning*\n` +
            `${person.name} has ${currentLoad}/${person.maxMatters} matters.\n` +
            `Cannot assign more without reassigning existing work.\n\n` +
            `Use "workload" to see team capacity.`;
          break;
        }

        // Apply assignment
        const idx = tasksDoc.matters.indexOf(matter);
        const oldAssignee = tasksDoc.matters[idx].assigned_to;
        tasksDoc.matters[idx].assigned_to = person.name;
        if (person.role === 'Attorney') {
          tasksDoc.matters[idx].lead_attorney = person.name;
        } else {
          tasksDoc.matters[idx].paralegal = person.name;
        }
        tasksDoc.matters[idx].updated_at = new Date().toISOString();
        tasksDoc.last_updated = new Date().toISOString();

        await commitWithAudit(
          { [STATE_FILES.tasks]: tasksDoc },
          `Reassigned ${matter.clio_matter_id} from ${oldAssignee} to ${person.name}`,
          whatsapp_input.sender_name || whatsapp_input.sender_phone,
        );
        stateUpdated = true;

        reply =
          `*Task Assigned*\n` +
          `Matter: ${matter.client} (${matter.clio_matter_id})\n` +
          `From: ${oldAssignee}\n` +
          `To: ${person.name} (${person.role})\n` +
          `Current load: ${currentLoad + 1}/${person.maxMatters}`;
        break;
      }

      case 'workload': {
        const active = tasksDoc.matters.filter(m => m.status !== 'Archived');
        const workload = SOP_RULES.roster.map(person => {
          const matters = active.filter(m =>
            m.assigned_to === person.name || m.lead_attorney === person.name || m.paralegal === person.name
          );
          const overdue = matters.filter(m => m.deadline < new Date().toISOString().split('T')[0]);
          return {
            name: person.name,
            role: person.role,
            count: matters.length,
            max: person.maxMatters,
            overdue: overdue.length,
            pct: Math.round((matters.length / person.maxMatters) * 100),
          };
        });

        reply =
          `*Team Workload*\n\n` +
          workload.map(w =>
            `${w.name} (${w.role}): ${w.count}/${w.max} (${w.pct}%)${w.overdue > 0 ? ` — ${w.overdue} overdue` : ''}`
          ).join('\n');
        break;
      }

      case 'escalate': {
        const matter = tasksDoc.matters.find(m =>
          m.clio_matter_id === intent.matter_id
        );
        if (!matter) {
          reply = `Matter "${intent.matter_id}" not found.`;
          break;
        }

        const today = new Date();
        const deadline = new Date(matter.deadline);
        const hoursUntil = (deadline - today) / 3_600_000;

        let level = 0;
        if (hoursUntil < -72) level = 4;
        else if (hoursUntil < 0) level = 3;
        else if (hoursUntil < 24) level = 2;
        else if (hoursUntil < 48) level = 1;

        if (level === 0) {
          reply = `No escalation needed for ${matter.client}. Deadline: ${matter.deadline} (${Math.round(hoursUntil)}h away).`;
          break;
        }

        const esc = SOP_RULES.escalationLadder[level - 1];
        const idx = tasksDoc.matters.indexOf(matter);
        tasksDoc.matters[idx].risk_level = level >= 3 ? 'Critical' : 'Elevated';
        tasksDoc.matters[idx].updated_at = new Date().toISOString();
        tasksDoc.last_updated = new Date().toISOString();

        await commitWithAudit(
          { [STATE_FILES.tasks]: tasksDoc },
          `Escalation L${level} for ${matter.clio_matter_id}: ${esc.action}`,
          whatsapp_input.sender_name || whatsapp_input.sender_phone,
        );
        stateUpdated = true;

        reply =
          `*Escalation Level ${level}*\n` +
          `Matter: ${matter.client} (${matter.clio_matter_id})\n` +
          `Trigger: ${esc.trigger}\n` +
          `Action: ${esc.action}\n` +
          `Notify: ${esc.notify}\n` +
          `Risk: ${tasksDoc.matters[idx].risk_level}`;
        break;
      }

      case 'check_escalations': {
        const today = new Date();
        const active = tasksDoc.matters.filter(m => m.status !== 'Archived');
        const needsEscalation = active.filter(m => {
          const hoursUntil = (new Date(m.deadline) - today) / 3_600_000;
          return hoursUntil < 48;
        }).sort((a, b) => a.deadline.localeCompare(b.deadline));

        if (needsEscalation.length === 0) {
          reply = `*No escalations needed.* All deadlines are 48+ hours away.`;
        } else {
          reply =
            `*Matters Needing Escalation: ${needsEscalation.length}*\n\n` +
            needsEscalation.map(m => {
              const hoursUntil = Math.round((new Date(m.deadline) - today) / 3_600_000);
              return `• ${m.client} (${m.clio_matter_id}): ${hoursUntil}h — ${m.next_action}`;
            }).join('\n');
        }
        break;
      }

      default:
        reply =
          `Delegation commands:\n` +
          `• "assign MATTER-ID to NAME"\n` +
          `• "workload"\n` +
          `• "escalate MATTER-ID"\n` +
          `• "check escalations"`;
    }

    log.step('Complete');
    return { reply, state_updated: stateUpdated, audit: log.finalize() };
  } catch (err) {
    log.error(err.message);
    return {
      reply: `Delegation agent error: ${err.message}`,
      state_updated: false,
      audit: log.finalize(),
    };
  }
}

// ─── Intent Parser ───────────────────────────────────────

function parseDelegationIntent(text) {
  const lower = text.toLowerCase().trim();

  const assignMatch = text.match(/assign\s+(\S+)\s+to\s+(\w+)/i);
  if (assignMatch) {
    return { type: 'assign', matter_id: assignMatch[1], assignee: assignMatch[2] };
  }

  if (/^(workload|carga|team|equipe)/i.test(lower)) {
    return { type: 'workload' };
  }

  const escalateMatch = text.match(/escalate\s+(\S+)/i);
  if (escalateMatch) {
    return { type: 'escalate', matter_id: escalateMatch[1] };
  }

  if (/^(check escalation|escalations|urgente)/i.test(lower)) {
    return { type: 'check_escalations' };
  }

  return { type: 'unknown' };
}

function createAuditLog(agent, input) {
  const entries = [];
  const start = Date.now();
  return {
    step(msg) { entries.push({ ts: new Date().toISOString(), msg }); },
    error(msg) { entries.push({ ts: new Date().toISOString(), msg: `ERROR: ${msg}` }); },
    finalize() {
      return {
        agent, input_phone: input.sender_phone,
        started_at: new Date(start).toISOString(),
        duration_ms: Date.now() - start, steps: entries,
      };
    },
  };
}

export default taskDelegationAgent;
