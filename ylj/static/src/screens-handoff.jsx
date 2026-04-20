function ScreenHandoff({ onBack, llmId, embId }) {
  const llm = LLMS.find(m => m.id === llmId);
  const emb = EMBEDDERS.find(m => m.id === embId);
  const llmLabel = llm ? `${llm.name} · ${llm.size}` : (llmId || '—');
  const embLabel = emb ? `${emb.name} · ${emb.dims}d` : (embId || '—');
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
          you're live. <span style={{ color: 'var(--accent-hi)' }}>go talk to jared.</span>
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.55, marginBottom: 28, maxWidth: 560 }}>
          everything runs on the same local server — the chat ui is bundled at /chat, no extra services to start.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 28 }}>
          {[
            {
              name: 'ylj chat',
              endpoint: 'http://localhost:8000/chat',
              status: 'running',
              desc: 'bundled chat ui',
              up: true,
            },
            {
              name: 'ylj api',
              endpoint: 'http://localhost:8000/api/chat',
              status: 'running',
              desc: 'rag chat endpoint',
              up: true,
            },
            {
              name: 'ollama',
              endpoint: 'http://localhost:11434',
              status: 'running',
              desc: 'inference backend',
              up: true,
            },
          ].map((s) => (
            <Row key={s.name} accent={s.up ? 'var(--accent)' : 'var(--border-hi)'} style={{ padding: 0 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: s.up ? 'var(--accent)' : 'var(--text-faintest)',
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.desc}</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{s.endpoint}</span>
              <Chip tone={s.up ? 'ok' : 'default'}>{s.status}</Chip>
              {s.up && <Icon name="external" size={12} style={{ color: 'var(--text-dim)' }} />}
            </Row>
          ))}
        </div>

        <div style={{
          background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
          padding: 18, marginBottom: 28, display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <Icon name="sparkle" size={18} style={{ color: 'var(--accent-hi)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>chat is ready at <span style={{ color: 'var(--accent-hi)' }}>localhost:8000/chat</span></div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>first message might take ~5s while ollama warms the model.</div>
          </div>
          <PrimaryButton iconRight="external" onClick={() => window.open('/chat', '_blank')}>open chat</PrimaryButton>
        </div>

        <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 12 }}>next steps</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border)', border: '1px solid var(--border)' }}>
          {[
            { n: '01', t: 'chat in the browser', b: 'open localhost:8000/chat anytime. nothing leaves the machine — embeddings, retrieval, and inference are all local.' },
            { n: '02', t: 'add more folders', b: 'run `ylj-ingest --dir ~/NewFolder` anytime. the index updates incrementally; no full rebuild.' },
            { n: '03', t: 'restart the server', b: 'run `python start.py` to bring everything back up. settings persist across restarts.' },
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
        <KV label="llm" value={llmLabel} />
        <KV label="embedding" value={embLabel} />
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
          <div style={{ color: 'var(--text-dimmer)' }}># start the server</div>
          <div style={{ color: 'var(--text)' }}><span style={{ color: 'var(--accent-hi)' }}>$</span> python start.py</div>
          <div style={{ height: 8 }} />
          <div style={{ color: 'var(--text-dimmer)' }}># ingest a folder</div>
          <div style={{ color: 'var(--text)' }}><span style={{ color: 'var(--accent-hi)' }}>$</span> ylj-ingest --dir ~/Projects</div>
          <div style={{ height: 8 }} />
          <div style={{ color: 'var(--text-dimmer)' }}># open chat</div>
          <div style={{ color: 'var(--text)' }}><span style={{ color: 'var(--accent-hi)' }}>$</span> open http://localhost:8000/chat</div>
        </div>
      </div>
    </div>
  );
}
window.ScreenHandoff = ScreenHandoff;
