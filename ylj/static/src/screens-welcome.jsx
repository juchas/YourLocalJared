function ScreenWelcome({ onNext, density }) {
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, padding: '48px 56px', overflow: 'auto' }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>
            step 01 · welcome
          </div>
          <h1 style={{
            fontFamily: 'var(--mono)', fontSize: 34, fontWeight: 700,
            letterSpacing: '-0.015em', color: 'var(--text)',
            lineHeight: 1.15, marginBottom: 18,
          }}>
            a local brain<br />
            for <span style={{ color: 'var(--accent-hi)' }}>your</span> documents.
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 28, maxWidth: 580 }}>
            yourlocaljared ingests files you choose, runs a local LLM + embedding model,
            and serves an OpenAI-compatible endpoint so you can chat with your stuff.
            no cloud, no telemetry, no api keys.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1, background: 'var(--border)',
            border: '1px solid var(--border)',
            marginBottom: 32,
          }}>
            {[
              { num: '01', label: 'private', body: 'files never leave this machine. embeddings + index live on your disk.' },
              { num: '02', label: 'open', body: 'built on ollama. point any openai-compatible client at localhost:8080.' },
              { num: '03', label: 'fast', body: 'm-series or cuda. metadata-aware retrieval. streaming responses.' },
            ].map(c => (
              <div key={c.num} style={{ background: 'var(--bg)', padding: 18 }}>
                <div style={{ fontSize: 10, color: 'var(--accent-hi)', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 10 }}>
                  {c.num} · {c.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55 }}>
                  {c.body}
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            setup path — ~6 min active
          </div>
          <div style={{ border: '1px solid var(--border)', marginBottom: 32 }}>
            {[
              ['02', 'probe hardware',   'detect ram, gpu, disk'],
              ['03', 'pick folders',     'pick what to index'],
              ['04', 'file types',       'md, pdf, code…'],
              ['05', 'choose models',    'llm + embeddings'],
              ['06', 'download',         'pulls from ollama'],
              ['07', 'build index',      'parse → embed → store'],
              ['08', 'sanity check',     'run a test query'],
              ['09', 'launch',           'open webui handoff'],
            ].map(([n, l, d]) => (
              <Row key={n}>
                <span style={{ fontSize: 10, color: 'var(--text-dimmer)', width: 28, letterSpacing: '0.08em' }}>{n}</span>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{l}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>{d}</span>
              </Row>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <PrimaryButton onClick={onNext} iconRight="arrow-r" style={{ minWidth: 220 }}>begin setup</PrimaryButton>
            <GhostButton>read the docs</GhostButton>
          </div>
        </div>
      </div>

      <div style={{
        width: 360, borderLeft: '1px solid var(--border)',
        background: 'var(--bg-alt)', padding: '32px 28px',
        display: 'flex', flexDirection: 'column', gap: 22,
      }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
            what you'll end up with
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.9, color: 'var(--text)' }}>
            <div>→ <span style={{ color: 'var(--accent-hi)' }}>api</span> localhost:8080/v1</div>
            <div>→ <span style={{ color: 'var(--accent-hi)' }}>ui</span>  localhost:3000 (open webui)</div>
            <div>→ <span style={{ color: 'var(--accent-hi)' }}>cli</span> jared "what did i write about…"</div>
          </div>
        </div>

        <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 22 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
            privacy guarantees
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              'no outbound calls during inference',
              'downloads only on this step (ollama registry)',
              'index stored at ~/.ylj/index',
              'disable any time: systemctl stop ylj',
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11, color: 'var(--text)' }}>
                <Icon name="check" size={11} stroke={2.5} style={{ color: 'var(--accent-hi)', marginTop: 2, flexShrink: 0 }} />
                <span style={{ lineHeight: 1.5 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 22 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
            system check
          </div>
          <KV label="os" value="darwin 23.5" />
          <KV label="python" value="3.11.9" />
          <KV label="ollama" value={<span style={{ color: 'var(--accent-hi)' }}>0.3.12 ✓</span>} />
          <KV label="disk free" value="486 GB" />
        </div>
      </div>
    </div>
  );
}
window.ScreenWelcome = ScreenWelcome;
