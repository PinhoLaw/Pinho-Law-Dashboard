/**
 * GitHub Octokit Helpers — State Management via GitHub Repository
 *
 * Reads/writes JSON state files to a GitHub repo with full audit trail.
 * Every write creates a commit with timestamp, actor, and change description.
 *
 * Environment variables required:
 *   GITHUB_TOKEN          — Personal access token (repo scope)
 *   GITHUB_OWNER          — Repository owner (e.g., "pinholaw")
 *   GITHUB_REPO           — Repository name (e.g., "ops-state")
 *   GITHUB_BRANCH         — Branch to use (default: "main")
 *   GITHUB_STATE_PATH     — Base path for state files (default: "state/")
 */

import { Octokit } from '@octokit/rest';

// ─── Configuration ───────────────────────────────────────

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_OWNER = process.env.GITHUB_OWNER!;
const GITHUB_REPO = process.env.GITHUB_REPO!;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_STATE_PATH = process.env.GITHUB_STATE_PATH || 'state/';

let _octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!_octokit) {
    if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN environment variable not set.');
    if (!GITHUB_OWNER) throw new Error('GITHUB_OWNER environment variable not set.');
    if (!GITHUB_REPO) throw new Error('GITHUB_REPO environment variable not set.');
    _octokit = new Octokit({ auth: GITHUB_TOKEN });
  }
  return _octokit;
}

// ─── State File Names ────────────────────────────────────

export const STATE_FILES = {
  tasks: 'tasks.json',
  billing: 'billing_ledger.json',
  sales: 'sales_pipeline.json',
  promises: 'promises.json',
  kpi: 'kpi_dashboard.json',
} as const;

export type StateFile = typeof STATE_FILES[keyof typeof STATE_FILES];

// ─── Read State ──────────────────────────────────────────

/**
 * Read a JSON state file from the GitHub repository.
 *
 * @param file - Filename (e.g., "tasks.json")
 * @returns Parsed JSON data and the file's SHA (for updates)
 */
export async function readState<T = Record<string, unknown>>(
  file: StateFile,
): Promise<{ data: T; sha: string }> {
  const octokit = getOctokit();
  const path = `${GITHUB_STATE_PATH}${file}`;

  try {
    const response = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path,
      ref: GITHUB_BRANCH,
    });

    // getContent returns file content as base64 when it's a file
    const content = response.data as { content: string; sha: string; encoding: string };

    if (!('content' in content)) {
      throw new Error(`Path "${path}" is a directory, not a file.`);
    }

    const decoded = Buffer.from(content.content, 'base64').toString('utf-8');
    const data = JSON.parse(decoded) as T;

    return { data, sha: content.sha };
  } catch (err: any) {
    if (err.status === 404) {
      throw new Error(
        `State file "${file}" not found at ${GITHUB_OWNER}/${GITHUB_REPO}/${path}. ` +
        `Initialize it first with writeState().`
      );
    }
    throw err;
  }
}

// ─── Write State ─────────────────────────────────────────

/**
 * Write a JSON state file to the GitHub repository.
 * Creates the file if it doesn't exist, updates if it does.
 *
 * @param file - Filename (e.g., "tasks.json")
 * @param data - JSON-serializable data
 * @param sha  - SHA of existing file (for updates). Omit to create new file.
 * @returns The new SHA of the file
 */
export async function writeState<T>(
  file: StateFile,
  data: T,
  sha?: string,
): Promise<{ sha: string; commitSha: string }> {
  const octokit = getOctokit();
  const path = `${GITHUB_STATE_PATH}${file}`;
  const content = Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64');
  const timestamp = new Date().toISOString();

  const message = sha
    ? `[PinhoOps] Update ${file} — ${timestamp}`
    : `[PinhoOps] Initialize ${file} — ${timestamp}`;

  const params: any = {
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path,
    message,
    content,
    branch: GITHUB_BRANCH,
  };

  if (sha) {
    params.sha = sha;
  }

  const response = await octokit.repos.createOrUpdateFileContents(params);

  return {
    sha: response.data.content?.sha || '',
    commitSha: response.data.commit.sha || '',
  };
}

// ─── Commit with Audit ───────────────────────────────────

/**
 * Write multiple state files atomically with a single audit commit.
 * Uses the Git Data API (trees + commits) for atomic multi-file commits.
 *
 * @param updates - Map of file → data to write
 * @param message - Audit commit message
 * @param actor   - Who triggered this change (e.g., "billing-agent", "guillerme")
 * @returns Commit SHA
 */
export async function commitWithAudit(
  updates: Partial<Record<StateFile, unknown>>,
  message: string,
  actor: string = 'pinhoops-system',
): Promise<{ commitSha: string; filesUpdated: string[] }> {
  const octokit = getOctokit();
  const timestamp = new Date().toISOString();

  // 1. Get the current commit SHA for the branch
  const refResponse = await octokit.git.getRef({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    ref: `heads/${GITHUB_BRANCH}`,
  });
  const latestCommitSha = refResponse.data.object.sha;

  // 2. Get the tree SHA from the latest commit
  const commitResponse = await octokit.git.getCommit({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    commit_sha: latestCommitSha,
  });
  const baseTreeSha = commitResponse.data.tree.sha;

  // 3. Create blobs for each file
  const treeItems: Array<{
    path: string;
    mode: '100644';
    type: 'blob';
    sha: string;
  }> = [];

  const filesUpdated: string[] = [];

  for (const [file, data] of Object.entries(updates)) {
    const content = JSON.stringify(data, null, 2) + '\n';
    const blobResponse = await octokit.git.createBlob({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      content,
      encoding: 'utf-8',
    });

    treeItems.push({
      path: `${GITHUB_STATE_PATH}${file}`,
      mode: '100644',
      type: 'blob',
      sha: blobResponse.data.sha,
    });

    filesUpdated.push(file);
  }

  // 4. Create a new tree
  const treeResponse = await octokit.git.createTree({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    base_tree: baseTreeSha,
    tree: treeItems,
  });

  // 5. Create the commit with audit metadata
  const auditMessage = [
    `[PinhoOps] ${message}`,
    '',
    `Actor: ${actor}`,
    `Timestamp: ${timestamp}`,
    `Files: ${filesUpdated.join(', ')}`,
    `SOP Version: PinhoLaw SOP v1.0`,
  ].join('\n');

  const newCommitResponse = await octokit.git.createCommit({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    message: auditMessage,
    tree: treeResponse.data.sha,
    parents: [latestCommitSha],
  });

  // 6. Update the branch reference
  await octokit.git.updateRef({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    ref: `heads/${GITHUB_BRANCH}`,
    sha: newCommitResponse.data.sha,
  });

  return {
    commitSha: newCommitResponse.data.sha,
    filesUpdated,
  };
}

// ─── Audit Log Reader ────────────────────────────────────

/**
 * Read the commit history for a specific state file (audit trail).
 *
 * @param file - Filename to get history for
 * @param count - Number of commits to return (default 20)
 */
export async function getAuditLog(
  file: StateFile,
  count: number = 20,
): Promise<Array<{
  sha: string;
  message: string;
  author: string;
  date: string;
}>> {
  const octokit = getOctokit();
  const path = `${GITHUB_STATE_PATH}${file}`;

  const response = await octokit.repos.listCommits({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path,
    sha: GITHUB_BRANCH,
    per_page: count,
  });

  return response.data.map(c => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name || c.commit.committer?.name || 'unknown',
    date: c.commit.author?.date || c.commit.committer?.date || '',
  }));
}

// ─── Initialize All State Files ──────────────────────────

/**
 * Initialize all state files with empty documents if they don't exist.
 * Safe to call multiple times — skips files that already exist.
 */
export async function initializeStateFiles(
  defaults: Partial<Record<StateFile, unknown>>,
): Promise<string[]> {
  const created: string[] = [];

  for (const [file, defaultData] of Object.entries(defaults)) {
    try {
      await readState(file as StateFile);
      // File exists, skip
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        await writeState(file as StateFile, defaultData);
        created.push(file);
      } else {
        throw err;
      }
    }
  }

  return created;
}
