// Primitives — YourJared house style (light, mono, green accent)
const { useState, useEffect, useRef } = React;

function Icon({ name, size = 12, stroke = 1.6, style = {} }) {
  const s = size;
  const common = {
    width: s, height: s, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: stroke,
    strokeLinecap: 'round', strokeLinejoin: 'round', style,
  };
  switch (name) {
    case 'folder':  return <svg {...common}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>;
    case 'file':    return <svg {...common}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>;
    case 'cpu':     return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>;
    case 'hdd':     return <svg {...common}><rect x="3" y="14" width="18" height="7" rx="1"/><path d="M3 14l2-8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2l2 8"/></svg>;
    case 'memory':  return <svg {...common}><path d="M3 8h18v8H3z"/><path d="M7 8v8M11 8v8M15 8v8"/></svg>;
    case 'check':   return <svg {...common}><path d="M5 12l5 5 9-11"/></svg>;
    case 'x':       return <svg {...common}><path d="M6 6l12 12M6 18L18 6"/></svg>;
    case 'plus':    return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case 'arrow-r': return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'arrow-l': return <svg {...common}><path d="M19 12H5M11 18l-6-6 6-6"/></svg>;
    case 'lock':    return <svg {...common}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>;
    case 'shield':  return <svg {...common}><path d="M12 2l8 3v7c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z"/></svg>;
    case 'download':return <svg {...common}><path d="M12 3v13M6 11l6 6 6-6M5 21h14"/></svg>;
    case 'search':  return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>;
    case 'send':    return <svg {...common}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>;
    case 'book':    return <svg {...common}><path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h12"/></svg>;
    case 'cog':     return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>;
    case 'sparkle': return <svg {...common}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>;
    case 'zap':     return <svg {...common}><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>;
    case 'terminal':return <svg {...common}><path d="M4 17l5-5-5-5M11 19h9"/></svg>;
    case 'external':return <svg {...common}><path d="M15 3h6v6M10 14L21 3M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>;
    case 'chev-d':  return <svg {...common}><path d="M6 9l6 6 6-6"/></svg>;
    case 'chev-r':  return <svg {...common}><path d="M9 6l6 6-6 6"/></svg>;
    case 'dot':     return <svg {...common}><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>;
    default: return null;
  }
}

function PrimaryButton({ children, onClick, disabled, iconLeft, iconRight, style = {}, block }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? 'var(--bg-hi)' : 'var(--accent)',
      color: disabled ? 'var(--text-dimmer)' : '#000',
      fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
      letterSpacing: '0.04em',
      padding: '10px 18px', borderRadius: 2,
      display: block ? 'flex' : 'inline-flex', width: block ? '100%' : 'auto',
      alignItems: 'center', justifyContent: 'center', gap: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background 0.12s',
      textTransform: 'uppercase',
      ...style,
    }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.background = 'var(--accent-hi)')}
      onMouseLeave={e => !disabled && (e.currentTarget.style.background = 'var(--accent)')}
    >
      {iconLeft && <Icon name={iconLeft} size={12} />}
      {children}
      {iconRight && <Icon name={iconRight} size={12} />}
    </button>
  );
}

function GhostButton({ children, onClick, iconLeft, iconRight, style = {} }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', color: 'var(--text-dim)',
      fontFamily: 'var(--mono)', fontSize: 11,
      padding: '10px 16px', borderRadius: 2,
      border: '1px solid var(--border)',
      display: 'inline-flex', alignItems: 'center', gap: 8,
      letterSpacing: '0.04em', textTransform: 'uppercase',
      transition: 'all 0.12s',
      ...style,
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text)'; e.currentTarget.style.color = 'var(--text)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; }}
    >
      {iconLeft && <Icon name={iconLeft} size={11} />}
      {children}
      {iconRight && <Icon name={iconRight} size={11} />}
    </button>
  );
}

function Chip({ children, tone = 'default', style = {} }) {
  const tones = {
    default: { bg: 'var(--bg-hi)', bd: 'var(--border)', fg: 'var(--text-dim)' },
    accent:  { bg: 'var(--accent-dim)', bd: 'var(--accent-border)', fg: 'var(--accent-hi)' },
    ok:      { bg: 'var(--accent-dim)', bd: 'var(--accent-border)', fg: 'var(--accent-hi)' },
    warn:    { bg: '#e8553b12', bd: '#e8553b40', fg: '#c23a22' },
    info:    { bg: '#3b82f612', bd: '#3b82f640', fg: '#2563eb' },
  };
  const t = tones[tone] || tones.default;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: t.bg, border: `1px solid ${t.bd}`, color: t.fg,
      fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 500,
      letterSpacing: '0.04em',
      padding: '2px 7px', borderRadius: 2,
      whiteSpace: 'nowrap',
      ...style,
    }}>{children}</span>
  );
}

// Row — the YourJared signature: left green bar + data columns
function Row({ children, selected, accent, onClick, style = {} }) {
  const [hover, setHover] = useState(false);
  const barColor = accent || 'var(--border-hi)';
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'stretch',
        background: selected ? 'var(--accent-row)' : hover ? 'var(--bg-hi)' : 'transparent',
        borderBottom: '1px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.1s',
        ...style,
      }}>
      <div style={{ width: 3, background: selected ? 'var(--accent)' : barColor, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
        {children}
      </div>
    </div>
  );
}

function Panel({ children, style = {}, onClick, selected, hoverable }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: selected ? 'var(--accent-dim)' : 'var(--bg)',
        border: `1px solid ${selected ? 'var(--accent-border)' : hover && hoverable ? 'var(--border-hi)' : 'var(--border)'}`,
        padding: 16, borderRadius: 2,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.12s',
        ...style,
      }}>
      {children}
    </div>
  );
}

// Section header — small uppercase tag + big bold lowercase title (YourJared style)
function SectionHeader({ num, label, desc, actions }) {
  return (
    <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 20 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.12em', marginBottom: 8, textTransform: 'uppercase' }}>
          step {num} / onboarding
        </div>
        <h1 style={{
          fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700,
          letterSpacing: '-0.01em', color: 'var(--text)', lineHeight: 1.25, marginBottom: 6,
        }}>{label}</h1>
        {desc && <p style={{
          fontSize: 12, color: 'var(--text-dim)',
          lineHeight: 1.55, maxWidth: 620,
        }}>{desc}</p>}
      </div>
      {actions}
    </div>
  );
}

function KV({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function Check({ checked, onChange, size = 14 }) {
  return (
    <button onClick={e => { e.stopPropagation(); onChange && onChange(!checked); }} style={{
      width: size, height: size, borderRadius: 2,
      background: checked ? 'var(--accent)' : 'var(--bg)',
      border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border-hi)'}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, transition: 'all 0.1s',
    }}>
      {checked && <Icon name="check" size={size - 6} stroke={3} style={{ color: '#000' }} />}
    </button>
  );
}

function ProgressBar({ value, max = 100, tone = 'accent', height = 3, shimmer }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = tone === 'warn' ? 'var(--warn)' : 'var(--accent)';
  return (
    <div style={{ height, background: 'var(--border)', borderRadius: 0, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${pct}%`,
        background: shimmer
          ? `linear-gradient(90deg, ${color} 0%, #4be893 50%, ${color} 100%)`
          : color,
        backgroundSize: shimmer ? '200% 100%' : undefined,
        animation: shimmer ? 'shimmer 2s linear infinite' : undefined,
        transition: 'width 0.3s',
      }} />
    </div>
  );
}

// Label over a list of columns — YourJared's tiny column headers
function ColHeader({ children, style = {} }) {
  return (
    <div style={{
      fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.1em',
      textTransform: 'uppercase', padding: '8px 14px',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 12,
      ...style,
    }}>{children}</div>
  );
}

Object.assign(window, {
  Icon, PrimaryButton, GhostButton, Chip, Row, Panel,
  SectionHeader, KV, Check, ProgressBar, ColHeader,
});
