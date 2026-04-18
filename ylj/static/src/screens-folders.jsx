function ScreenFolders({ onNext, onBack, folders, setFolders, ignores, setIgnores }) {
  const [selectedId, setSelectedId] = useState(folders.find(f => f.selected)?.id || folders[0].id);
  const [addValue, setAddValue] = useState('');

  const total = folders.filter(f => f.selected);
  const totalFiles = total.reduce((a, b) => a + b.files, 0);
  const totalSize = total.reduce((a, b) => a + b.sizeGB, 0);
  const selected = folders.find(f => f.id === selectedId);

  const toggle = (id) => {
    setFolders(fs => fs.map(f => f.id === id ? { ...f, selected: !f.selected } : f));
  };
  const remove = (id) => {
    setFolders(fs => fs.filter(f => f.id !== id));
  };
  const add = () => {
    if (!addValue.trim()) return;
    const id = 'x' + Date.now();
    setFolders(fs => [...fs, { id, path: addValue.trim(), files: Math.floor(Math.random()*500+50), sizeGB: +(Math.random()*2).toFixed(1), selected: true, warn: null }]);
    setAddValue('');
    setSelectedId(id);
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '32px 40px 16px' }}>
          <SectionHeader
            num="03"
            label="what should jared read?"
            desc="pick folders to index. everything inside is scanned recursively; gitignore-style patterns below exclude noise like node_modules."
            actions={<Chip tone="accent">{total.length} folder{total.length !== 1 ? 's' : ''} · {totalFiles.toLocaleString()} files · {totalSize.toFixed(1)} GB</Chip>}
          />
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0, borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
            <ColHeader>
              <span style={{ width: 16 }} />
              <span style={{ flex: 1 }}>path</span>
              <span style={{ width: 70, textAlign: 'right' }}>files</span>
              <span style={{ width: 60, textAlign: 'right' }}>size</span>
              <span style={{ width: 110 }}>notes</span>
            </ColHeader>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {folders.map(f => (
                <Row key={f.id} selected={selectedId === f.id && f.selected}
                  accent={f.selected ? 'var(--accent)' : 'var(--border-hi)'}
                  onClick={() => setSelectedId(f.id)}>
                  <Check checked={f.selected} onChange={() => toggle(f.id)} />
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Icon name="folder" size={12} style={{ color: f.selected ? 'var(--accent-hi)' : 'var(--text-dimmer)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: f.selected ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.path}
                    </span>
                  </div>
                  <span style={{ width: 70, textAlign: 'right', fontSize: 11, color: 'var(--text-dim)' }}>{f.files.toLocaleString()}</span>
                  <span style={{ width: 60, textAlign: 'right', fontSize: 11, color: 'var(--text-dim)' }}>{f.sizeGB.toFixed(1)} GB</span>
                  <span style={{ width: 110 }}>
                    {f.warn ? <Chip tone="warn">{f.warn}</Chip> : f.selected ? <Chip tone="ok">on</Chip> : null}
                  </span>
                </Row>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--border)', padding: 12, display: 'flex', gap: 8, background: 'var(--bg-alt)' }}>
              <input type="text" placeholder="add path — ~/Folder/Name"
                value={addValue}
                onChange={e => setAddValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && add()}
                style={{
                  flex: 1, background: 'var(--bg)', border: '1px solid var(--border)',
                  padding: '8px 10px', fontSize: 11, fontFamily: 'var(--mono)', borderRadius: 2,
                }}
              />
              <GhostButton iconLeft="plus" onClick={add}>add</GhostButton>
            </div>
          </div>

          <div style={{ width: 320, background: 'var(--bg-alt)', display: 'flex', flexDirection: 'column' }}>
            {selected && <>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="folder" size={12} style={{ color: selected.selected ? 'var(--accent-hi)' : 'var(--text-dimmer)' }} />
                <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>preview</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => remove(selected.id)} style={{ color: 'var(--text-dimmer)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  remove
                </button>
              </div>
              <div style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{selected.path}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {selected.selected ? 'included' : 'excluded'} · scanned recursively
                </div>
              </div>
              <div style={{ padding: '0 18px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', margin: '0 18px 16px' }}>
                {[['files', selected.files.toLocaleString()], ['size', selected.sizeGB.toFixed(1)+' GB']].map(([l,v])=>(
                  <div key={l} style={{ background: 'var(--bg)', padding: 12 }}>
                    <div style={{ fontSize: 9, color: 'var(--text-dimmer)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{l}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '0 18px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>sample tree</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.7, color: 'var(--text-dim)' }}>
                  {['├─ readme.md',
                    '├─ notes/',
                    '│  ├─ 2024-q1.md',
                    '│  ├─ meetings/…',
                    '│  └─ ideas.md',
                    '├─ research/',
                    '│  ├─ rag-papers.pdf',
                    '│  └─ transformers.pdf',
                    '└─ journal/'].map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </div>
            </>}

            <div style={{ flex: 1 }} />

            <div style={{ borderTop: '1px solid var(--border)', padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Icon name="x" size={11} style={{ color: 'var(--text-dimmer)' }} />
                <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>ignore patterns</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {ignores.map(ig => (
                  <span key={ig} style={{
                    fontFamily: 'var(--mono)', fontSize: 10,
                    padding: '3px 7px', background: 'var(--bg)',
                    border: '1px solid var(--border)', color: 'var(--text-dim)',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}>
                    {ig}
                    <button onClick={() => setIgnores(is => is.filter(x => x !== ig))}
                      style={{ color: 'var(--text-faintest)', display: 'flex' }}>
                      <Icon name="x" size={8} stroke={2.5} />
                    </button>
                  </span>
                ))}
                <button style={{
                  fontFamily: 'var(--mono)', fontSize: 10,
                  padding: '3px 7px', border: '1px dashed var(--border)',
                  color: 'var(--text-dimmer)', display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <Icon name="plus" size={8} stroke={2.5} /> add
                </button>
              </div>
            </div>
          </div>
        </div>

        <StepNav onBack={onBack} onNext={onNext} nextLabel="file types" nextDisabled={total.length === 0} />
      </div>
    </div>
  );
}
window.ScreenFolders = ScreenFolders;
