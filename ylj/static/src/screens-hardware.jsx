function ScreenHardware({ onNext, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const t0 = performance.now();
    const stamp = () => ((performance.now() - t0) / 1000).toFixed(2);
    const push = (msg, fg = 'var(--text-dim)') =>
      setLogLines((prev) => [...prev, { t: stamp(), msg, fg }]);

    setData(null);
    setError(null);
    setLogLines([]);
    setProgress(0);
    setDone(false);

    push('starting probe…', 'var(--text-dimmer)');

    fetch('/api/setup/probe', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        const steps = [
          { msg: `chip: ${d.chip} · ${d.cpu.cores_physical}p / ${d.cpu.cores_logical}l`, fg: 'var(--accent-hi)' },
          { msg: `memory: ${d.ram.total_gb} GB total · ${d.ram.available_gb} GB available`, fg: 'var(--text-dim)' },
          {
            msg: d.cuda_available
              ? `cuda available · ${d.gpu.name}`
              : d.mps_available
                ? `metal (mps) available · ${d.gpu.name}`
                : 'no gpu acceleration · cpu only',
            fg: d.cuda_available || d.mps_available ? 'var(--accent-hi)' : 'var(--text-dim)',
          },
          { msg: `disk: ${d.disk.free_gb} GB free / ${d.disk.total_gb} GB`, fg: 'var(--text-dim)' },
          { msg: `python ${d.python.version} · ready`, fg: 'var(--text-dim)' },
          { msg: `os: ${d.os.pretty} (${d.os.machine})`, fg: 'var(--text-dim)' },
          { msg: 'probe complete.', fg: 'var(--accent-hi)' },
        ];
        let i = 0;
        const iv = setInterval(() => {
          if (cancelled) { clearInterval(iv); return; }
          push(steps[i].msg, steps[i].fg);
          setProgress((p) => p + 1);
          i += 1;
          if (i >= steps.length) {
            clearInterval(iv);
            setTimeout(() => !cancelled && setDone(true), 200);
          }
        }, 180);
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return;
        if (cancelled) return;
        setError(String(e));
        push(`probe failed: ${e}`, 'var(--danger, #e66)');
        setDone(true);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [nonce]);

  const FALLBACK_TIER = {
    label: 'conservative',
    chip7: 'slow',
    chip13: false,
    chip30: false,
    chip70: false,
    msg: 'probe failed — using conservative defaults.',
  };

  const tier = (() => {
    if (error) return FALLBACK_TIER;
    if (!data) return { label: 'probing', chip7: null, chip13: null, chip30: null, chip70: null, msg: '' };

    // CUDA: tier off VRAM. Q4 model sizes used as the budget:
    // 7B≈5GB, 13B≈8GB, 30B≈20GB, 70B Q3≈30GB / Q4≈40GB. Add headroom for KV cache.
    const vramGb = data.cuda_available ? Number(data.gpu?.vram_gb) : 0;
    if (vramGb >= 30) return { label: 'high', chip7: true, chip13: true, chip30: true, chip70: 'slow', msg: `${vramGb} GB VRAM — 7B–30B run fully on GPU; 70B (Q3) usable but slow.` };
    if (vramGb >= 20) return { label: 'capable+', chip7: true, chip13: true, chip30: true, chip70: false, msg: `${vramGb} GB VRAM — 7B–30B run on GPU; 70B too large.` };
    if (vramGb >= 12) return { label: 'capable', chip7: true, chip13: true, chip30: 'slow', chip70: false, msg: `${vramGb} GB VRAM — 7B–13B comfortable; 30B with partial offload.` };
    if (vramGb >= 8) return { label: 'modest+', chip7: true, chip13: 'slow', chip30: false, chip70: false, msg: `${vramGb} GB VRAM — 7B fast; 13B will be slow.` };
    if (vramGb >= 6) return { label: 'modest', chip7: true, chip13: false, chip30: false, chip70: false, msg: `${vramGb} GB VRAM — 7B (Q4) fits on GPU.` };

    // MPS / CPU: budget against free system RAM (unified memory or full CPU inference).
    const totalGb = Number(data.ram.total_gb);
    const availableGb = Number(data.ram.available_gb);
    const gb = Number.isFinite(totalGb)
      ? (Number.isFinite(availableGb) ? Math.min(totalGb, availableGb) : totalGb)
      : availableGb;
    const accel = data.cuda_available || data.mps_available;
    if (gb >= 48 && accel) return { label: 'high', chip7: true, chip13: true, chip30: true, chip70: 'slow', msg: 'you can run 7B–30B comfortably; 70B usable but slow.' };
    if (gb >= 24) return { label: 'capable', chip7: true, chip13: true, chip30: 'slow', chip70: false, msg: 'you can run 7B–13B comfortably. 30B possible but slow.' };
    if (gb >= 12) return { label: 'modest', chip7: true, chip13: 'slow', chip30: false, chip70: false, msg: '7B models should run; 13B will be slow.' };
    return FALLBACK_TIER;
  })();

  const chipLabel = (name, v) => {
    if (v === null) return `${name} …`;
    if (v === true) return `${name} ✓`;
    if (v === 'slow') return `${name} · slow`;
    return `${name} ✗`;
  };
  const chipTone = (v) => (v === true ? 'ok' : v === 'slow' ? 'warn' : undefined);

  const rows = data ? [
    { icon: 'cpu',    label: 'chip',     value: data.chip,                                meta: `${data.cpu.cores_physical}p / ${data.cpu.cores_logical}l cores`, tone: 'ok' },
    { icon: 'memory', label: 'memory',   value: `${data.ram.total_gb} GB`,                meta: `${data.ram.available_gb} GB available`,                          tone: 'ok' },
    { icon: 'zap',    label: 'gpu',      value: data.gpu.name,                            meta: data.cuda_available ? `${data.gpu.vram_gb} GB VRAM · cuda` : data.mps_available ? 'metal · unified memory' : 'cpu only', tone: data.cuda_available || data.mps_available ? 'ok' : 'warn' },
    { icon: 'hdd',    label: 'storage',  value: `${data.disk.free_gb} GB free`,           meta: `of ${data.disk.total_gb} GB`,                                    tone: data.disk.free_gb > 20 ? 'ok' : 'warn' },
    { icon: 'terminal', label: 'python', value: data.python.version,                      meta: 'interpreter ready',                                              tone: 'ok' },
    { icon: 'zap',    label: 'os',       value: data.os.pretty,                           meta: data.os.machine,                                                  tone: 'ok' },
  ] : [
    { icon: 'cpu',    label: 'chip',     value: '…', meta: error ? 'probe failed' : 'probing', tone: 'ok' },
    { icon: 'memory', label: 'memory',   value: '…', meta: error ? 'probe failed' : 'probing', tone: 'ok' },
    { icon: 'zap',    label: 'gpu',      value: '…', meta: error ? 'probe failed' : 'probing', tone: 'ok' },
    { icon: 'hdd',    label: 'storage',  value: '…', meta: error ? 'probe failed' : 'probing', tone: 'ok' },
    { icon: 'terminal', label: 'python', value: '…', meta: error ? 'probe failed' : 'probing', tone: 'ok' },
    { icon: 'zap',    label: 'os',       value: '…', meta: error ? 'probe failed' : 'probing', tone: 'ok' },
  ];

  const reprobe = () => setNonce((n) => n + 1);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: '1 1 60%', padding: '40px 48px', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <SectionHeader
          num="02"
          label="hardware probe"
          desc="checking what this machine can run comfortably. local inference is cpu/ram/gpu-bound, so we tier-match models to what you've got."
          actions={
            <GhostButton iconLeft="zap" onClick={reprobe}>
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
            const probed = data && progress > i;
            const failed = !data && error;
            return (
              <Row key={r.label} accent={probed ? 'var(--accent)' : error ? 'var(--warn)' : 'var(--border-hi)'}>
                <Icon name={r.icon} size={14} style={{ color: probed ? 'var(--accent-hi)' : error ? 'var(--warn)' : 'var(--text-dimmer)' }} />
                <span style={{ width: 90, fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {r.label}
                </span>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {probed ? r.value : failed ? 'unknown' : '…'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-dimmer)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {probed ? r.meta : failed ? 'probe failed' : 'probing'}
                  </span>
                </div>
                {probed ? <Chip tone={r.tone}>{r.tone === 'warn' ? 'check' : 'ok'}</Chip>
                  : failed ? <Chip tone="warn">n/a</Chip>
                  : <span style={{
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
                recommendation · tier: {tier.label}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, marginBottom: 10 }}>
                {error
                  ? `probe failed: ${error}. using conservative defaults.`
                  : data
                    ? tier.msg
                    : 'probing hardware…'}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Chip tone={chipTone(tier.chip7)}>{chipLabel('7b', tier.chip7)}</Chip>
                <Chip tone={chipTone(tier.chip13)}>{chipLabel('13b', tier.chip13)}</Chip>
                <Chip tone={chipTone(tier.chip30)}>{chipLabel('30b', tier.chip30)}</Chip>
                <Chip tone={chipTone(tier.chip70)}>{chipLabel('70b', tier.chip70)}</Chip>
              </div>
            </div>
          </div>
        </Panel>

        <div style={{ flex: 1 }} />
        <StepNav
          onBack={onBack}
          onNext={onNext}
          nextLabel={done ? 'pick folders' : 'probing…'}
          nextDisabled={!done}
        />
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
          <span style={{ fontSize: 10, color: 'var(--text-dimmer)' }}>{logLines.length} lines</span>
        </div>
        <div style={{ flex: 1, padding: '16px 18px', overflow: 'auto', fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.85 }}>
          {logLines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, animation: 'slideIn 0.2s ease-out', color: l.fg }}>
              <span style={{ color: 'var(--text-faintest)', width: 34 }}>{l.t}</span>
              <span style={{ color: 'var(--text-faintest)' }}>│</span>
              <span style={{ flex: 1 }}>{l.msg}</span>
            </div>
          ))}
          {!done && (
            <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
              <span style={{ color: 'var(--text-faintest)', width: 34 }}>…</span>
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
