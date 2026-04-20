// Reveal-in-folder helper. Posts to /api/reveal so the server can spawn
// the platform file manager (Finder / Explorer / xdg-open) with the
// given path selected — we never open the document itself.
//
// Exposed on `window.revealInFolder` so both the onboarding and chat
// React trees can call it without an import wrapper. Firing and
// forgetting is fine; any non-2xx response is logged but doesn't
// interrupt the user's flow.
window.revealInFolder = async function revealInFolder(path) {
  if (typeof path !== 'string' || path === '') return;
  try {
    const r = await fetch('/api/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      console.warn('reveal failed:', err.detail || r.status);
    }
  } catch (e) {
    console.warn('reveal request failed:', e);
  }
};

// Platform-aware tooltip text. Kept here so every caller reads the
// same wording and we only touch one place when adding an OS.
window.revealTooltip = function revealTooltip() {
  const p = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '').toLowerCase();
  if (p.includes('mac')) return 'show in Finder';
  if (p.includes('win')) return 'show in File Explorer';
  return 'show in file manager';
};
