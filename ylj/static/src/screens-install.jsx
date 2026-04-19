function ScreenInstall({ onNext, onBack, llmId, embId }) {
  const llm = LLMS.find(m => m.id === llmId);
  const emb = EMBEDDERS.find(m => m.id === embId);

  const [logs, setLogs] = useState([]);
  const [llmP, setLlmP] = useState(0);
  const [embP, setEmbP] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!llm || !emb) {
      setError('Missing LLM or embedding selection.');
      setDone(true);
      return;
    }

    const t0 = performance.now();
    const stamp = () => ((performance.now() - t0) / 1000).toFixed(2);
    const append = (msg) => setLogs(prev => {
      if (prev.length && prev[prev.length - 1].msg === msg) return prev;
      return [...prev, { t: stamp(), msg }];
    });

    let stopped = false;
    let lastMsg = '';

    append(`$ POST /api/setup/apply`);
    append(`llm: ${llm.id}`);
    append(`emb: ${emb.hfId} (${emb.dims}d)`);

    fetch('/api/setup/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llm_model: llm.id,
        embedding_model: emb.hfId,
        embedding_dimension: emb.dims,
      }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(() => append('install started — polling status…'))
      .catch(e => {
        if (stopped) return;
        append(`apply failed: ${e.message || e}`);
        setError(String(e.message || e));
        setDone(true);
        stopped = true;
      });

    // The backend updates a single `message` string; we poll, and any
    // change becomes a new log line. Progress bars fill stage-by-stage
    // from message text since the Ollama subprocess gives us no granular %.
    const tick = () => {
      if (stopped) return;
      fetch('/api/setup/status')
        .then(r => r.json())
        .then(s => {
          if (stopped) return;
          const msg = s && typeof s.message === 'string' ? s.message : '';
          if (msg && msg !== lastMsg) {
            lastMsg = msg;
            append(msg);
            const lower = msg.toLowerCase();
            if (lower.startsWith('error')) {
              setError(msg);
            } else if (lower.includes('embedding model')) {
              setEmbP(p => Math.max(p, 50));
            } else if (lower.includes('pulling llm') || lower.includes('ollama')) {
              setEmbP(100);
              setLlmP(p => Math.max(p, 50));
            }
          }
          if (s && s.done) {
            stopped = true;
            const isErr = (msg || '').toLowerCase().startsWith('error');
            if (!isErr) {
              setEmbP(100);
              setLlmP(100);
              append('✓ install complete');
            }
            setDone(true);
            return;
          }
          setTimeout(tick, 1000);
        })
        .catch(e => {
          if (stopped) return;
          append(`status poll failed: ${e.message || e}`);
          setTimeout(tick, 2000);
        });
    };
    setTimeout(tick, 600);

    return () => { stopped = true; };
  }, []);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: '1 1 55%', padding: '40px 48px', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <SectionHeader num="06" label="downloading models" desc="ollama pulls the llm; sentence-transformers caches the embedder. ingest runs on the next step." />

        <div>
          {[
            { name: llm ? llm.name : '—', tag: llm ? llm.size : '?',  desc: llm ? llm.desc : '', sz: llm ? llm.sizeGB : 0, p: llmP },
            { name: emb ? emb.name : '—', tag: emb ? `${emb.dims}-d` : '?', desc: emb ? emb.desc : '', sz: emb ? emb.sizeGB : 0, p: embP },
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
                      {complete ? `${m.sz} GB · done` : `~${m.sz} GB`}
                    </span>
                  </div>
                  <ProgressBar value={m.p} shimmer={!complete} tone={error ? 'warn' : 'accent'} />
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div style={{ marginTop: 18, padding: 14, border: '1px solid var(--warn, #c97d17)', background: 'rgba(201,125,23,0.08)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn, #c97d17)', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>install failed</div>
            <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</div>
          </div>
        )}

        <div style={{ flex: 1 }} />
        <StepNav onBack={onBack} onNext={onNext} nextLabel={done && !error ? 'start ingest' : error ? 'fix and retry' : 'downloading…'} nextDisabled={!done || !!error} />
      </div>

      <div style={{ flex: '1 1 45%', borderLeft: '1px solid var(--border)', background: 'var(--bg-alt)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="terminal" size={12} style={{ color: 'var(--text-dim)' }} />
          <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>backend · status</span>
          <div style={{ flex: 1 }} />
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: error ? 'var(--warn, #c97d17)' : done ? 'var(--accent)' : 'var(--warn)',
            animation: done ? 'none' : 'pulse 1s infinite',
          }} />
        </div>
        <div style={{ flex: 1, padding: '14px 18px', overflow: 'auto', fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.9 }}>
          {logs.map((l, i) => {
            const msg = (l && typeof l.msg === 'string') ? l.msg : '';
            const isCommand = msg.startsWith('$');
            const isOk = msg.startsWith('✓') || msg.startsWith('→');
            const isErr = msg.toLowerCase().startsWith('error') || msg.includes('failed');
            return (
              <div key={i} style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: 'var(--text-faintest)', width: 32 }}>{l && l.t}</span>
                <span style={{ color: 'var(--text-faintest)' }}>│</span>
                <span style={{
                  flex: 1,
                  color: isErr ? 'var(--warn, #c97d17)' : isCommand ? 'var(--text)' : isOk ? 'var(--accent-hi)' : 'var(--text-dim)',
                  fontWeight: isCommand ? 600 : 400,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {msg}
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
