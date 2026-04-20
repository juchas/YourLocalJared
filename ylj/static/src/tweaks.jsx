// Tweaks panel — optional floating controls. Accent colour (page-local)
// + the shared PrefsSection (theme / font size / motion) from prefs.jsx.
function TweaksPanel({ tweaks, setTweaks, prefs, setPrefs, onClose }) {
  const set = (k, v) => {
    setTweaks(t => ({ ...t, [k]: v }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
  };
  const accents = [
    { id: 'green',  hi: '#11a851', base: '#18c964', row: '#18c9641a', bd: '#18c96440', dim: '#18c96412' },
    { id: 'violet', hi: '#6d28d9', base: '#7c3aed', row: '#7c3aed1a', bd: '#7c3aed40', dim: '#7c3aed12' },
    { id: 'cyan',   hi: '#0891b2', base: '#06b6d4', row: '#06b6d41a', bd: '#06b6d440', dim: '#06b6d412' },
    { id: 'amber',  hi: '#c2410c', base: '#ea580c', row: '#ea580c1a', bd: '#ea580c40', dim: '#ea580c12' },
    { id: 'rose',   hi: '#be185d', base: '#e11d48', row: '#e11d481a', bd: '#e11d4840', dim: '#e11d4812' },
  ];
  useEffect(() => {
    const a = accents.find(a => a.id === tweaks.accent) || accents[0];
    const root = document.documentElement.style;
    root.setProperty('--accent', a.base);
    root.setProperty('--accent-hi', a.hi);
    root.setProperty('--accent-row', a.row);
    root.setProperty('--accent-border', a.bd);
    root.setProperty('--accent-dim', a.dim);
  }, [tweaks.accent]);

  return (
    <div style={{
      position: 'fixed', bottom: 40, right: 20, width: 260, zIndex: 1000,
      background: 'var(--bg)', border: '1px solid var(--border-hi)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
      fontFamily: 'var(--mono)',
    }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-alt)' }}>
        <Icon name="cog" size={11} />
        <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>tweaks</span>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ color: 'var(--text-dim)' }}><Icon name="x" size={11} /></button>
      </div>
      <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>accent</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {accents.map(a => (
              <button key={a.id} onClick={() => set('accent', a.id)} style={{
                width: 28, height: 28, background: a.base,
                border: `2px solid ${tweaks.accent === a.id ? 'var(--text)' : 'transparent'}`,
                borderRadius: 2,
              }} title={a.id} />
            ))}
          </div>
        </div>
        {prefs && setPrefs && <PrefsSection prefs={prefs} setPrefs={setPrefs} />}
        {tweaks.showStatusBar !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check checked={tweaks.showStatusBar} onChange={v => set('showStatusBar', v)} />
            <span style={{ fontSize: 11, color: 'var(--text)' }}>show status bar</span>
          </div>
        )}
      </div>
    </div>
  );
}
window.TweaksPanel = TweaksPanel;
