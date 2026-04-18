function ScreenHandoff({ onBack }) {
  const [webuiUp, setWebuiUp] = useState(false);
  const [starting, setStarting] = useState(false);

  const launch = () => {
    setStarting(true);
    setTimeout(() => { setStarting(false); setWebuiUp(true); }, 1800);
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, padding: '48px 56px', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 12 }}>
          step 09 · launch
        </div>
        <h1 style={{
          fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 700,
          letterSpacing: '-0.01em', color: 'var(--text)', lineHeight: 1.2, marginBottom: 10,
        }}>
          {webuiUp ? <>you're live. <span style={{ color: 'var(--accent-hi)' }}>go talk to jared.</span></> :
           <>ready to ship. <span style={{ color: 'var(--accent-hi)' }}>launch the services?</span></>}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.55, marginBottom: 28, maxWidth: 560 }}>
          your api server is already warm. this starts open webui — a chat ui that auto-discovers your local endpoint.
          you can skip this if you prefer to use your own client.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 28 }}>
          {[
            {
              name: 'ylj api',
              endpoint: 'http://localhost:8080/v1',
              status: 'running',
              desc: 'openai-compatible chat endpoint',
              up: true,
            },
            {
              name: 'open webui',
              endpoint: 'http://localhost:3000',
              status: webuiUp ? 'running' : starting ? 'starting' : 'stopped',
              desc: 'self-hosted chat ui',
              up: webuiUp,
              starting,
            },
            {
              name: 'ollama',
              endpoint: 'http://localhost:11434',
              status: 'running',
              desc: 'inference backend',
              up: true,
            },
          ].map((s, i) => (
            <Row key={s.name} accent={s.up ? 'var(--accent)' : s.starting ? 'var(--warn)' : 'var(--border-hi)'} style={{ padding: 0 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: s.up ? 'var(--accent)' : s.starting ? 'var(--warn)' : 'var(--text-faintest)',
                animation: s.starting ? 'pulse 1s ease-in-out infinite' : undefined,
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.desc}</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{s.endpoint}</span>
              <Chip tone={s.up ? 'ok' : s.starting ? 'warn' : 'default'}>{s.status}</Chip>
              {s.up && <Icon name="external" size={12} style={{ color: 'var(--text-dim)' }} />}
            </Row>
          ))}
        </div>

        {!webuiUp ? (
          <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
            <PrimaryButton onClick={launch} disabled={starting} iconRight="external" style={{ minWidth: 240 }}>
              {starting ? 'starting…' : 'launch open webui'}
            </PrimaryButton>
            <GhostButton iconLeft="terminal">i'll use my own client</GhostButton>
          </div>
        ) : (
          <div style={{
            background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
            padding: 18, marginBottom: 28, display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <Icon name="sparkle" size={18} style={{ color: 'var(--accent-hi)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>open webui is up at <span style={{ color: 'var(--accent-hi)' }}>localhost:3000</span></div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>preloaded with your ylj endpoint. first message might take ~5s while the model warms.</div>
            </div>
            <PrimaryButton iconRight="external">open in browser</PrimaryButton>
          </div>
        )}

        <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 12 }}>next steps</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border)', border: '1px solid var(--border)' }}>
          {[
            { n: '01', t: 'chat from anywhere', b: 'any openai-compatible client works. point it at localhost:8080/v1, leave the api key blank.' },
            { n: '02', t: 'add more folders', b: 'run `ylj add ~/NewFolder` anytime. the index updates incrementally; no full rebuild.' },
            { n: '03', t: 'watch for changes', b: 'enable `ylj watch` to auto-reingest edited files. off by default — costs ram.' },
          ].map(c => (
            <div key={c.n} style={{ background: 'var(--bg)', padding: 16 }}>
              <div style={{ fontSize: 10, color: 'var(--accent-hi)', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>{c.n} · {c.t}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.55 }}>{c.b}</div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ borderTop: '1px solid var(--border)', marginTop: 24, paddingTop: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <GhostButton onClick={onBack} iconLeft="arrow-l">back</GhostButton>
          <div style={{ flex: 1 }} />
          <GhostButton iconLeft="book">docs</GhostButton>
          <GhostButton iconLeft="cog">settings</GhostButton>
          <PrimaryButton iconRight="arrow-r">close setup</PrimaryButton>
        </div>
      </div>

      <div style={{ width: 340, borderLeft: '1px solid var(--border)', background: 'var(--bg-alt)', padding: '32px 24px' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 14 }}>summary</div>
        <KV label="llm" value="qwen 2.5 · 7b" />
        <KV label="embedding" value="nomic-embed" />
        <KV label="folders" value="2 paths" />
        <KV label="documents" value="4,132" />
        <KV label="chunks" value="17,284" />
        <KV label="index on disk" value="1.2 GB" />
        <div style={{ height: 22 }} />
        <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 14 }}>quick cli</div>
        <div style={{
          background: 'var(--bg)', border: '1px solid var(--border)',
          padding: 14, fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.9,
        }}>
          <div style={{ color: 'var(--text-dimmer)' }}># ask a question</div>
          <div style={{ color: 'var(--text)' }}><span style={{ color: 'var(--accent-hi)' }}>$</span> jared "who did i meet tuesday?"</div>
          <div style={{ height: 8 }} />
          <div style={{ color: 'var(--text-dimmer)' }}># add more sources</div>
          <div style={{ color: 'var(--text)' }}><span style={{ color: 'var(--accent-hi)' }}>$</span> jared add ~/Projects</div>
          <div style={{ height: 8 }} />
          <div style={{ color: 'var(--text-dimmer)' }}># stop / start</div>
          <div style={{ color: 'var(--text)' }}><span style={{ color: 'var(--accent-hi)' }}>$</span> jared {webuiUp ? 'stop' : 'start'}</div>
        </div>
      </div>
    </div>
  );
}
window.ScreenHandoff = ScreenHandoff;
