// Top bar + step strip + layout shell
const STEPS = [
  { id: 'welcome',  label: 'welcome' },
  { id: 'hardware', label: 'hardware' },
  { id: 'folders',  label: 'folders' },
  { id: 'types',    label: 'file types' },
  { id: 'models',   label: 'models' },
  { id: 'install',  label: 'install' },
  { id: 'ingest',   label: 'ingest' },
  { id: 'test',     label: 'test' },
  { id: 'handoff',  label: 'launch' },
];

function TopBar({ step, onOpenTweaks }) {
  return (
    <div style={{
      height: 44, borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 18px',
      background: 'var(--bg)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Logo size={22} />
        <Wordmark />
        <BetaPill label="SETUP" />
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        <span>docs</span>
        <span>github</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
          100% local
        </span>
        {onOpenTweaks && (
          <button
            onClick={onOpenTweaks}
            title="Preferences (theme, font size, motion)"
            aria-label="Open preferences"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer',
            }}
          >
            <Icon name="cog" size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function StepStrip({ step, onStep }) {
  const idx = STEPS.findIndex(s => s.id === step);
  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-alt)',
      padding: '0 18px',
      display: 'flex', alignItems: 'stretch',
      height: 32, flexShrink: 0,
    }}>
      {STEPS.map((s, i) => {
        const done = i < idx;
        const cur = i === idx;
        return (
          <button key={s.id}
            onClick={() => (done || cur) && onStep(s.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 14px',
              fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: cur ? 'var(--text)' : done ? 'var(--text-dim)' : 'var(--text-faintest)',
              fontWeight: cur ? 600 : 400,
              borderRight: '1px solid var(--border)',
              borderBottom: cur ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
              cursor: (done || cur) ? 'pointer' : 'default',
            }}>
            <span style={{ fontSize: 9, color: cur ? 'var(--accent-hi)' : 'inherit' }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span>{s.label}</span>
            {done && <Icon name="check" size={10} stroke={3} style={{ color: 'var(--accent-hi)' }} />}
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dimmer)', fontSize: 10, letterSpacing: '0.08em' }}>
        step {String(idx + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
      </div>
    </div>
  );
}

// Footer nav — YourJared's big primary action + ghost skip
function StepNav({ onBack, onNext, nextLabel = 'continue', nextIcon = 'arrow-r', nextDisabled, skipLabel, onSkip }) {
  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      padding: '14px 24px',
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'var(--bg)', flexShrink: 0,
    }}>
      {onBack && (
        <GhostButton onClick={onBack} iconLeft="arrow-l">back</GhostButton>
      )}
      <div style={{ flex: 1 }} />
      {skipLabel && <GhostButton onClick={onSkip}>{skipLabel}</GhostButton>}
      {onNext && (
        <PrimaryButton onClick={onNext} disabled={nextDisabled} iconRight={nextIcon} style={{ minWidth: 180 }}>
          {nextLabel}
        </PrimaryButton>
      )}
    </div>
  );
}

function StatusLine({ items }) {
  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      height: 22,
      padding: '0 14px',
      background: 'var(--bg-alt)',
      display: 'flex', alignItems: 'center', gap: 14,
      fontSize: 9.5, color: 'var(--text-dimmer)',
      letterSpacing: '0.08em', textTransform: 'uppercase',
      flexShrink: 0,
    }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {it.dot && <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: it.dot === 'on' ? 'var(--accent)' : it.dot === 'warn' ? 'var(--warn)' : 'var(--border-hi)',
            animation: it.dot === 'on' ? 'pulse 2s ease-in-out infinite' : undefined,
          }} />}
          {it.text}
        </span>
      ))}
    </div>
  );
}

Object.assign(window, { TopBar, StepStrip, StepNav, StatusLine, STEPS });
