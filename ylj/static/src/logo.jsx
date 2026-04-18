// YourLocalJared logo — inspired by the yourJared glyph:
// rounded-square green tile with horizontal "document/terminal" lines in black.
function Logo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="4.5"
            fill="var(--accent)" stroke="var(--accent-hi)" strokeWidth="0.6" />
      {/* subtle inner highlight */}
      <rect x="2.5" y="2.5" width="19" height="19" rx="3.8" fill="none"
            stroke="#ffffff22" strokeWidth="0.8" />
      {/* document/terminal lines — mimics the yourJared glyph */}
      <path d="M6 8.5h12M6 12h9M6 15.5h6"
            stroke="#000" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Wordmark({ dim = 'var(--text-dim)', bright = 'var(--text)' }) {
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700,
      letterSpacing: '-0.01em', whiteSpace: 'nowrap',
    }}>
      <span style={{ color: dim, fontWeight: 500 }}>your</span>
      <span style={{ color: 'var(--accent-hi)', fontWeight: 500 }}>local</span>
      <span style={{ color: bright }}>Jared</span>
    </span>
  );
}

function BetaPill({ label = 'BETA' }) {
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 700,
      letterSpacing: '0.18em',
      padding: '2px 6px',
      background: 'var(--bg-hi)', color: 'var(--text-dim)',
      border: '1px solid var(--border)',
      borderRadius: 2,
    }}>{label}</span>
  );
}

Object.assign(window, { Logo, Wordmark, BetaPill });
