/** Fails if site/public/.htaccess drifts from deploy/public_html.htaccess (the source of truth). */
import { readFile } from 'node:fs/promises';

const [a, b] = await Promise.all([
  readFile('deploy/public_html.htaccess', 'utf8'),
  readFile('site/public/.htaccess', 'utf8'),
]);
if (a.replace(/\r\n/g, '\n') !== b.replace(/\r\n/g, '\n')) {
  console.error('site/public/.htaccess differs from deploy/public_html.htaccess.');
  console.error('Fix: cp deploy/public_html.htaccess site/public/.htaccess');
  process.exit(1);
}
console.log('.htaccess copies match.');
