// Sidebar — conversation list + sources + stats
const { useState: useState2, useEffect: useEffect2, useRef: useRef2 } = React;

function fmtTime(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return 'now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h';
  return Math.floor(d / 86400000) + 'd';
}

function Sidebar({ conversations, activeId, onSelect, onNew, collapsed, onToggle }) {
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('chats'); // chats | sources | stats

  const filtered = conversations.filter(c =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    (c.preview || '').toLowerCase().includes(query.toLowerCase())
  );
  const pinned = filtered.filter(c => c.pinned);
  const recent = filtered.filter(c => !c.pinned);

  if (collapsed) {
    return (
      <div style={{ width: 44, background: 'var(--bg-alt)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', gap: 10 }}>
        <Logo size={22} />
        <button onClick={onToggle} style={{ padding: 8, color: 'var(--text-dim)' }}><Icon name="chev-r" size={14} /></button>
        <button onClick={onNew} style={{ padding: 8, color: 'var(--accent-hi)', border: '1px solid var(--accent-border)', background: 'var(--accent-dim)' }}>
          <Icon name="plus" size={12} stroke={2.5} />
        </button>
        <div style={{ flex: 1 }} />
        <button style={{ padding: 8, color: 'var(--text-dim)' }}><Icon name="cog" size={13} /></button>
      </div>
    );
  }

  return (
    <div style={{ width: 280, background: 'var(--bg-alt)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ height: 44, padding: '0 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Logo size={20} />
        <Wordmark />
        <BetaPill />
        <div style={{ flex: 1 }} />
        <button onClick={onToggle} style={{ padding: 4, color: 'var(--text-dim)' }}><Icon name="chev-d" size={12} style={{ transform: 'rotate(90deg)' }} /></button>
      </div>

      <div style={{ padding: '12px 12px 8px' }}>
        <button onClick={onNew} style={{
          width: '100%', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--accent)', color: '#000',
          fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          borderRadius: 2,
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-hi)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
        >
          <Icon name="plus" size={11} stroke={2.5} />
          new chat
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, background: '#00000015', padding: '1px 5px', borderRadius: 2, letterSpacing: '0.04em' }}>⌘ k</span>
        </button>
      </div>

      <div style={{ padding: '4px 12px 12px', position: 'relative' }}>
        <Icon name="search" size={11} style={{ position: 'absolute', left: 22, top: 12, color: 'var(--text-dimmer)' }} />
        <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="search chats + sources"
          style={{
            width: '100%', padding: '7px 10px 7px 28px',
            background: 'var(--bg)', border: '1px solid var(--border)',
            fontSize: 11, fontFamily: 'var(--mono)', borderRadius: 2, color: 'var(--text)',
          }}
        />
      </div>

      <div style={{ display: 'flex', padding: '0 12px', gap: 1, borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'chats',   label: 'chats',   count: conversations.length },
          { id: 'sources', label: 'sources', count: 3 },
          { id: 'stats',   label: 'stats' },
        ].map(t => (
          <button key={t.id} onClick={() => setSection(t.id)} style={{
            flex: 1, padding: '8px 0',
            fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: section === t.id ? 'var(--text)' : 'var(--text-dim)',
            fontWeight: section === t.id ? 600 : 400,
            borderBottom: section === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t.label}{t.count !== undefined && <span style={{ color: 'var(--text-dimmer)', marginLeft: 4 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {section === 'chats' && (
          <>
            {pinned.length > 0 && (
              <>
                <div style={{ padding: '10px 14px 4px', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>pinned</div>
                {pinned.map(c => <ChatItem key={c.id} c={c} active={c.id === activeId} onSelect={onSelect} />)}
              </>
            )}
            {recent.length > 0 && (
              <>
                <div style={{ padding: '14px 14px 4px', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>recent</div>
                {recent.map(c => <ChatItem key={c.id} c={c} active={c.id === activeId} onSelect={onSelect} />)}
              </>
            )}
          </>
        )}
        {section === 'sources' && (
          <div style={{ padding: 4 }}>
            {SCOPES.map(s => (
              <Row key={s.id} accent={s.off ? 'var(--border-hi)' : 'var(--accent)'} style={{ opacity: s.off ? 0.6 : 1 }}>
                <Icon name="folder" size={11} style={{ color: s.off ? 'var(--text-dimmer)' : 'var(--accent-hi)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dimmer)' }}>
                    {s.off ? 'not indexed' : `${s.count.toLocaleString()} files`}
                  </div>
                </div>
              </Row>
            ))}
            <div style={{ padding: '12px 14px' }}>
              <button style={{
                width: '100%', padding: '8px 10px',
                border: '1px dashed var(--border)', color: 'var(--text-dim)',
                fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <Icon name="plus" size={10} stroke={2.5} /> add folder
              </button>
            </div>
          </div>
        )}
        {section === 'stats' && (
          <div style={{ padding: '12px 14px' }}>
            <KV label="documents" value="4,132" />
            <KV label="chunks" value="17,284" />
            <KV label="embeddings" value="768-dim" />
            <KV label="index size" value="1.2 GB" />
            <KV label="last scan" value="2m ago" />
            <div style={{ height: 18 }} />
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 10 }}>runtime</div>
            <KV label="llm" value="qwen 2.5 · 7b" />
            <KV label="cpu" value="18% · m3 pro" />
            <KV label="ram" value="8.4 / 36 GB" />
            <KV label="latency p50" value="82 ms" />
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 2s ease-in-out infinite' }} />
        <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>api :8080 · idle</span>
        <div style={{ flex: 1 }} />
        <button style={{ color: 'var(--text-dim)' }}><Icon name="cog" size={11} /></button>
      </div>
    </div>
  );
}

function ChatItem({ c, active, onSelect }) {
  return (
    <Row selected={active} accent={active ? 'var(--accent)' : 'var(--border-hi)'} onClick={() => onSelect(c.id)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {c.pinned && <Icon name="dot" size={8} style={{ color: 'var(--accent-hi)' }} />}
          <span style={{ fontSize: 11.5, color: 'var(--text)', fontWeight: active ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.title}
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-dimmer)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
          {c.preview}
        </div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-dimmer)', flexShrink: 0 }}>{fmtTime(c.updated)}</span>
    </Row>
  );
}

window.Sidebar = Sidebar;
window.fmtTime = fmtTime;
