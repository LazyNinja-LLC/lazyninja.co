import { SITE, SOCIALS } from '../config/site';

/**
 * Clean URL path as served by .htaccess: no ".html", no "/index", no trailing slash.
 * (With build.format "file", Astro.url.pathname can end in ".html" at build time.)
 */
export function cleanPath(pathname: string): string {
  const p = pathname
    .replace(/\.html$/, '')
    .replace(/\/index$/, '')
    .replace(/\/+$/, '');
  return p === '' || p === 'index' ? '/' : p;
}

/** Absolute URL for a site path in canonical clean form. Asset URLs (with an extension) are left alone. */
export function absoluteUrl(path: string): string {
  const url = new URL(path, SITE.url);
  if (!/\.(png|jpe?g|webp|avif|svg|xml|pdf|ico)$/i.test(url.pathname)) {
    url.pathname = cleanPath(url.pathname);
  }
  return url.toString();
}

/** OG image path for a page slug (generated at build time by src/pages/og/[...slug].png.ts). */
export function ogImagePath(slug: string): string {
  return `/og/${slug.replace(/^\/+|\/+$/g, '') || 'default'}.png`;
}

export type JsonLd = Record<string, unknown>;

const ORG_ID = `${SITE.url}/#organization`;
const PERSON_ID = `${SITE.url}/#person`;

export function organizationJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE.company,
    alternateName: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/icon-512.png`,
    email: SITE.person.email,
    sameAs: [SOCIALS.githubOrg.href],
  };
}

/** Person: About page only. */
export function personJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': PERSON_ID,
    name: SITE.person.name,
    url: `${SITE.url}/about`,
    email: `mailto:${SITE.person.email}`,
    jobTitle: SITE.person.jobTitle,
    sameAs: [SOCIALS.githubPersonal.href],
    founder: { '@id': ORG_ID, '@type': 'Organization', name: SITE.company },
    worksFor: { '@id': ORG_ID, '@type': 'Organization', name: SITE.company },
  };
}

export function blogPostingJsonLd(post: {
  title: string;
  description: string;
  url: string;
  date: Date;
  updated?: Date | undefined;
  image?: string | undefined;
  tags: string[];
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url: post.url,
    mainEntityOfPage: post.url,
    datePublished: post.date.toISOString(),
    dateModified: (post.updated ?? post.date).toISOString(),
    keywords: post.tags.join(', '),
    ...(post.image ? { image: post.image } : {}),
    // Posts are authored under the LazyNinja brand.
    author: { '@type': 'Organization', '@id': ORG_ID, name: SITE.name, url: SITE.url },
    publisher: {
      '@type': 'Organization',
      '@id': ORG_ID,
      name: SITE.company,
      logo: `${SITE.url}/icon-512.png`,
    },
  };
}
