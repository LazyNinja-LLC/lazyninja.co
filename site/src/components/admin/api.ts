/** Small client for the API's /admin routes. The admin token lives in sessionStorage only. */
export const TOKEN_KEY = 'ln-admin-token';

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function createAdminApi(apiUrl: string) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = getToken();
    let res: Response;
    try {
      res = await fetch(`${apiUrl}/admin${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ApiError('Could not reach the API.', 0);
    }
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
    return data as T;
  }

  return {
    status: () => call<{ editing: boolean; repo: string; branch: string }>('GET', '/status'),
    files: () =>
      call<{
        posts: FileRef[];
        writeups: FileRef[];
        images: (FileRef & { size: number; ref: string })[];
      }>('GET', '/files'),
    read: (path: string) =>
      call<{ path: string; sha: string; content: string }>('GET', `/file?path=${encodeURIComponent(path)}`),
    save: (path: string, content: string, sha?: string, message?: string) =>
      call<{ sha: string; commitSha: string }>('PUT', '/file', { path, content, sha, message }),
    remove: (path: string, sha: string) => call<{ commitSha: string }>('DELETE', '/file', { path, sha }),
    upload: (kind: 'resume' | 'image' | 'public-image', file: File) =>
      fileToBase64(file).then((data) =>
        call<{ path: string; ref: string; commitSha: string }>('POST', '/upload', {
          kind,
          filename: file.name,
          data,
        }),
      ),
    deploys: () => call<{ runs: DeployRun[] }>('GET', '/deploys'),
    deploy: () => call<{ ok: true }>('POST', '/deploy'),
    syncProjects: () => call<{ count: number; syncedAt: string | null }>('POST', '/sync-projects'),
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;

export interface FileRef {
  name: string;
  path: string;
  sha: string;
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new ApiError('Could not read that file.', 0));
    reader.readAsDataURL(file);
  });
}
