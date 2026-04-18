function ScreenHardware({ onNext, onBack }) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const logLines = [
    { t: '0.00', msg: 'starting probe…', fg: 'var(--text-dimmer)' },
    { t: '0.04', msg: 'sysctl hw.memsize → 38654705664', fg: 'var(--text-dim)' },
    { t: '0.08', msg: 'detected apple silicon: M3 Pro (arm64)', fg: 'var(--accent-hi)' },
    { t: '0.14', msg: 'metal device available · 18 cores', fg: 'var(--accent-hi)' },
    { t: '0.22', msg: 'disk: /dev/disk3s1 · 486 GB free', fg: 'var(--text-dim)' },
    { t: '0.31', msg: 'ollama daemon up · 127.0.0.1:11434', fg: 'var(--accent-hi)' },
    { t: '0.38', msg: 'tier estimate: capable (7B-13B comfortable)', fg: 'var(--text)' },
    { t: '0.42', msg: 'probe complete.', fg: 'var(--accent-hi)' },
  ];

  useEffect(() => {
    let step = 0;
    const t = setInterval(() => {
      step += 1;
      setProgress(step);
      if (step >= logLines.length) {
        clearInterval(t);
        setTimeout(() => setDone(true), 300);
      }
    }, 280);
    return () => clearInterval(t);
  }, []);

  const rows = [
    { icon: 'cpu',    label: 'chip',     value: HARDWARE.chip,   meta: HARDWARE.cores,  tone: 'ok' },
    { icon: 'memory', label: 'memory',   value: HARDWARE.ram,    meta: '26 GB available', tone: 'ok' },
    { icon: 'zap',    label: 'gpu',      value: HARDWARE.gpu,    meta: 'metal · unified memory', tone: 'ok' },
    { icon: 'hdd',    label: 'storage',  value: HARDWARE.disk,   meta: 'sufficient headroom', tone: 'ok' },
  ];

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: '1 1 60%', padding: '40px 48px', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <SectionHeader
          num="02"
          label="hardware probe"
          desc="checking what this machine can run comfortably. local inference is cpu/ram/gpu-bound, so we tier-match models to what you've got."
          actions={
            <GhostButton iconLeft="zap" onClick={() => { setProgress(0); setDone(false); setTimeout(()=>{}, 0); }}>
              re-probe
            </GhostButton>
          }
        />

        <div style={{ marginBottom: 20 }}>
          <ColHeader>
            <span style={{ width: 20 }} />
            <span style={{ width: 90 }}>component</span>
            <span style={{ flex: 1 }}>value</span>
            <span>status</span>
          </ColHeader>
          {rows.map((r, i) => {
            const probed = progress > i * 1.5;
            return (
              <Row key={r.label} accent={probed ? 'var(--accent)' : 'var(--border-hi)'}>
                <Icon name={r.icon} size={14} style={{ color: probed ? 'var(--accent-hi)' : 'var(--text-dimmer)' }} />
                <span style={{ width: 90, fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {r.label}
                </span>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{probed ? r.value : '…'}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-dimmer)' }}>{probed ? r.meta : 'probing'}</span>
                </div>
                {probed ? <Chip tone="ok">ok</Chip> : <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: 'var(--border)',
                  animation: 'pulse 1s ease-in-out infinite',
                }} />}
              </Row>
            );
          })}
        </div>

        <Panel style={{ background: 'var(--accent-dim)', borderColor: 'var(--accent-border)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <Icon name="sparkle" size={16} style={{ color: 'var(--accent-hi)', marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: 'var(--accent-hi)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
                recommendation · tier: capable
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, marginBottom: 10 }}>
                you can run 7B–13B models comfortably. we'll preselect <strong>qwen2.5:7b</strong> + <strong>nomic-embed-text</strong>.
                70B is technically possible but slow (~3 tok/s).
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Chip tone="ok">7b ✓</Chip>
                <Chip tone="ok">13b ✓</Chip>
                <Chip>30b · slow</Chip>
                <Chip>70b · very slow</Chip>
              </div>
            </div>
          </div>
        </Panel>

        <div style={{ flex: 1 }} />
        <StepNav onBack={onBack} onNext={onNext} nextLabel={done ? 'pick folders' : 'probing…'} nextDisabled={!done} />
      </div>

      <div style={{
        width: 420, borderLeft: '1px solid var(--border)',
        background: 'var(--bg-alt)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="terminal" size={12} style={{ color: 'var(--text-dim)' }} />
          <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            probe log
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--text-dimmer)' }}>{Math.min(progress, logLines.length)} / {logLines.length}</span>
        </div>
        <div style={{ flex: 1, padding: '16px 18px', overflow: 'auto', fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.85 }}>
          {logLines.slice(0, progress).map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, animation: 'slideIn 0.2s ease-out', color: l.fg }}>
              <span style={{ color: 'var(--text-faintest)', width: 34 }}>{l.t}</span>
              <span style={{ color: 'var(--text-faintest)' }}>│</span>
              <span style={{ flex: 1 }}>{l.msg}</span>
            </div>
          ))}
          {progress < logLines.length && (
            <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
              <span style={{ color: 'var(--text-faintest)', width: 34 }}>{(progress * 0.04 + 0.02).toFixed(2)}</span>
              <span style={{ color: 'var(--text-faintest)' }}>│</span>
              <span style={{ color: 'var(--accent-hi)', animation: 'blink 0.8s steps(2) infinite' }}>▌</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
window.ScreenHardware = ScreenHardware;
