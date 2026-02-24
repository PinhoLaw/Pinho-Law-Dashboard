/**
 * GitHub State Management for PinhoOps AI
 * Reads/writes JSON state files to GitHub repo with full audit trail.
 */

import { Octokit } from '@octokit/rest';

// ─── Configuration ───────────────────────────────────────

const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_STATE_PATH = process.env.GITHUB_STATE_PATH || 'state/';

let _octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!_octokit) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN not set');
    if (!process.env.GITHUB_OWNER) throw new Error('GITHUB_OWNER not set');
    if (!process.env.GITHUB_REPO) throw new Error('GITHUB_REPO not set');
    _octokit = new Octokit({ auth: token });
  }
  return _octokit;
}

function getOwner() { return process.env.GITHUB_OWNER!; }
function getRepo() { return process.env.GITHUB_REPO!; }

// ─── State File Names ────────────────────────────────────

export const STATE_FILES = {
  tasks: 'tasks.json',
  billing: 'billing_ledger.json',
  sales: 'sales_pipeline.json',
  promises: 'promises.json',
  kpi: 'kpi_dashboard.json',
} as const;

export type StateFile = (typeof STATE_FILES)[keyof typeof STATE_FILES];

// ─── Read State ──────────────────────────────────────────

export async function readState<T = Record<string, unknown>>(
  file: StateFile,
): Promise<{ data: T; sha: string }> {
  const octokit = getOctokit();
  const path = `${GITHUB_STATE_PATH}${file}`;

  try {
    const response = await octokit.repos.getContent({
      owner: getOwner(),
      repo: getRepo(),
      path,
      ref: GITHUB_BRANCH,
    });

    const content = response.data as { content: string; sha: string };
    if (!('content' in content)) {
      throw new Error(`Path "${path}" is a directory, not a file.`);
    }

    const decoded = Buffer.from(content.content, 'base64').toString('utf-8');
    return { data: JSON.parse(decoded) as T, sha: content.sha };
  } catch (err: any) {
    if (err.status === 404) {
      throw new Error(`State file "${file}" not found. Initialize it first.`);
    }
    throw err;
  }
}

// ─── Write State ─────────────────────────────────────────

export async function writeState<T>(
  file: StateFile,
  data: T,
  sha?: string,
): Promise<{ sha: string; commitSha: string }> {
  const octokit = getOctokit();
  const path = `${GITHUB_STATE_PATH}${file}`;
  const content = Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64');
  const timestamp = new Date().toISOString();

  const params: any = {
    owner: getOwner(),
    repo: getRepo(),
    path,
    message: `[PinhoOps] ${sha ? 'Update' : 'Initialize'} ${file} — ${timestamp}`,
    content,
    branch: GITHUB_BRANCH,
  };
  if (sha) params.sha = sha;

  const response = await octokit.repos.createOrUpdateFileContents(params);
  return {
    sha: response.data.content?.sha || '',
    commitSha: response.data.commit.sha || '',
  };
}

// ─── Commit with Audit ───────────────────────────────────

export async function commitWithAudit(
  updates: Partial<Record<string, unknown>>,
  message: string,
  actor: string = 'pinhoops-system',
): Promise<{ commitSha: string; filesUpdated: string[] }> {
  const octokit = getOctokit();
  const timestamp = new Date().toISOString();

  const refResponse = await octokit.git.getRef({
    owner: getOwner(), repo: getRepo(), ref: `heads/${GITHUB_BRANCH}`,
  });
  const latestCommitSha = refResponse.data.object.sha;

  const commitResponse = await octokit.git.getCommit({
    owner: getOwner(), repo: getRepo(), commit_sha: latestCommitSha,
  });
  const baseTreeSha = commitResponse.data.tree.sha;

  const treeItems: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
  const filesUpdated: string[] = [];

  for (const [file, data] of Object.entries(updates)) {
    const blobResponse = await octokit.git.createBlob({
      owner: getOwner(), repo: getRepo(),
      content: JSON.stringify(data, null, 2) + '\n',
      encoding: 'utf-8',
    });
    treeItems.push({
      path: `${GITHUB_STATE_PATH}${file}`,
      mode: '100644', type: 'blob', sha: blobResponse.data.sha,
    });
    filesUpdated.push(file);
  }

  const treeResponse = await octokit.git.createTree({
    owner: getOwner(), repo: getRepo(),
    base_tree: baseTreeSha, tree: treeItems,
  });

  const newCommitResponse = await octokit.git.createCommit({
    owner: getOwner(), repo: getRepo(),
    message: `[PinhoOps] ${message}\n\nActor: ${actor}\nTimestamp: ${timestamp}\nFiles: ${filesUpdated.join(', ')}`,
    tree: treeResponse.data.sha,
    parents: [latestCommitSha],
  });

  await octokit.git.updateRef({
    owner: getOwner(), repo: getRepo(),
    ref: `heads/${GITHUB_BRANCH}`, sha: newCommitResponse.data.sha,
  });

  return { commitSha: newCommitResponse.data.sha, filesUpdated };
}
