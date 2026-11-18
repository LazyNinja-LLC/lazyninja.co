import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Config } from '../config';
import {
  CONTENT_DIRS,
  isDeletablePath,
  isEditablePath,
  planUpload,
  validateText,
} from '../lib/admin-content';
import { hmacSha256, safeEqual } from '../lib/crypto';
import type { GitHubCache } from '../lib/github-cache';
import { HttpError } from '../lib/http';
import { RateLimiter } from '../lib/rate-limit';
import type { RepoClient } from '../lib/repo-client';
import type { Store } from '../store/types';

export interface AdminDeps {
  config: Config;
  store: Store;
  github: GitHubCache;
  repo: RepoClient | null;
  now: () => Date;
}

/**
 * Bearer ADMIN_TOKEN check. Failed attempts are rate limited per IP (MySQL-backed), so the
 * token can't be brute-forced even though it is already 256 bits of randomness.
 */
export function requireAdmin({ config, store, now }: Pick<AdminDeps, 'config' | 'store' | 'now'>) {
  const failures = new RateLimiter(store, { bucket: 'admin-auth', limit: 20, windowMs: 60 * 60 * 1000, now });
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (config.adminToken && token && safeEqual(token, config.adminToken)) {
      res.set('Cache-Control', 'no-store');
      next();
      return;
    }
    const hit = await failures.hit(hmacSha256(config.analyticsSecret, `admin:${req.ip ?? 'unknown'}`));
    if (!hit.allowed) throw new HttpError(429, 'Too many failed attempts. Try again later.');
    res.set('WWW-Authenticate', 'Bearer');
    throw new HttpError(401, 'Unauthorized');
  };
}

const PathQuery = z.object({ path: z.string().min(1).max(300) });
const PutBody = z.object({
  path: z.string().min(1).max(300),
  content: z.string(),
  sha: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
  message: z.string().max(200).optional(),
});
const DeleteBody = z.object({ path: z.string().min(1).max(300), sha: z.string().regex(/^[0-9a-f]{40}$/) });
const UploadBody = z.object({
  kind: z.enum(['resume', 'image', 'public-image']),
  filename: z.string().min(1).max(200),
  data: z.string().min(1),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'Invalid request', z.flattenError(result.error).fieldErrors);
  return result.data;
}

/** Routes under /admin. Everything requires the admin token; editing also needs GITHUB_WRITE_TOKEN. */
export function adminRouter(deps: AdminDeps): Router {
  const { config, github, repo } = deps;
  const router = Router();
  // Auth runs before the (larger) body parser, so unauthenticated uploads are never parsed.
  router.use(requireAdmin(deps));
  router.use(express.json({ limit: '8mb' }));

  const needRepo = (): RepoClient => {
    if (!repo) {
      throw new HttpError(
        503,
        'Editing is not set up: add GITHUB_WRITE_TOKEN to the API .env (see DEPLOY.md).',
      );
    }
    return repo;
  };

  router.get('/status', (_req, res) => {
    res.json({ editing: !!repo, repo: config.content.repo, branch: config.content.branch });
  });

  router.get('/files', async (_req, res) => {
    const client = needRepo();
    const [posts, writeups, images] = await Promise.all([
      client.listDir(CONTENT_DIRS.posts),
      client.listDir(CONTENT_DIRS.writeups),
      client.listDir(CONTENT_DIRS.images),
    ]);
    const files = (list: typeof posts) =>
      list
        .filter((f) => f.type === 'file' && isEditablePath(f.path))
        .map(({ name, path, sha }) => ({ name, path, sha }));
    res.json({
      posts: files(posts),
      writeups: files(writeups),
      images: images
        .filter((f) => f.type === 'file' && isDeletablePath(f.path))
        .map(({ name, path, sha, size }) => ({ name, path, sha, size, ref: `../../assets/uploads/${name}` })),
    });
  });

  router.get('/file', async (req, res) => {
    const { path } = parse(PathQuery, req.query);
    if (!isEditablePath(path)) throw new HttpError(403, 'That file cannot be edited here.');
    const file = await needRepo().getFile(path);
    if (!file) throw new HttpError(404, 'File not found');
    res.json({ path: file.path, sha: file.sha, content: file.content });
  });

  router.put('/file', async (req, res) => {
    const body = parse(PutBody, req.body);
    if (!isEditablePath(body.path)) throw new HttpError(403, 'That file cannot be edited here.');
    const problem = validateText(body.path, body.content);
    if (problem) throw new HttpError(400, problem);
    const result = await needRepo().putFile(
      body.path,
      Buffer.from(body.content, 'utf8').toString('base64'),
      `content: ${body.message?.trim() || `${body.sha ? 'update' : 'add'} ${body.path}`} (via admin)`,
      body.sha,
    );
    res.json({ ok: true, path: body.path, ...result });
  });

  router.delete('/file', async (req, res) => {
    const body = parse(DeleteBody, req.body);
    if (!isDeletablePath(body.path)) throw new HttpError(403, 'That file cannot be deleted here.');
    const result = await needRepo().deleteFile(
      body.path,
      body.sha,
      `content: delete ${body.path} (via admin)`,
    );
    res.json({ ok: true, ...result });
  });

  router.post('/upload', async (req, res) => {
    const body = parse(UploadBody, req.body);
    const data = Buffer.from(body.data, 'base64');
    const plan = planUpload(body.kind, body.filename, data, deps.now().getTime());
    if ('error' in plan) throw new HttpError(400, plan.error);
    const client = needRepo();
    // Replacing the résumé needs the current file's sha; new images never exist yet.
    const existing = body.kind === 'resume' ? await client.getFile(plan.path) : null;
    const result = await client.putFile(
      plan.path,
      data.toString('base64'),
      `content: ${body.kind === 'resume' ? 'replace résumé' : `upload ${plan.path}`} (via admin)`,
      existing?.sha,
    );
    res.json({ ok: true, path: plan.path, ref: plan.ref, ...result });
  });

  router.get('/deploys', async (_req, res) => {
    res.json({ runs: await needRepo().listDeploys(8) });
  });

  router.post('/deploy', async (_req, res) => {
    await needRepo().startDeploy();
    res.json({ ok: true });
  });

  /** Refresh the GitHub project cache now (same as `npm run sync`, without the purge). */
  router.post('/sync-projects', async (_req, res) => {
    try {
      const { projects, syncedAt } = await github.refresh();
      res.json({ ok: true, count: projects.length, syncedAt: syncedAt?.toISOString() ?? null });
    } catch (err) {
      throw new HttpError(502, `GitHub refresh failed: ${(err as Error).message}`);
    }
  });

  return router;
}
