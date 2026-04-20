// Right-side sources drawer
function SourcesPanel({ sources, onClose, focusIdx }) {
  const [sel, setSel] = useState(focusIdx || 0);
  useEffect(() => { setSel(focusIdx || 0); }, [focusIdx, sources]);

  if (!sources || sources.length === 0) {
    return (
      <div style={{ width: 340, borderLeft: '1px solid var(--border)', background: 'var(--bg-alt)', display: 'flex', flexDirection: 'column' }}>
        <Header onClose={onClose} count={0} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontSize: 11, color: 'var(--text-dimmer)', textAlign: 'center', lineHeight: 1.6 }}>
          no message selected.<br/>click a message to see the chunks that fed it.
        </div>
      </div>
    );
  }

  const s = sources[sel];
  const context = buildContext(s);

  return (
    <div style={{ width: 340, borderLeft: '1px solid var(--border)', background: 'var(--bg-alt)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <Header onClose={onClose} count={sources.length} />

      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '45%', borderBottom: '1px solid var(--border)' }}>
        <ColHeader>
          <span style={{ width: 22 }}>#</span>
          <span style={{ flex: 1 }}>source</span>
          <span style={{ width: 50, textAlign: 'right' }}>score</span>
        </ColHeader>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {sources.map((src, i) => (
            <Row key={src.id} selected={sel === i} accent={sel === i ? 'var(--accent)' : 'var(--border-hi)'} onClick={() => setSel(i)}>
              <span style={{ fontSize: 10, color: 'var(--text-dimmer)', width: 22, fontVariantNumeric: 'tabular-nums' }}>
                {String(i+1).padStart(2, '0')}
              </span>
              <Icon name="file" size={11} style={{ color: sel === i ? 'var(--accent-hi)' : 'var(--text-dimmer)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: sel === i ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {src.file.split('/').pop()}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dimmer)' }}>{src.line}</div>
              </div>
              <span style={{ width: 50, textAlign: 'right', fontSize: 10, color: 'var(--accent-hi)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {src.score.toFixed(2)}
              </span>
            </Row>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 6 }}>full path</div>
        <button
          onClick={() => window.revealInFolder && window.revealInFolder(s.file)}
          title={window.revealTooltip ? window.revealTooltip() : 'show in folder'}
          style={{
            display: 'block', width: '100%', textAlign: 'left', padding: 0,
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 11.5, color: 'var(--text)', fontWeight: 500,
            wordBreak: 'break-all', marginBottom: 12, lineHeight: 1.5,
            textDecoration: 'underline', textDecorationColor: 'transparent',
            transition: 'text-decoration-color 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.textDecorationColor = 'var(--accent-hi)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecorationColor = 'transparent'; }}
        >
          {s.file}
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--border)', border: '1px solid var(--border)' }}>
          {[['line', s.line], ['score', s.score.toFixed(2)], ['chunk', `#${sel+1}`]].map(([l,v])=>(
            <div key={l} style={{ background: 'var(--bg)', padding: '8px 10px' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dimmer)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{l}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 10 }}>content · chunk preview</div>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.8,
          background: 'var(--bg)', border: '1px solid var(--border)',
          padding: 14, color: 'var(--text-dim)', whiteSpace: 'pre-wrap',
        }}>
          <span style={{ color: 'var(--text-faintest)' }}>{context.before}</span>
          <mark style={{ background: 'var(--accent-dim)', color: 'var(--text)', padding: '1px 2px', fontWeight: 500 }}>
            {s.snippet}
          </mark>
          <span style={{ color: 'var(--text-faintest)' }}>{context.after}</span>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px', display: 'flex', gap: 6 }}>
        <GhostButton
          iconLeft="folder"
          style={{ flex: 1 }}
          onClick={() => window.revealInFolder && window.revealInFolder(s.file)}
        >
          show in folder
        </GhostButton>
        <GhostButton iconLeft="book" style={{ flex: 1 }}>cite</GhostButton>
      </div>
    </div>
  );
}

function Header({ onClose, count }) {
  return (
    <div style={{ height: 44, borderBottom: '1px solid var(--border)', padding: '0 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      <Icon name="book" size={13} style={{ color: 'var(--text-dim)' }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>sources</span>
      {count > 0 && <Chip tone="accent">{count}</Chip>}
      <div style={{ flex: 1 }} />
      <button onClick={onClose} style={{ padding: 4, color: 'var(--text-dim)' }}><Icon name="x" size={13} /></button>
    </div>
  );
}

function buildContext(s) {
  const before = '…lorem chunk ipsum dolor sit amet. consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
  const after  = ' ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat…';
  return { before, after };
}

window.SourcesPanel = SourcesPanel;
