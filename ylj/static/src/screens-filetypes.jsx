function ScreenFileTypes({ onNext, onBack, fileTypes, setFileTypes }) {
  const total = fileTypes.filter(t => t.on).reduce((a, b) => a + b.count, 0);
  const totalAll = fileTypes.reduce((a, b) => a + b.count, 0);
  const toggle = (id) => setFileTypes(ts => ts.map(t => t.id === id ? { ...t, on: !t.on } : t));
  const selectedIds = fileTypes.filter(t => t.on).map(t => t.id);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '32px 40px 16px' }}>
          <SectionHeader
            num="04"
            label="which files should be ingested?"
            desc="each extension is parsed by a different loader. enabling code or html can be expensive — parsers strip formatting but chunking runs per-file."
            actions={<Chip tone="accent">{total.toLocaleString()} / {totalAll.toLocaleString()} files</Chip>}
          />
        </div>

        <div style={{ flex: 1, overflow: 'auto', borderTop: '1px solid var(--border)' }}>
          <ColHeader>
            <span style={{ width: 16 }} />
            <span style={{ flex: 1 }}>type</span>
            <span style={{ width: 220 }}>extensions</span>
            <span style={{ width: 100 }}>size relative</span>
            <span style={{ width: 80, textAlign: 'right' }}>files</span>
          </ColHeader>
          {fileTypes.map(t => {
            const pct = (t.count / totalAll) * 100;
            return (
              <Row key={t.id} selected={t.on} accent={t.on ? 'var(--accent)' : 'var(--border-hi)'} onClick={() => toggle(t.id)}>
                <Check checked={t.on} onChange={() => toggle(t.id)} />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="file" size={12} style={{ color: t.on ? 'var(--accent-hi)' : 'var(--text-dimmer)' }} />
                  <span style={{ fontSize: 12, fontWeight: t.on ? 500 : 400, color: 'var(--text)' }}>{t.label}</span>
                </div>
                <span style={{ width: 220, fontSize: 11, color: 'var(--text-dim)' }}>{t.ext}</span>
                <div style={{ width: 100 }}>
                  <div style={{ height: 6, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: t.on ? 'var(--accent)' : 'var(--border-hi)' }} />
                  </div>
                </div>
                <span style={{ width: 80, textAlign: 'right', fontSize: 11, color: 'var(--text-dim)', fontWeight: 500 }}>
                  {t.count.toLocaleString()}
                </span>
              </Row>
            );
          })}
        </div>

        <StepNav onBack={onBack} onNext={onNext} nextLabel="choose models" nextDisabled={selectedIds.length === 0} />
      </div>

      <div style={{ width: 340, borderLeft: '1px solid var(--border)', background: 'var(--bg-alt)', padding: '28px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 10 }}>composition</div>
          <div style={{ display: 'flex', height: 24, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {fileTypes.filter(t => t.on).map((t, i) => (
              <div key={t.id} title={`${t.label} — ${t.count}`}
                style={{
                  flex: t.count,
                  background: ['var(--accent)', '#11a851', '#0d8441', '#5fdc93', '#2fc773', '#86e7ad'][i % 6],
                  borderRight: i < fileTypes.filter(x=>x.on).length - 1 ? '1px solid var(--bg)' : 'none',
                }} />
            ))}
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {fileTypes.filter(t => t.on).map((t, i) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span style={{ width: 9, height: 9, background: ['var(--accent)', '#11a851', '#0d8441', '#5fdc93', '#2fc773', '#86e7ad'][i % 6] }} />
                <span style={{ flex: 1, color: 'var(--text)' }}>{t.label}</span>
                <span style={{ color: 'var(--text-dim)' }}>{t.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 10 }}>ingest budget</div>
          <KV label="total files" value={total.toLocaleString()} />
          <KV label="est. chunks" value={(total * 4.2).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
          <KV label="est. time" value={<span>{Math.round(total/80)} min</span>} />
          <KV label="est. index size" value={`${(total * 0.004).toFixed(2)} GB`} />
        </div>

        <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Icon name="shield" size={13} style={{ color: 'var(--accent-hi)', marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.55, marginBottom: 4 }}>
                files bigger than 10 MB are skipped by default.
              </div>
              <button style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                advanced →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
window.ScreenFileTypes = ScreenFileTypes;
