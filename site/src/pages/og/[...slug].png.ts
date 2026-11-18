/**
 * Per-page Open Graph images, rendered at build time with Satori → sharp.
 * Output: /og/<slug>.png (1200×630). Cheap: no browser, fonts read from node_modules.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import satori from 'satori';
import sharp from 'sharp';
import { SITE } from '../../config/site';
import { getPosts, getWriteups } from '../../lib/content';

type OgProps = {
  title: string;
  kicker: string;
};

export const getStaticPaths = (async () => {
  const pages: Record<string, OgProps> = {
    default: { title: SITE.tagline, kicker: SITE.company },
    projects: { title: 'Projects', kicker: 'LazyNinja + personal, synced from GitHub' },
    blog: { title: 'Notes from the dojo', kicker: 'Blog' },
    about: { title: 'The person behind LazyNinja', kicker: 'About' },
    contact: { title: 'Say hi', kicker: 'Contact' },
    labs: { title: 'Demos & experiments', kicker: 'Labs' },
  };
  for (const post of await getPosts()) {
    pages[`blog/${post.id}`] = { title: post.data.title, kicker: 'Blog' };
  }
  for (const w of await getWriteups()) {
    pages[`projects/${w.id}`] = { title: w.data.title, kicker: 'Project' };
  }
  return Object.entries(pages).map(([slug, props]) => ({ params: { slug }, props }));
}) satisfies GetStaticPaths;

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 800; style: 'normal' }[]> | undefined;
function loadFonts() {
  const dir = join(process.cwd(), 'node_modules', '@fontsource');
  fonts ??= Promise.all([
    readFile(join(dir, 'bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff')).then(
      (data) => ({
        name: 'Bricolage',
        data,
        weight: 800 as const,
        style: 'normal' as const,
      }),
    ),
    readFile(join(dir, 'inter/files/inter-latin-400-normal.woff')).then((data) => ({
      name: 'Inter',
      data,
      weight: 400 as const,
      style: 'normal' as const,
    })),
  ]);
  return fonts;
}

type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (
  type: string,
  style: Record<string, unknown>,
  children?: unknown,
  extra: Record<string, unknown> = {},
): Node => ({
  type,
  props: { style, children, ...extra },
});

function eyes() {
  const eye = () =>
    h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44 }, [
      h('div', { width: 44, height: 8, borderRadius: 4, background: '#0c0e12' }),
      h('div', {
        width: 26,
        height: 13,
        borderBottomLeftRadius: 13,
        borderBottomRightRadius: 13,
        background: '#0c0e12',
      }),
    ]);
  return h(
    'div',
    {
      display: 'flex',
      justifyContent: 'center',
      gap: 22,
      paddingTop: 17,
      width: 150,
      height: 52,
      borderRadius: 26,
      background: '#ecebe6',
    },
    [eye(), eye()],
  );
}

export const GET: APIRoute = async ({ props }) => {
  const { title, kicker } = props as OgProps;
  const tree = h(
    'div',
    {
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 72,
      background: '#0c0e12',
      backgroundImage: 'radial-gradient(circle at 85% 20%, rgba(255,90,54,0.35), rgba(12,14,18,0) 55%)',
      color: '#ecebe6',
      fontFamily: 'Inter',
    },
    [
      h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, [
        h('div', { display: 'flex', alignItems: 'center', gap: 20 }, [
          h(
            'div',
            {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: 180,
              height: 120,
              borderRadius: 32,
              background: '#14171d',
              border: '2px solid #2a2f3a',
            },
            [
              h('div', { width: 150, height: 12, background: '#ff5a36', marginBottom: 10, borderRadius: 3 }),
              eyes(),
            ],
          ),
          h('div', { display: 'flex', fontFamily: 'Bricolage', fontSize: 44, fontWeight: 800 }, [
            h('span', {}, 'Lazy'),
            h('span', { color: '#ff5a36' }, 'Ninja'),
          ]),
        ]),
        h('div', { display: 'flex', fontSize: 26, color: '#a3a6ae' }, 'lazyninja.co'),
      ]),
      h('div', { display: 'flex', flexDirection: 'column', gap: 18 }, [
        h(
          'div',
          { display: 'flex', fontSize: 28, color: '#ff5a36', letterSpacing: 2, textTransform: 'uppercase' },
          kicker,
        ),
        h(
          'div',
          {
            display: 'flex',
            fontFamily: 'Bricolage',
            fontWeight: 800,
            fontSize: title.length > 48 ? 64 : 80,
            lineHeight: 1.02,
            letterSpacing: -2,
            maxWidth: 1000,
          },
          title,
        ),
      ]),
    ],
  );

  // Satori accepts React-element-shaped objects; no JSX runtime needed.
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: await loadFonts(),
  });
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
