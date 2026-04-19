// Composer — textarea + model picker + scope + send
function Composer({ onSend, streaming, onStop, modelId, setModelId, scopeId, setScopeId, k, setK }) {
  const [value, setValue] = useState('');
  const [popover, setPopover] = useState(null); // 'model' | 'scope' | 'retrieval' | null
  const taRef = useRef(null);

  useEffect(() => {
    if (!taRef.current) return;
    const ta = taRef.current;
    ta.style.height = 'auto';
    ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
  }, [value]);

  const send = () => {
    if (!value.trim() || streaming) return;
    onSend(value.trim());
    setValue('');
  };

  const model = MODELS.find(m => m.id === modelId) || { name: modelId || 'model', size: '' };
  const scope = SCOPES.find(s => s.id === scopeId) || { label: scopeId || 'all' };

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)', padding: '14px 48px 16px', position: 'relative' }}>
      {popover && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }} onClick={() => setPopover(null)} />
      )}

      <div style={{ position: 'relative', zIndex: 1, border: '1px solid var(--border-hi)', background: 'var(--bg)', borderRadius: 2 }}>
        <div style={{ padding: '10px 12px 0' }}>
          <textarea ref={taRef} value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="ask jared — enter to send, shift+enter for newline"
            rows={1}
            style={{
              width: '100%', border: 'none', outline: 'none',
              fontSize: 13, fontFamily: 'var(--mono)', lineHeight: 1.55,
              color: 'var(--text)', background: 'transparent',
              minHeight: 22, maxHeight: 160,
            }}
          />
        </div>
        <div style={{ padding: '6px 8px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <PickerButton
            label={`${model.name} ${model.size}`}
            icon="sparkle"
            active={popover === 'model'}
            onClick={() => setPopover(p => p === 'model' ? null : 'model')}
          />
          {popover === 'model' && (
            <Popover onClose={() => setPopover(null)}>
              <div style={{ padding: '8px 12px 4px', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>chat model</div>
              {MODELS.map(m => (
                <Row key={m.id} selected={m.id === modelId} accent={m.id === modelId ? 'var(--accent)' : 'var(--border-hi)'}
                  onClick={() => { setModelId(m.id); setPopover(null); }}>
                  <Icon name="sparkle" size={11} style={{ color: m.id === modelId ? 'var(--accent-hi)' : 'var(--text-dim)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {m.name} <span style={{ color: 'var(--accent-hi)' }}>{m.size}</span>
                      {m.rec && <Chip tone="accent">rec</Chip>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dimmer)' }}>{m.speed}</div>
                  </div>
                </Row>
              ))}
            </Popover>
          )}

          <PickerButton
            label={scope.label}
            icon="folder"
            active={popover === 'scope'}
            onClick={() => setPopover(p => p === 'scope' ? null : 'scope')}
          />
          {popover === 'scope' && (
            <Popover onClose={() => setPopover(null)} left={120}>
              <div style={{ padding: '8px 12px 4px', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>retrieval scope</div>
              {SCOPES.map(s => (
                <Row key={s.id} selected={s.id === scopeId} accent={s.id === scopeId ? 'var(--accent)' : 'var(--border-hi)'}
                  onClick={() => { if (!s.off) { setScopeId(s.id); setPopover(null); } }}
                  style={{ opacity: s.off ? 0.5 : 1 }}>
                  <Icon name="folder" size={11} style={{ color: s.off ? 'var(--text-dimmer)' : 'var(--accent-hi)' }} />
                  <div style={{ flex: 1, fontSize: 11, color: 'var(--text)' }}>{s.label}</div>
                  <span style={{ fontSize: 10, color: 'var(--text-dimmer)' }}>{s.off ? 'off' : `${s.count.toLocaleString()}`}</span>
                </Row>
              ))}
            </Popover>
          )}

          <PickerButton
            label={`k=${k}`}
            icon="search"
            active={popover === 'retrieval'}
            onClick={() => setPopover(p => p === 'retrieval' ? null : 'retrieval')}
          />
          {popover === 'retrieval' && (
            <Popover onClose={() => setPopover(null)} left={240} width={260}>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 10 }}>retrieval</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <span>chunks (k)</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{k}</span>
                </div>
                <input type="range" min={1} max={10} value={k} onChange={e => setK(+e.target.value)}
                  style={{ width: '100%', accentColor: 'var(--accent)' }} />
                <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginTop: 6, lineHeight: 1.5 }}>
                  more chunks = better recall, slower responses. default 3 is a good balance.
                </div>
              </div>
            </Popover>
          )}

          <button title="attach" style={{ padding: 6, color: 'var(--text-dim)', borderRadius: 2 }}>
            <Icon name="plus" size={13} />
          </button>

          <div style={{ flex: 1 }} />

          <span style={{ fontSize: 9.5, color: 'var(--text-dimmer)', letterSpacing: '0.06em', marginRight: 6 }}>
            {value.length > 0 ? `${value.length} chars` : 'enter to send'}
          </span>

          {streaming ? (
            <button onClick={onStop} style={{
              padding: '7px 14px', background: 'var(--warn)', color: '#fff',
              fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
              borderRadius: 2, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Icon name="x" size={11} stroke={2.5} /> stop
            </button>
          ) : (
            <button onClick={send} disabled={!value.trim()} style={{
              padding: '7px 14px',
              background: value.trim() ? 'var(--accent)' : 'var(--bg-hi)',
              color: value.trim() ? '#000' : 'var(--text-dimmer)',
              fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
              borderRadius: 2, display: 'flex', alignItems: 'center', gap: 6,
              cursor: value.trim() ? 'pointer' : 'not-allowed', transition: 'background 0.12s',
            }}
              onMouseEnter={e => value.trim() && (e.currentTarget.style.background = 'var(--accent-hi)')}
              onMouseLeave={e => value.trim() && (e.currentTarget.style.background = 'var(--accent)')}
            >
              send <Icon name="send" size={11} />
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, fontSize: 9.5, color: 'var(--text-dimmer)', letterSpacing: '0.06em', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />
          100% local
        </span>
        <span className="shortcut-hint">⌘k new</span>
        <span className="shortcut-hint">⌘/ palette</span>
        <span className="shortcut-hint">⌘. sources</span>
        <div style={{ flex: 1 }} />
        <span>v0.3.2</span>
      </div>
    </div>
  );
}

function PickerButton({ label, icon, onClick, active }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 10px',
      background: active ? 'var(--accent-dim)' : 'transparent',
      border: `1px solid ${active ? 'var(--accent-border)' : 'transparent'}`,
      color: active ? 'var(--accent-hi)' : 'var(--text-dim)',
      fontSize: 10.5, letterSpacing: '0.04em',
      display: 'flex', alignItems: 'center', gap: 6, borderRadius: 2,
      fontWeight: active ? 600 : 500,
      transition: 'all 0.1s',
    }}
      onMouseEnter={e => !active && (e.currentTarget.style.background = 'var(--bg-hi)')}
      onMouseLeave={e => !active && (e.currentTarget.style.background = 'transparent')}
    >
      <Icon name={icon} size={10} /> {label}
      <Icon name="chev-d" size={9} style={{ opacity: 0.6 }} />
    </button>
  );
}

function Popover({ children, onClose, left = 8, width = 260 }) {
  return (
    <div style={{
      position: 'absolute', bottom: 'calc(100% - 6px)', left,
      width, zIndex: 100,
      background: 'var(--bg)', border: '1px solid var(--border-hi)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
      borderRadius: 2, padding: '4px 0',
    }} onClick={e => e.stopPropagation()}>
      {children}
    </div>
  );
}

window.Composer = Composer;
