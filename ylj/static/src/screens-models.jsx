function ScreenModels({ onNext, onBack, llmId, setLlmId, embId, setEmbId }) {
  const [tab, setTab] = useState('llm');
  const llm = LLMS.find(m => m.id === llmId);
  const emb = EMBEDDERS.find(m => m.id === embId);
  const totalGB = (llm?.sizeGB || 0) + (emb?.sizeGB || 0);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '32px 40px 0' }}>
          <SectionHeader
            num="05"
            label="pick the models"
            desc="you need one LLM for chat and one embedding model for retrieval. we preselect based on your hardware tier. gated models require a huggingface login."
          />
        </div>

        <div style={{ padding: '0 40px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 0 }}>
          {[
            { id: 'llm', label: 'llm · chat model', hint: llm?.name + ' ' + llm?.size },
            { id: 'emb', label: 'embedding model',  hint: emb?.name },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', marginRight: 28,
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
              color: tab === t.id ? 'var(--text)' : 'var(--text-dim)',
            }}>
              <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: tab === t.id ? 600 : 400 }}>
                {t.label}
              </span>
              <span style={{ fontSize: 10, color: tab === t.id ? 'var(--accent-hi)' : 'var(--text-dimmer)' }}>
                · {t.hint}
              </span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {tab === 'llm' && (
            <>
              <ColHeader>
                <span style={{ width: 18 }} />
                <span style={{ flex: 1 }}>model</span>
                <span style={{ width: 60 }}>size</span>
                <span style={{ width: 72, textAlign: 'right' }}>disk</span>
                <span style={{ width: 72, textAlign: 'right' }}>ram req</span>
                <span style={{ width: 110 }}>notes</span>
              </ColHeader>
              {LLMS.map(m => {
                const canRun = HARDWARE.ramGB >= m.ram;
                const isSel = llmId === m.id;
                return (
                  <Row key={m.id} selected={isSel} accent={isSel ? 'var(--accent)' : canRun ? 'var(--border-hi)' : 'var(--border)'}
                    onClick={() => canRun && setLlmId(m.id)}
                    style={{ opacity: canRun ? 1 : 0.5 }}>
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%',
                      border: `2px solid ${isSel ? 'var(--accent)' : 'var(--border-hi)'}`,
                      background: isSel ? 'var(--accent)' : 'transparent',
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {m.name}
                        {m.gated && <Icon name="lock" size={10} style={{ color: 'var(--warn)' }} />}
                        {m.rec && <Chip tone="accent">recommended</Chip>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.02em' }}>{m.desc}</div>
                    </div>
                    <span style={{ width: 60, fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>{m.size}</span>
                    <span style={{ width: 72, textAlign: 'right', fontSize: 11, color: 'var(--text-dim)' }}>{m.sizeGB} GB</span>
                    <span style={{ width: 72, textAlign: 'right', fontSize: 11, color: canRun ? 'var(--text-dim)' : 'var(--warn)' }}>
                      {m.ram} GB
                    </span>
                    <span style={{ width: 110 }}>
                      {!canRun ? <Chip tone="warn">needs {m.ram}GB</Chip>
                       : m.gated ? <Chip tone="warn">hf login</Chip>
                       : <Chip tone="ok">ready</Chip>}
                    </span>
                  </Row>
                );
              })}
            </>
          )}

          {tab === 'emb' && (
            <>
              <ColHeader>
                <span style={{ width: 18 }} />
                <span style={{ flex: 1 }}>model</span>
                <span style={{ width: 80 }}>dimensions</span>
                <span style={{ width: 72, textAlign: 'right' }}>disk</span>
                <span style={{ width: 110 }}>notes</span>
              </ColHeader>
              {EMBEDDERS.map(m => {
                const isSel = embId === m.id;
                return (
                  <Row key={m.id} selected={isSel} accent={isSel ? 'var(--accent)' : 'var(--border-hi)'} onClick={() => setEmbId(m.id)}>
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%',
                      border: `2px solid ${isSel ? 'var(--accent)' : 'var(--border-hi)'}`,
                      background: isSel ? 'var(--accent)' : 'transparent',
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {m.name}
                        {m.rec && <Chip tone="accent">recommended</Chip>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dimmer)' }}>{m.desc}</div>
                    </div>
                    <span style={{ width: 80, fontSize: 11, color: 'var(--text)' }}>{m.dims}-d</span>
                    <span style={{ width: 72, textAlign: 'right', fontSize: 11, color: 'var(--text-dim)' }}>{m.sizeGB} GB</span>
                    <span style={{ width: 110 }}><Chip tone="ok">ready</Chip></span>
                  </Row>
                );
              })}
            </>
          )}
        </div>

        <StepNav onBack={onBack} onNext={onNext} nextLabel={`download · ${totalGB.toFixed(1)} GB`} nextIcon="download" nextDisabled={!llm || !emb} />
      </div>

      <div style={{ width: 340, borderLeft: '1px solid var(--border)', background: 'var(--bg-alt)', padding: '28px 22px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 10 }}>your stack</div>
          <Panel>
            <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>llm · chat</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {llm?.name} <span style={{ color: 'var(--accent-hi)' }}>{llm?.size}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{llm?.desc}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <Chip>{llm?.sizeGB} GB</Chip>
              <Chip>{llm?.ram} GB ram</Chip>
              {llm?.gated && <Chip tone="warn">gated</Chip>}
            </div>
          </Panel>
          <div style={{ height: 6 }} />
          <Panel>
            <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>embedding</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{emb?.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{emb?.desc}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <Chip>{emb?.dims}-dim</Chip>
              <Chip>{emb?.sizeGB} GB</Chip>
            </div>
          </Panel>
        </div>

        <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 10 }}>disk math</div>
          <KV label="download" value={`${totalGB.toFixed(2)} GB`} />
          <KV label="available" value={`${HARDWARE.diskFreeGB} GB`} />
          <KV label="index (est)" value="1.2 GB" />
          <KV label="after install" value={<span style={{ color: 'var(--accent-hi)' }}>{(HARDWARE.diskFreeGB - totalGB - 1.2).toFixed(0)} GB free</span>} />
        </div>
      </div>
    </div>
  );
}
window.ScreenModels = ScreenModels;
