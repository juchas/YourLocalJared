function ScreenInstall({ onNext, onBack, llmId, embId }) {
  const llm = LLMS.find(m => m.id === llmId);
  const emb = EMBEDDERS.find(m => m.id === embId);
  const [llmP, setLlmP] = useState(0);
  const [embP, setEmbP] = useState(0);
  const [logs, setLogs] = useState([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let l = 0, e = 0;
    const lines = [
      `ollama pull ${llm.id}`,
      `pulling manifest…`,
      `pulling ${(llm.sizeGB * 1024).toFixed(0)} MB · q4_K_M`,
      `verifying sha256… ok`,
      `writing to ~/.ollama/models/${llm.id}`,
      `ollama pull ${emb.id}`,
      `pulling manifest…`,
      `pulling ${(emb.sizeGB * 1024).toFixed(0)} MB · embedding weights`,
      `verifying sha256… ok`,
      `writing to ~/.ollama/models/${emb.id}`,
      `→ both models registered`,
      `→ warming up inference server…`,
      `✓ install complete`,
    ];
    let li = 0;
    const log = setInterval(() => {
      if (li < lines.length) {
        const msg = lines[li];
        if (typeof msg === 'string') {
          setLogs(prev => [...prev, { t: (li * 0.35 + 0.1).toFixed(2), msg }]);
        }
        li++;
      } else {
        clearInterval(log);
      }
    }, 380);

    const prog = setInterval(() => {
      if (l < 100) { l += 2.5; setLlmP(Math.min(100, l)); }
      else if (e < 100) { e += 8; setEmbP(Math.min(100, e)); }
      else { clearInterval(prog); setDone(true); }
    }, 110);

    return () => { clearInterval(log); clearInterval(prog); };
  }, []);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: '1 1 55%', padding: '40px 48px', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <SectionHeader num="06" label="downloading models" desc="pulling from the ollama registry. once done, models live on disk; no network required afterward." />

        <div>
          {[
            { name: llm.name, tag: llm.size, desc: llm.desc, sz: llm.sizeGB, p: llmP },
            { name: emb.name, tag: `${emb.dims}-d`, desc: emb.desc, sz: emb.sizeGB, p: embP },
          ].map((m, i) => {
            const complete = m.p >= 100;
            return (
              <div key={i} style={{
                borderTop: '1px solid var(--border)',
                borderBottom: i === 1 ? '1px solid var(--border)' : 'none',
                padding: '18px 2px', display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 2, flexShrink: 0,
                  background: complete ? 'var(--accent-dim)' : 'var(--bg-hi)',
                  border: `1px solid ${complete ? 'var(--accent-border)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {complete
                    ? <Icon name="check" size={16} stroke={2.5} style={{ color: 'var(--accent-hi)' }} />
                    : <Icon name="download" size={14} style={{ color: 'var(--text-dim)', animation: 'pulse 1.5s ease-in-out infinite' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--accent-hi)' }}>{m.tag}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dimmer)', flex: 1 }}>· {m.desc}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
                      {complete ? `${m.sz} GB · done` : `${((m.p / 100) * m.sz).toFixed(2)} / ${m.sz} GB`}
                    </span>
                  </div>
                  <ProgressBar value={m.p} shimmer={!complete} />
                  <div style={{ display: 'flex', marginTop: 6, fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.06em' }}>
                    <span>{complete ? '—' : '24 MB/s · cdn.ollama.com'}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{m.p.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />
        <StepNav onBack={onBack} onNext={onNext} nextLabel={done ? 'start ingest' : 'downloading…'} nextDisabled={!done} />
      </div>

      <div style={{ flex: '1 1 45%', borderLeft: '1px solid var(--border)', background: 'var(--bg-alt)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="terminal" size={12} style={{ color: 'var(--text-dim)' }} />
          <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>ollama · stdout</span>
          <div style={{ flex: 1 }} />
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: done ? 'var(--accent)' : 'var(--warn)', animation: done ? 'none' : 'pulse 1s infinite' }} />
        </div>
        <div style={{ flex: 1, padding: '14px 18px', overflow: 'auto', fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.9 }}>
          {logs.map((l, i) => {
            const msg = (l && typeof l.msg === 'string') ? l.msg : '';
            const isCommand = msg.startsWith('ollama');
            const isDone = msg.startsWith('✓') || msg.startsWith('→');
            return (
              <div key={i} style={{ display: 'flex', gap: 10, animation: 'slideIn 0.2s' }}>
                <span style={{ color: 'var(--text-faintest)', width: 32 }}>{l && l.t}</span>
                <span style={{ color: 'var(--text-faintest)' }}>│</span>
                <span style={{
                  flex: 1,
                  color: isCommand ? 'var(--text)' : isDone ? 'var(--accent-hi)' : 'var(--text-dim)',
                  fontWeight: isCommand ? 600 : 400,
                }}>
                  {isCommand && '$ '}{msg}
                </span>
              </div>
            );
          })}
          {!done && (
            <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <span style={{ color: 'var(--text-faintest)', width: 32 }}>...</span>
              <span style={{ color: 'var(--text-faintest)' }}>│</span>
              <span style={{ color: 'var(--accent-hi)', animation: 'blink 0.8s steps(2) infinite' }}>▌</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
window.ScreenInstall = ScreenInstall;
