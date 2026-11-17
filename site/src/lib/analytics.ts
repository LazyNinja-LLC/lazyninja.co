/**
 * First-party, cookie-free page-view beacon. Respects Do Not Track and Global
 * Privacy Control. Fails silently if the API is down.
 */
export function trackPageView() {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    const w = window as Window & { doNotTrack?: string };
    if (nav.doNotTrack === '1' || w.doNotTrack === '1' || nav.globalPrivacyControl) return;
    if (!('sendBeacon' in navigator)) return;
    const api = document.documentElement.dataset.api;
    if (!api) return;
    const referrer = document.referrer ? safeHost(document.referrer) : null;
    const payload = JSON.stringify({
      path: location.pathname,
      referrer: referrer && referrer !== location.host ? referrer : null,
    });
    // text/plain is CORS-safelisted, so the beacon needs no preflight.
    navigator.sendBeacon(`${api}/track`, new Blob([payload], { type: 'text/plain' }));
  } catch {
    /* analytics must never break the page */
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
