// Shared UI preferences — theme (light/dark), font size, reduced motion.
// One localStorage key (`ylj-prefs`) used by both /setup and /chat so the
// two pages stay in sync. Default tone/motion respect OS `prefers-*`
// media queries on first load.

const PREFS_KEY = 'ylj-prefs';
const PREFS_VERSION = 1;

const THEMES = ['light', 'dark'];
const FONT_SIZES = ['compact', 'default', 'comfortable'];
const MOTIONS = ['full', 'reduced'];

function defaultPrefs() {
  const darkPref = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const reducedPref = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    v: PREFS_VERSION,
    theme: darkPref ? 'dark' : 'light',
    fontSize: 'default',
    motion: reducedPref ? 'reduced' : 'full',
  };
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs();
    const p = JSON.parse(raw);
    if (!p || p.v !== PREFS_VERSION) return defaultPrefs();
    return {
      v: PREFS_VERSION,
      theme: THEMES.includes(p.theme) ? p.theme : defaultPrefs().theme,
      fontSize: FONT_SIZES.includes(p.fontSize) ? p.fontSize : 'default',
      motion: MOTIONS.includes(p.motion) ? p.motion : defaultPrefs().motion,
    };
  } catch (_e) {
    return defaultPrefs();
  }
}

function applyPrefs(p) {
  const root = document.documentElement;
  root.dataset.theme = p.theme;
  root.dataset.font = p.fontSize;
  root.dataset.motion = p.motion;
}

function savePrefs(p) {
  const clean = { ...p, v: PREFS_VERSION };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(clean)); } catch (_e) { /* quota / disabled */ }
  applyPrefs(clean);
  return clean;
}

// React hook used by app.jsx / chat-app.jsx.
function usePrefs() {
  const [prefs, set] = useState(loadPrefs);
  useEffect(() => { applyPrefs(prefs); }, []);
  const update = (patch) => {
    const next = savePrefs({ ...prefs, ...patch });
    set(next);
  };
  return [prefs, update];
}

// Panel section that plugs into the existing TweaksPanel layout.
function PrefsSection({ prefs, setPrefs }) {
  const seg = (label, values, current, onPick) => (
    <div>
      <div style={{
        fontSize: 10, color: 'var(--text-dimmer)',
        letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8,
      }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {values.map(v => {
          const on = current === v;
          return (
            <button key={v} onClick={() => onPick(v)} style={{
              flex: 1, padding: '6px 0', fontSize: 10,
              background: on ? 'var(--accent-dim)' : 'var(--bg-hi)',
              border: `1px solid ${on ? 'var(--accent-border)' : 'var(--border)'}`,
              color: on ? 'var(--accent-hi)' : 'var(--text-dim)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}>{v}</button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {seg('theme', THEMES, prefs.theme, v => setPrefs({ theme: v }))}
      {seg('font size', FONT_SIZES, prefs.fontSize, v => setPrefs({ fontSize: v }))}
      {seg('motion', MOTIONS, prefs.motion, v => setPrefs({ motion: v }))}
    </>
  );
}

// Apply immediately on load so the page doesn't flash light-mode before React mounts.
applyPrefs(loadPrefs());

// Expose on window for Babel-in-browser consumers (app.jsx, chat-app.jsx, tweaks.jsx).
Object.assign(window, { loadPrefs, savePrefs, applyPrefs, usePrefs, PrefsSection });
