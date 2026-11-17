/**
 * One-off asset generator. Run with `npm run assets` after changing the logo.
 * Produces the favicon set, the placeholder résumé PDF and the sample blog cover.
 * Outputs are committed, so this does not run during normal builds.
 */
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pub = (p) => `${root}public/${p}`;

const logo = await readFile(pub('favicon.svg'));

async function png(size) {
  return sharp(logo, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

// PNG icons
for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  await writeFile(pub(name), await png(size));
}

// Maskable icon: logo on a padded ink background
const maskable = await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#0c0e12' },
})
  .composite([{ input: await png(384), top: 64, left: 64 }])
  .png()
  .toBuffer();
await writeFile(pub('icon-maskable-512.png'), maskable);

// favicon.ico with embedded PNGs (16, 32, 48)
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(size, e);
  header.writeUInt8(size, e + 1);
  header.writeUInt8(0, e + 2);
  header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(images[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
await writeFile(pub('favicon.ico'), Buffer.concat([header, ...images]));

// Placeholder résumé PDF (hand-built, single page, Helvetica). Never overwrites a real résumé.
if (!existsSync(pub('resume.pdf'))) {
  const lines = [
    ['F2', 22, 'R\\351sum\\351 placeholder'],
    ['F1', 12, 'TODO(Tyler): replace site/public/resume.pdf with your real r\\351sum\\351.'],
    ['F1', 12, 'This file is a placeholder so the "Download r\\351sum\\351" button works.'],
    ['F1', 12, 'lazyninja.co'],
  ];
  let y = 720;
  const text = lines
    .map(([font, size, str]) => {
      const t = `BT /${font} ${size} Tf 72 ${y} Td (${str}) Tj ET`;
      y -= size + 16;
      return t;
    })
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text, 'latin1')} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Title (Resume placeholder) /Producer (lazyninja.co) >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  await writeFile(pub('resume.pdf'), Buffer.from(pdf, 'latin1'));
}

// Sample blog cover (abstract brand art), processed later by Astro's image pipeline
{
  const w = 1600;
  const h = 900;
  const grid = Array.from({ length: Math.ceil(w / 64) }, (_, i) => `<path d="M${i * 64} 0V${h}" />`)
    .concat(Array.from({ length: Math.ceil(h / 64) }, (_, i) => `<path d="M0 ${i * 64}H${w}" />`))
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><radialGradient id="g" cx="0.72" cy="0.4" r="0.6"><stop offset="0" stop-color="#ff5a36" stop-opacity="0.55"/><stop offset="1" stop-color="#0c0e12" stop-opacity="0"/></radialGradient></defs>
    <rect width="${w}" height="${h}" fill="#0c0e12"/>
    <g stroke="#ffffff" stroke-opacity="0.05" stroke-width="1">${grid}</g>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <circle cx="1150" cy="360" r="190" fill="#ff5a36"/>
    <rect x="890" y="330" width="520" height="70" rx="35" fill="#ecebe6"/>
    <rect x="1000" y="356" width="90" height="14" rx="7" fill="#0c0e12"/>
    <rect x="1210" y="356" width="90" height="14" rx="7" fill="#0c0e12"/>
    <path d="M140 640h560M140 690h380" stroke="#ecebe6" stroke-opacity="0.35" stroke-width="18" stroke-linecap="round"/>
  </svg>`;
  await mkdir(`${root}src/assets/blog`, { recursive: true });
  await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(`${root}src/assets/blog/hello-world-cover.webp`);
}

console.log('Assets generated.');
