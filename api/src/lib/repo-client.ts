import { HttpError } from './http';

/**
 * Minimal GitHub client for the admin editor: reads and commits files in the site's repo
 * (Contents API) and reads/starts the Deploy workflow (Actions API). Every commit to the
 * branch triggers the normal CI + deploy pipeline.
 */
export interface RepoFile {
  path: string;
  sha: string;
  /** UTF-8 text. Empty for large/binary files, where only the sha matters. */
  content: string;
  size: number;
}

export interface RepoEntry {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir';
  size: number;
}

export interface DeployRun {
  id: number;
  title: string;
  event: string;
  status: string;
  conclusion: string | null;
  headSha: string;
  url: string;
  createdAt: string;
}

export interface RepoClient {
  getFile(path: string): Promise<RepoFile | null>;
  listDir(path: string): Promise<RepoEntry[]>;
  putFile(
    path: string,
    base64: string,
    message: string,
    sha?: string,
  ): Promise<{ commitSha: string; sha: string }>;
  deleteFile(path: string, sha: string, message: string): Promise<{ commitSha: string }>;
  listDeploys(limit: number): Promise<DeployRun[]>;
  startDeploy(): Promise<void>;
}

const API = 'https://api.github.com';
const WORKFLOW = 'deploy.yml';

export function createRepoClient(opts: {
  repo: string;
  branch: string;
  token: string;
  fetchImpl?: typeof fetch;
}): RepoClient {
  const doFetch = opts.fetchImpl ?? fetch;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'lazyninja.co-admin',
    Authorization: `Bearer ${opts.token}`,
  };
  const contentsUrl = (path: string) =>
    `${API}/repos/${opts.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;

  async function call<T>(url: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
    const res = await doFetch(url, {
      ...init,
      headers: { ...headers, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.ok || res.status === 404) return { status: res.status, body: body as T };
    const message = (body as { message?: string } | null)?.message ?? '';
    if (res.status === 409 || (res.status === 422 && /sha/i.test(message))) {
      throw new HttpError(409, 'This file changed since you opened it. Reload it and try again.');
    }
    if (res.status === 401 || res.status === 403) {
      throw new HttpError(
        502,
        `GitHub refused the write token (${res.status}: ${message}). Check GITHUB_WRITE_TOKEN.`,
      );
    }
    throw new HttpError(502, `GitHub error ${res.status}${message ? `: ${message}` : ''}`);
  }

  return {
    async getFile(path) {
      const { status, body } = await call<{
        type: string;
        sha: string;
        size: number;
        content?: string;
        encoding?: string;
      }>(`${contentsUrl(path)}?ref=${encodeURIComponent(opts.branch)}`);
      if (status === 404 || !body || body.type !== 'file') return null;
      const content =
        body.encoding === 'base64' && body.content
          ? Buffer.from(body.content, 'base64').toString('utf8')
          : '';
      return { path, sha: body.sha, size: body.size, content };
    },

    async listDir(path) {
      const { status, body } = await call<RepoEntry[]>(
        `${contentsUrl(path)}?ref=${encodeURIComponent(opts.branch)}`,
      );
      if (status === 404 || !Array.isArray(body)) return [];
      return body
        .filter((e) => e.type === 'file' || e.type === 'dir')
        .map(({ name, path: p, sha, type, size }) => ({ name, path: p, sha, type, size }));
    },

    async putFile(path, base64, message, sha) {
      const { body } = await call<{ commit: { sha: string }; content: { sha: string } }>(contentsUrl(path), {
        method: 'PUT',
        body: JSON.stringify({ message, content: base64, branch: opts.branch, ...(sha ? { sha } : {}) }),
      });
      return { commitSha: body.commit.sha, sha: body.content.sha };
    },

    async deleteFile(path, sha, message) {
      const { status, body } = await call<{ commit: { sha: string } }>(contentsUrl(path), {
        method: 'DELETE',
        body: JSON.stringify({ message, sha, branch: opts.branch }),
      });
      if (status === 404) throw new HttpError(404, 'File not found');
      return { commitSha: body.commit.sha };
    },

    async listDeploys(limit) {
      const { body } = await call<{
        workflow_runs?: {
          id: number;
          display_title: string;
          event: string;
          status: string;
          conclusion: string | null;
          head_sha: string;
          html_url: string;
          created_at: string;
        }[];
      }>(
        `${API}/repos/${opts.repo}/actions/workflows/${WORKFLOW}/runs?per_page=${limit}&branch=${encodeURIComponent(opts.branch)}`,
      );
      return (body?.workflow_runs ?? []).map((r) => ({
        id: r.id,
        title: r.display_title,
        event: r.event,
        status: r.status,
        conclusion: r.conclusion,
        headSha: r.head_sha,
        url: r.html_url,
        createdAt: r.created_at,
      }));
    },

    async startDeploy() {
      await call(`${API}/repos/${opts.repo}/actions/workflows/${WORKFLOW}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref: opts.branch }),
      });
    },
  };
}
