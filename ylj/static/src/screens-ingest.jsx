function ScreenIngest({ onNext, onBack, folders, fileTypes }) {
  const totalFiles = folders.filter(f => f.selected).reduce((a, b) => a + b.files, 0)
    * (fileTypes.filter(t => t.on).length / fileTypes.length);
  const targetFiles = Math.floor(totalFiles);

  const phases = ['scan', 'parse', 'chunk', 'embed', 'store'];
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [filesProcessed, setFilesProcessed] = useState(0);
  const [chunks, setChunks] = useState(0);
  const [done, setDone] = useState(false);
  const [log, setLog] = useState([]);

  const filenames = [
    'notes/2024-q2-review.md', 'research/rag-papers.pdf', 'journal/2023-11.md',
    'docs/onboarding-brief.docx', 'notes/ideas/embedding-arch.md',
    'research/transformers-revisited.pdf', 'meetings/2024-03-14.md',
    'notes/book-summaries/godel-escher-bach.md', 'docs/contracts/acme.pdf',
    'journal/2024-01.md', 'notes/recipes/carbonara.md', 'research/retrieval.pdf',
  ];

  useEffect(() => {
    let step = 0;
    const t = setInterval(() => {
      step++;
      setPhaseIdx(Math.min(4, Math.floor(step / 30)));
      setFilesProcessed(p => {
        const next = Math.min(targetFiles, p + Math.floor(Math.random() * 18) + 6);
        return next;
      });
      setChunks(c => c + Math.floor(Math.random() * 60) + 30);
      if (step % 3 === 0) {
        const fn = filenames[Math.floor(Math.random() * filenames.length)];
        setLog(l => [{
          t: (step * 0.12).toFixed(2),
          file: fn,
          chunks: Math.floor(Math.random() * 12) + 2,
          ms: Math.floor(Math.random() * 120) + 20,
        }, ...l].slice(0, 40));
      }
      if (step >= 110) {
        clearInterval(t);
        setFilesProcessed(targetFiles);
        setPhaseIdx(4);
        setDone(true);
      }
    }, 60);
    return () => clearInterval(t);
  }, []);

  const pct = (filesProcessed / targetFiles) * 100;
  const SZ = 180;
  const R = (SZ - 16) / 2;
  const C = 2 * Math.PI * R;

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: '1 1 55%', padding: '32px 48px', display: 'flex', flexDirection: 'column' }}>
        <SectionHeader num="07" label="building the index" desc="parsing files, splitting into chunks, generating embeddings, writing to the local vector store. nothing leaves this machine." />

        <div style={{ flex: 1, display: 'flex', gap: 32, alignItems: 'center', padding: '16px 0' }}>
          <div style={{ position: 'relative', width: SZ, height: SZ, flexShrink: 0 }}>
            <svg width={SZ} height={SZ} style={{ transform: 'rotate(-90deg)' }}>
              <circle cx={SZ/2} cy={SZ/2} r={R} stroke="var(--border)" strokeWidth={4} fill="none" />
              <circle cx={SZ/2} cy={SZ/2} r={R}
                stroke="var(--accent)" strokeWidth={4} fill="none"
                strokeLinecap="square"
                strokeDasharray={C}
                strokeDashoffset={C - (C * pct) / 100}
                style={{ transition: 'stroke-dashoffset 0.2s' }}
              />
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {pct.toFixed(0)}<span style={{ fontSize: 16, color: 'var(--text-dim)' }}>%</span>
              </div>
              <div style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-dimmer)', textTransform: 'uppercase' }}>
                {phases[phaseIdx]}ing
              </div>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', marginBottom: 18 }}>
              {[
                ['files', `${filesProcessed.toLocaleString()} / ${targetFiles.toLocaleString()}`],
                ['chunks', chunks.toLocaleString()],
                ['elapsed', `${(filesProcessed * 0.04).toFixed(1)}s`],
                ['eta', done ? '—' : `${Math.max(0, Math.round((targetFiles - filesProcessed) * 0.04))}s`],
              ].map(([l, v]) => (
                <div key={l} style={{ background: 'var(--bg)', padding: 12 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dimmer)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 8 }}>pipeline</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {phases.map((ph, i) => {
                const cur = i === phaseIdx && !done;
                const dn = i < phaseIdx || done;
                return (
                  <React.Fragment key={ph}>
                    <div style={{
                      flex: 1, padding: '8px 6px',
                      textAlign: 'center', fontSize: 10,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: dn || cur ? 'var(--text)' : 'var(--text-faintest)',
                      fontWeight: cur ? 600 : 400,
                      background: cur ? 'var(--accent-dim)' : dn ? 'var(--bg-hi)' : 'var(--bg)',
                      border: `1px solid ${cur ? 'var(--accent-border)' : 'var(--border)'}`,
                      borderRadius: 2,
                    }}>
                      {ph}
                    </div>
                    {i < phases.length - 1 && <span style={{ color: 'var(--text-faintest)', fontSize: 10 }}>→</span>}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>

        <StepNav onBack={onBack} onNext={onNext} nextLabel={done ? 'run a test query' : 'indexing…'} nextDisabled={!done} />
      </div>

      <div style={{ flex: '1 1 45%', borderLeft: '1px solid var(--border)', background: 'var(--bg-alt)', display: 'flex', flexDirection: 'column' }}>
        <ColHeader>
          <span style={{ flex: 1 }}>processed</span>
          <span style={{ width: 70, textAlign: 'right' }}>chunks</span>
          <span style={{ width: 60, textAlign: 'right' }}>ms</span>
        </ColHeader>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {log.map((l, i) => (
            <Row key={i} accent="var(--accent)" style={{ animation: 'slideIn 0.2s' }}>
              <span style={{ fontSize: 10, color: 'var(--text-faintest)', width: 36, fontVariantNumeric: 'tabular-nums' }}>{l.t}</span>
              <Icon name="check" size={10} stroke={2.5} style={{ color: 'var(--accent-hi)' }} />
              <span style={{ flex: 1, fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.file}
              </span>
              <span style={{ width: 70, textAlign: 'right', fontSize: 11, color: 'var(--accent-hi)', fontVariantNumeric: 'tabular-nums' }}>+{l.chunks}</span>
              <span style={{ width: 60, textAlign: 'right', fontSize: 11, color: 'var(--text-dimmer)', fontVariantNumeric: 'tabular-nums' }}>{l.ms}</span>
            </Row>
          ))}
        </div>
      </div>
    </div>
  );
}
window.ScreenIngest = ScreenIngest;
