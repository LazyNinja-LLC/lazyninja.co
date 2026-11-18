// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * East Sea Dokdo (Korean brush lettering) ships as ~90 unicode-range slices. Read them from the
 * Fontsource CSS so each page only downloads the slices for the Hangul it actually shows.
 * Self-hosted, so the CSP's font-src 'self' still holds.
 */
/** @typedef {{ src: [string], weight: string, style: 'normal' | 'italic', unicodeRange?: [string, ...string[]] }} FontVariant */

/** @returns {[FontVariant, ...FontVariant[]]} */
function brushFontVariants() {
  const pkg = '@fontsource/east-sea-dokdo';
  const css = readFileSync(fileURLToPath(new URL(`./node_modules/${pkg}/400.css`, import.meta.url)), 'utf8');
  /** @type {FontVariant[]} */
  const variants = [
    ...css.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)[\s\S]*?unicode-range:\s*([^;]+);/g),
  ].map(([, file = '', range = '']) => ({
    src: [`${pkg}/files/${file}`],
    weight: '400',
    style: 'normal',
    unicodeRange: /** @type {[string, ...string[]]} */ (range.split(',').map((r) => r.trim())),
  }));
  const [first, ...rest] = variants;
  if (!first) throw new Error(`No font slices found in ${pkg}/400.css`);
  return [first, ...rest];
}

/**
 * @param {500 | 600} weight
 * @param {'normal' | 'italic'} style
 * @returns {FontVariant}
 */
const cormorant = (weight, style) => ({
  src: [`@fontsource/cormorant-garamond/files/cormorant-garamond-latin-${weight}-${style}.woff2`],
  weight: String(weight),
  style,
});

// Clean URLs: /about → about.html. Must match the rewrite rules in public/.htaccess.
export default defineConfig({
  site: 'https://lazyninja.co',
  trailingSlash: 'never',
  build: {
    format: 'file',
    inlineStylesheets: 'always',
  },
  // Self-hosted variable fonts (Latin subset) with automatic metric-matched fallbacks (no CLS on swap).
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Inter',
      cssVariable: '--font-inter',
      fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      options: {
        variants: [
          {
            src: ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'],
            weight: '100 900',
            style: 'normal',
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Cormorant Garamond',
      cssVariable: '--font-cormorant',
      fallbacks: ['Georgia', 'serif'],
      options: {
        variants: [
          cormorant(500, 'normal'),
          cormorant(600, 'normal'),
          cormorant(500, 'italic'),
          cormorant(600, 'italic'),
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'East Sea Dokdo',
      cssVariable: '--font-dokdo',
      fallbacks: ['serif'],
      options: { variants: brushFontVariants() },
    },
    {
      provider: fontProviders.local(),
      name: 'JetBrains Mono',
      cssVariable: '--font-jetbrains',
      fallbacks: ['ui-monospace', 'monospace'],
      options: {
        variants: [
          {
            src: ['@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'],
            weight: '100 800',
            style: 'normal',
          },
        ],
      },
    },
  ],
  integrations: [
    mdx(),
    react(),
    sitemap({
      filter: (page) => !page.includes('/stats') && !page.endsWith('/404'),
    }),
  ],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light-default', dark: 'github-dark-default' },
      defaultColor: false,
      wrap: false,
    },
  },
  image: {
    responsiveStyles: true,
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Never inline scripts/assets as data URIs; keeps the CSP hash list small and stable.
      assetsInlineLimit: 0,
    },
    server: {
      // Allow importing the shared GitHub module from ../shared in dev.
      fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    },
  },
});
