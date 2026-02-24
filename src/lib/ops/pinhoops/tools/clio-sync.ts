/**
 * PinhoOps AI — Clio Billing Sync Tool
 *
 * Syncs approved time entries from billing_ledger.json to Clio V4.
 * Requires human approval before execution.
 *
 * Flow:
 *   1. Read billing_ledger.json from GitHub
 *   2. Find entries with approval_status = "Approved"
 *   3. Create time entries in Clio V4 via API
 *   4. Update billing_ledger.json with clio_time_entry_id
 *   5. Set approval_status = "Synced to Clio"
 *   6. Commit updated state to GitHub with audit trail
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { readState, commitWithAudit, STATE_FILES, type StateFile } from '@/lib/ops/github';
import { createClioTimeEntry } from '@/lib/ops/integrations/clio-v4';
import type { BillingLedgerDocument, TimeEntry } from '@/lib/ops/schemas/billing_ledger.schema';
import { opsLog } from '@/lib/ops/pinhoops/logger';

// ─── Sync All Approved Entries ──────────────────────────

export const syncBillingToClioTool = tool(
  async ({ matter_id, dry_run }: { matter_id?: string; dry_run?: boolean }) => {
    const log = opsLog.child('clio-sync');
    log.info('Starting billing sync', { matter_id: matter_id || 'all', dry_run });

    try {
      // 1. Read current billing state
      const { data: ledger } = await readState<BillingLedgerDocument>(
        STATE_FILES.billing as StateFile,
      );

      // 2. Find approved entries that haven't been synced yet
      const toSync: Array<{
        matter: typeof ledger.matters[number];
        entry: TimeEntry;
        matterIndex: number;
        entryIndex: number;
      }> = [];

      for (let mi = 0; mi < ledger.matters.length; mi++) {
        const matter = ledger.matters[mi];

        // Filter by matter_id if specified
        if (matter_id && matter.clio_matter_id !== matter_id) continue;

        for (let ei = 0; ei < matter.time_entries.length; ei++) {
          const entry = matter.time_entries[ei];
          if (entry.approval_status === 'Approved' && !entry.clio_time_entry_id) {
            toSync.push({ matter, entry, matterIndex: mi, entryIndex: ei });
          }
        }
      }

      if (toSync.length === 0) {
        log.info('No approved entries to sync');
        return JSON.stringify({
          status: 'no_entries',
          message: 'No approved time entries found to sync to Clio.',
          matter_id: matter_id || 'all',
        });
      }

      // 3. Dry run — just report what would be synced
      if (dry_run) {
        const preview = toSync.map(({ matter, entry }) => ({
          matter: matter.matter_name,
          clio_matter_id: matter.clio_matter_id,
          entry_id: entry.id,
          date: entry.date,
          attorney: entry.attorney,
          hours: entry.hours,
          rate: entry.rate,
          amount: entry.amount,
          description: entry.description,
        }));

        log.info('Dry run complete', { entries_count: preview.length });
        return JSON.stringify({
          status: 'dry_run',
          message: `Would sync ${preview.length} entries to Clio.`,
          entries: preview,
          total_amount: preview.reduce((sum, e) => sum + e.amount, 0),
          total_hours: preview.reduce((sum, e) => sum + e.hours, 0),
        });
      }

      // 4. Sync each entry to Clio
      const results: Array<{
        entry_id: string;
        clio_id: number;
        status: 'synced' | 'failed';
        error?: string;
      }> = [];

      for (const { matter, entry, matterIndex, entryIndex } of toSync) {
        try {
          const clioMatterId = parseInt(matter.clio_matter_id, 10);
          if (isNaN(clioMatterId)) {
            throw new Error(`Invalid Clio matter ID: ${matter.clio_matter_id}`);
          }

          log.info('Syncing entry to Clio', {
            entry_id: entry.id,
            matter: matter.matter_name,
            hours: entry.hours,
          });

          const clioResult = await createClioTimeEntry({
            date: entry.date,
            hours: entry.hours,
            rate: entry.rate,
            description: `[${entry.attorney}] ${entry.description}`,
            matter_id: clioMatterId,
          });

          // Update the entry in our ledger
          ledger.matters[matterIndex].time_entries[entryIndex] = {
            ...entry,
            approval_status: 'Synced to Clio',
            clio_time_entry_id: String(clioResult.data.id),
          };

          results.push({
            entry_id: entry.id,
            clio_id: clioResult.data.id,
            status: 'synced',
          });

          log.info('Entry synced successfully', {
            entry_id: entry.id,
            clio_id: clioResult.data.id,
          });
        } catch (err: any) {
          log.error('Failed to sync entry', {
            entry_id: entry.id,
            error: err.message,
          });

          results.push({
            entry_id: entry.id,
            clio_id: 0,
            status: 'failed',
            error: err.message,
          });
        }
      }

      // 5. Update ledger timestamp
      ledger.last_updated = new Date().toISOString();

      // 6. Commit updated state to GitHub
      const synced = results.filter(r => r.status === 'synced');
      if (synced.length > 0) {
        await commitWithAudit(
          { [STATE_FILES.billing]: ledger },
          `Synced ${synced.length} time entries to Clio` +
            (matter_id ? ` for matter ${matter_id}` : ''),
          'billing-sync',
        );
        log.info('Billing state committed to GitHub', { synced_count: synced.length });
      }

      const totalSynced = synced.length;
      const totalFailed = results.filter(r => r.status === 'failed').length;
      const totalAmount = toSync
        .filter((_, i) => results[i].status === 'synced')
        .reduce((sum, { entry }) => sum + entry.amount, 0);

      return JSON.stringify({
        status: 'completed',
        message: `Synced ${totalSynced} entries to Clio (${totalFailed} failed).`,
        synced: totalSynced,
        failed: totalFailed,
        total_amount: totalAmount,
        results,
      });
    } catch (err: any) {
      log.error('Billing sync failed', { error: err.message });
      return JSON.stringify({
        status: 'error',
        message: `Billing sync failed: ${err.message}`,
      });
    }
  },
  {
    name: 'sync_billing_to_clio',
    description:
      'Sync approved time entries from billing_ledger.json to Clio V4. ' +
      'Use dry_run=true to preview without syncing. ' +
      'REQUIRES HUMAN APPROVAL before actual sync (dry_run=false). ' +
      'Optionally filter by matter_id.',
    schema: z.object({
      matter_id: z
        .string()
        .optional()
        .describe('Clio matter ID to filter. Omit to sync all approved entries.'),
      dry_run: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true, preview entries without syncing. Default: true.'),
    }),
  },
);

// ─── Get Sync Status ────────────────────────────────────

export const getSyncStatusTool = tool(
  async ({ matter_id }: { matter_id?: string }) => {
    const { data: ledger } = await readState<BillingLedgerDocument>(
      STATE_FILES.billing as StateFile,
    );

    const stats = {
      draft: 0,
      pending_approval: 0,
      approved: 0,
      synced: 0,
      total_entries: 0,
      total_unsynced_amount: 0,
    };

    for (const matter of ledger.matters) {
      if (matter_id && matter.clio_matter_id !== matter_id) continue;

      for (const entry of matter.time_entries) {
        stats.total_entries++;
        switch (entry.approval_status) {
          case 'Draft':
            stats.draft++;
            stats.total_unsynced_amount += entry.amount;
            break;
          case 'Pending Approval':
            stats.pending_approval++;
            stats.total_unsynced_amount += entry.amount;
            break;
          case 'Approved':
            stats.approved++;
            stats.total_unsynced_amount += entry.amount;
            break;
          case 'Synced to Clio':
            stats.synced++;
            break;
        }
      }
    }

    return JSON.stringify({
      matter_id: matter_id || 'all',
      ...stats,
      ready_to_sync: stats.approved,
      message:
        stats.approved > 0
          ? `${stats.approved} entries ready to sync ($${stats.total_unsynced_amount.toFixed(2)} total unsynced)`
          : 'No entries ready to sync. Entries need to be approved first.',
    });
  },
  {
    name: 'get_billing_sync_status',
    description:
      'Check the sync status of billing entries. Shows counts by approval status ' +
      'and how many are ready to sync to Clio.',
    schema: z.object({
      matter_id: z.string().optional().describe('Filter by Clio matter ID. Omit for all.'),
    }),
  },
);
