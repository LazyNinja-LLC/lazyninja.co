import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { planUpload, validateText } from '../src/lib/admin-content';
import { GitHubCache } from '../src/lib/github-cache';
import { HttpError } from '../src/lib/http';
import type { DeployRun, RepoClient, RepoEntry, RepoFile } from '../src/lib/repo-client';
import { MemoryStore } from '../src/store/memory';

const ADMIN = 'admin-token-that-is-long-enough-123';
const AUTH = { Authorization: `Bearer ${ADMIN}` };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const PDF = Buffer.from('%PDF-1.4\n%fake résumé\n', 'latin1');
const POST = '---\ntitle: "Hi"\ndescription: "x"\ndate: 2026-11-18\n---\n\nHello\n';

/** In-memory stand-in for the GitHub repo. */
class FakeRepo implements RepoClient {
  files = new Map<string, { sha: string; data: Buffer }>();
  commits: { path: string; message: string; deleted?: boolean }[] = [];
  deploys = 0;
  private n = 0;
  private sha() {
    return (++this.n).toString(16).padStart(40, '0');
  }
  seed(path: string, text: string) {
    const sha = this.sha();
    this.files.set(path, { sha, data: Buffer.from(text) });
    return sha;
  }
  async getFile(path: string): Promise<RepoFile | null> {
    const f = this.files.get(path);
    return f ? { path, sha: f.sha, content: f.data.toString('utf8'), size: f.data.length } : null;
  }
  async listDir(dir: string): Promise<RepoEntry[]> {
    return [...this.files.entries()]
      .filter(([p]) => p.startsWith(`${dir}/`))
      .map(([path, f]) => ({
        name: path.split('/').pop()!,
        path,
        sha: f.sha,
        type: 'file' as const,
        size: f.data.length,
      }));
  }
  async putFile(path: string, base64: string, message: string, sha?: string) {
    const current = this.files.get(path);
    if ((current && current.sha !== sha) || (!current && sha)) {
      throw new HttpError(409, 'This file changed since you opened it. Reload it and try again.');
    }
    const next = this.sha();
    this.files.set(path, { sha: next, data: Buffer.from(base64, 'base64') });
    this.commits.push({ path, message });
    return { commitSha: this.sha(), sha: next };
  }
  async deleteFile(path: string, sha: string, message: string) {
    if (this.files.get(path)?.sha !== sha) throw new HttpError(409, 'changed');
    this.files.delete(path);
    this.commits.push({ path, message, deleted: true });
    return { commitSha: this.sha() };
  }
  async listDeploys(): Promise<DeployRun[]> {
    return [];
  }
  async startDeploy() {
    this.deploys++;
  }
}

function setup(withRepo = true) {
  const config = loadConfig({ NODE_ENV: 'test', ADMIN_TOKEN: ADMIN });
  const store = new MemoryStore();
  const repo = withRepo ? new FakeRepo() : null;
  const github = new GitHubCache(store, async () => []);
  const app = createApp({ config, store, mailer: null, github, repo });
  return { app, repo: repo!, store };
}

describe('admin auth', () => {
  it('rejects missing or wrong tokens', async () => {
    const { app } = setup();
    expect((await request(app).get('/admin/status')).status).toBe(401);
    expect((await request(app).get('/admin/status').set('Authorization', 'Bearer nope')).status).toBe(401);
    const ok = await request(app).get('/admin/status').set(AUTH);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ editing: true, repo: 'LazyNinja-LLC/lazyninja.co', branch: 'main' });
  });

  it('rate limits repeated failures (brute-force guard)', async () => {
    const { app } = setup();
    const codes = [];
    for (let i = 0; i < 21; i++)
      codes.push((await request(app).get('/admin/status').set('Authorization', `Bearer x${i}`)).status);
    expect(codes.slice(0, 20).every((c) => c === 401)).toBe(true);
    expect(codes[20]).toBe(429);
  });

  it('checks auth before parsing large bodies', async () => {
    const res = await request(setup().app)
      .put('/admin/file')
      .send({ path: 'site/src/content/now/now.md', content: 'x'.repeat(100_000) });
    expect(res.status).toBe(401);
  });

  it('reports when editing is not configured', async () => {
    const { app } = setup(false);
    expect((await request(app).get('/admin/status').set(AUTH)).body.editing).toBe(false);
    expect((await request(app).get('/admin/files').set(AUTH)).status).toBe(503);
  });
});

describe('admin files', () => {
  it('lists posts, write-ups and images', async () => {
    const { app, repo } = setup();
    repo.seed('site/src/content/blog/hello.mdx', POST);
    repo.seed('site/src/content/projects/thing.mdx', POST);
    repo.seed('site/src/assets/uploads/cat-abc.png', 'x');
    const res = await request(app).get('/admin/files').set(AUTH);
    expect(res.body.posts.map((p: { path: string }) => p.path)).toEqual(['site/src/content/blog/hello.mdx']);
    expect(res.body.writeups).toHaveLength(1);
    expect(res.body.images[0]).toMatchObject({ ref: '../../assets/uploads/cat-abc.png' });
  });

  it('reads and updates an allowed file, committing with the right sha', async () => {
    const { app, repo } = setup();
    const sha = repo.seed('site/src/content/now/now.md', POST);
    const got = await request(app).get('/admin/file?path=site/src/content/now/now.md').set(AUTH);
    expect(got.body).toMatchObject({ sha, content: POST });
    const put = await request(app)
      .put('/admin/file')
      .set(AUTH)
      .send({ path: 'site/src/content/now/now.md', content: POST.replace('Hello', 'Hey'), sha });
    expect(put.status).toBe(200);
    expect(repo.commits.at(-1)?.message).toBe('content: update site/src/content/now/now.md (via admin)');
    expect((await repo.getFile('site/src/content/now/now.md'))?.content).toContain('Hey');
  });

  it('creates new posts and rejects stale shas', async () => {
    const { app, repo } = setup();
    const created = await request(app)
      .put('/admin/file')
      .set(AUTH)
      .send({ path: 'site/src/content/blog/new-post.mdx', content: POST });
    expect(created.status).toBe(200);
    const stale = await request(app)
      .put('/admin/file')
      .set(AUTH)
      .send({ path: 'site/src/content/blog/new-post.mdx', content: POST, sha: 'a'.repeat(40) });
    expect(stale.status).toBe(409);
    expect(repo.commits).toHaveLength(1);
  });

  it.each([
    '.github/workflows/deploy.yml',
    'api/src/app.ts',
    'site/src/config/site.ts',
    'site/src/content/blog/../../config/site.ts',
    'site/src/content/blog/Bad Name.mdx',
    'site/public/.htaccess',
  ])('refuses to touch %s', async (path) => {
    const { app, repo } = setup();
    const res = await request(app).put('/admin/file').set(AUTH).send({ path, content: POST });
    expect(res.status).toBe(403);
    expect(repo.commits).toHaveLength(0);
  });

  it('validates content before committing', async () => {
    const { app, repo } = setup();
    const badJson = await request(app)
      .put('/admin/file')
      .set(AUTH)
      .send({ path: 'site/src/content/settings/about.json', content: '{nope' });
    expect(badJson.status).toBe(400);
    const noFrontMatter = await request(app)
      .put('/admin/file')
      .set(AUTH)
      .send({ path: 'site/src/content/blog/x.md', content: 'just text' });
    expect(noFrontMatter.status).toBe(400);
    expect(repo.commits).toHaveLength(0);
  });

  it('deletes posts but not settings', async () => {
    const { app, repo } = setup();
    const sha = repo.seed('site/src/content/blog/old.md', POST);
    const settingsSha = repo.seed('site/src/content/settings/site.json', '{}');
    expect(
      (await request(app).delete('/admin/file').set(AUTH).send({ path: 'site/src/content/blog/old.md', sha }))
        .status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .delete('/admin/file')
          .set(AUTH)
          .send({ path: 'site/src/content/settings/site.json', sha: settingsSha })
      ).status,
    ).toBe(403);
    expect(repo.files.has('site/src/content/blog/old.md')).toBe(false);
  });
});

describe('admin uploads', () => {
  it('replaces the résumé PDF', async () => {
    const { app, repo } = setup();
    repo.seed('site/public/resume.pdf', '%PDF-old');
    const res = await request(app)
      .post('/admin/upload')
      .set(AUTH)
      .send({ kind: 'resume', filename: 'cv.pdf', data: PDF.toString('base64') });
    expect(res.status).toBe(200);
    expect(res.body.ref).toBe('/resume.pdf');
    expect((await repo.getFile('site/public/resume.pdf'))?.size).toBe(PDF.length);
  });

  it('stores images under a safe generated name and returns a reference', async () => {
    const { app, repo } = setup();
    const res = await request(app)
      .post('/admin/upload')
      .set(AUTH)
      .send({ kind: 'image', filename: '../../My Screenshot.PNG', data: PNG.toString('base64') });
    expect(res.status).toBe(200);
    expect(res.body.path).toMatch(/^site\/src\/assets\/uploads\/my-screenshot-[a-z0-9]+\.png$/);
    expect(res.body.ref).toMatch(/^\.\.\/\.\.\/assets\/uploads\//);
    expect(repo.files.has(res.body.path)).toBe(true);
  });

  it('accepts files over 20 KB on admin routes (but under 5 MB)', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(200_000)]);
    const res = await request(setup().app)
      .post('/admin/upload')
      .set(AUTH)
      .send({ kind: 'public-image', filename: 'lab.png', data: big.toString('base64') });
    expect(res.status).toBe(200);
    expect(res.body.ref).toMatch(/^\/uploads\/lab-/);
  });

  it('checks file contents, not names', () => {
    expect(planUpload('resume', 'cv.pdf', PNG)).toEqual({ error: 'The résumé must be a PDF.' });
    expect(planUpload('image', 'x.png', PDF)).toHaveProperty('error');
    expect(planUpload('image', 'x.png', Buffer.alloc(6 * 1024 * 1024, 1))).toEqual({
      error: 'File is too large (5 MB max).',
    });
  });
});

describe('admin actions', () => {
  it('can start a deploy and refresh projects', async () => {
    const { app, repo } = setup();
    expect((await request(app).post('/admin/deploy').set(AUTH)).status).toBe(200);
    expect(repo.deploys).toBe(1);
    const sync = await request(app).post('/admin/sync-projects').set(AUTH);
    expect(sync.body).toMatchObject({ ok: true, count: 0 });
  });
});

describe('validateText', () => {
  it('accepts front matter with Windows line endings', () => {
    expect(validateText('site/src/content/blog/a.md', '---\r\ntitle: x\r\n---\r\nbody')).toBeNull();
  });
});
