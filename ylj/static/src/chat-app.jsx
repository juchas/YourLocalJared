const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "green",
  "showSidebar": true,
  "showSources": true,
  "showShortcuts": true
}/*EDITMODE-END*/;

const ACCENTS = {
  green:  { hi: '#11a851', base: '#18c964', row: '#18c9641a', bd: '#18c96440', dim: '#18c96412' },
  violet: { hi: '#6d28d9', base: '#7c3aed', row: '#7c3aed1a', bd: '#7c3aed40', dim: '#7c3aed12' },
  cyan:   { hi: '#0891b2', base: '#06b6d4', row: '#06b6d41a', bd: '#06b6d440', dim: '#06b6d412' },
  amber:  { hi: '#c2410c', base: '#ea580c', row: '#ea580c1a', bd: '#ea580c40', dim: '#ea580c12' },
  rose:   { hi: '#be185d', base: '#e11d48', row: '#e11d481a', bd: '#e11d4840', dim: '#e11d4812' },
};

function TweaksPanel({ tweaks, setTweaks, onClose }) {
  const set = (k, v) => {
    setTweaks(t => ({ ...t, [k]: v }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
  };
  return (
    <div style={{
      position: 'fixed', bottom: 40, right: 20, width: 240, zIndex: 1000,
      background: 'var(--bg)', border: '1px solid var(--border-hi)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
    }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-alt)' }}>
        <Icon name="cog" size={11} />
        <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>tweaks</span>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ color: 'var(--text-dim)' }}><Icon name="x" size={11} /></button>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>accent</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {Object.keys(ACCENTS).map(a => (
              <button key={a} onClick={() => set('accent', a)} style={{
                width: 26, height: 26, background: ACCENTS[a].base,
                border: `2px solid ${tweaks.accent === a ? 'var(--text)' : 'transparent'}`,
              }} />
            ))}
          </div>
        </div>
        {[
          ['showSidebar', 'sidebar'],
          ['showSources', 'sources panel'],
          ['showShortcuts', 'shortcut hints'],
        ].map(([k, label]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check checked={tweaks[k]} onChange={v => set(k, v)} />
            <span style={{ fontSize: 11 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [conversations, setConversations] = useState(CONVERSATIONS);
  const [activeId, setActiveId] = useState(() => localStorage.getItem('ylj-chat') || 'c1');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 900);
  const [sourcesOpen, setSourcesOpen] = useState(() => window.innerWidth >= 1100);
  const [sourcesFor, setSourcesFor] = useState(null);
  const [sourcesFocus, setSourcesFocus] = useState(0);
  const [streaming, setStreaming] = useState(null);
  const [modelId, setModelId] = useState('qwen2.5:7b');
  const [scopeId, setScopeId] = useState('all');
  const [k, setK] = useState(3);
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  useEffect(() => { localStorage.setItem('ylj-chat', activeId); }, [activeId]);

  useEffect(() => {
    const a = ACCENTS[tweaks.accent] || ACCENTS.green;
    const r = document.documentElement.style;
    r.setProperty('--accent', a.base);
    r.setProperty('--accent-hi', a.hi);
    r.setProperty('--accent-row', a.row);
    r.setProperty('--accent-border', a.bd);
    r.setProperty('--accent-dim', a.dim);
  }, [tweaks.accent]);

  useEffect(() => {
    const handler = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  // Initialize sources panel with last answer's sources
  useEffect(() => {
    const c = conversations.find(x => x.id === activeId);
    if (!c) return;
    const last = [...c.messages].reverse().find(m => m.role === 'assistant' && m.sources);
    if (last) setSourcesFor(last.sources);
    else setSourcesFor(null);
  }, [activeId]);

  const conversation = conversations.find(c => c.id === activeId);

  const newChat = () => {
    const id = 'c' + Date.now();
    setConversations(cs => [{ id, title: 'new chat', preview: '', updated: Date.now(), messages: [] }, ...cs]);
    setActiveId(id);
  };

  const send = (text) => {
    const userMsg = { id: 'u' + Date.now(), role: 'user', text, ts: Date.now() };
    setConversations(cs => cs.map(c => c.id === activeId ? {
      ...c,
      title: c.messages.length === 0 ? text.slice(0, 40) : c.title,
      preview: text.slice(0, 60),
      updated: Date.now(),
      messages: [...c.messages, userMsg],
    } : c));

    // fake streaming
    setStreaming({ model: modelId, text: '', phase: 'retrieving' });

    setTimeout(() => {
      setStreaming(s => s && { ...s, phase: 'thinking' });
    }, 500);

    const reply = "okay, based on what i found in your index — " +
      "i pulled 3 chunks that mention this. the short answer is that your past notes " +
      "point toward **a consistent pattern**: you've been iterating on this for weeks " +
      "and the most recent decision is in `notes/ideas/recent.md`.\n\n" +
      "if you want me to pull the raw snippets, click any chunk in the sources panel →";

    const fakeSources = [
      { id: 'fs1', file: 'notes/ideas/recent.md',    line: '10-22', snippet: '…recent iteration points to this direction; locking it in for q2…', score: 0.89 },
      { id: 'fs2', file: 'journal/2024-q2.md',       line: '42-48', snippet: '…reflecting on the past two weeks, the pattern is consistent…', score: 0.82 },
      { id: 'fs3', file: 'meetings/latest.md',       line: '3-9',   snippet: '…team agreed, moving forward with the approach. ship by friday…', score: 0.76 },
    ];

    setTimeout(() => {
      setStreaming(s => s && { ...s, phase: 'streaming' });
      let i = 0;
      const iv = setInterval(() => {
        i = Math.min(reply.length, i + 4);
        setStreaming(s => s && { ...s, text: reply.slice(0, i) });
        if (i >= reply.length) {
          clearInterval(iv);
          const botMsg = {
            id: 'b' + Date.now(), role: 'assistant', text: reply, ts: Date.now(),
            model: modelId, sources: fakeSources,
            meta: { latency: 842, tokens: Math.floor(reply.length/4), tokensPerSec: 38 },
          };
          setConversations(cs => cs.map(c => c.id === activeId ? { ...c, messages: [...c.messages, botMsg] } : c));
          setStreaming(null);
          setSourcesFor(fakeSources);
          setSourcesFocus(0);
        }
      }, 18);
    }, 900);
  };

  const openSources = (sources, idx = 0) => {
    setSourcesFor(sources);
    setSourcesFocus(idx);
    setSourcesOpen(true);
  };

  // keyboard shortcuts
  useEffect(() => {
    const h = (e) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key === 'k') { e.preventDefault(); newChat(); }
      if (cmd && e.key === '.') { e.preventDefault(); setSourcesOpen(v => !v); }
      if (cmd && e.key === '\\') { e.preventDefault(); setSidebarCollapsed(v => !v); }
    };
    window.addEventListener('keydown', h);
    // responsive: auto-collapse panels when viewport shrinks
    const onResize = () => {
      if (window.innerWidth < 1100) setSourcesOpen(false);
      if (window.innerWidth < 760) setSidebarCollapsed(true);
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('keydown', h); window.removeEventListener('resize', onResize); };
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', background: 'var(--bg)' }}>
      {tweaks.showSidebar && (
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={newChat}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
        />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ height: 44, borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
            {conversation?.title || 'new chat'}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            · {conversation?.messages.length || 0} messages
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 2s ease-in-out infinite' }} />
            100% local
          </div>
          <button onClick={() => setSourcesOpen(v => !v)} style={{
            padding: '6px 10px', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: sourcesOpen ? 'var(--accent-hi)' : 'var(--text-dim)',
            border: `1px solid ${sourcesOpen ? 'var(--accent-border)' : 'var(--border)'}`,
            background: sourcesOpen ? 'var(--accent-dim)' : 'transparent',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Icon name="book" size={10} /> sources {sourcesFor ? sourcesFor.length : 0}
          </button>
        </div>

        <Messages conversation={conversation} onOpenSources={openSources} streaming={streaming} />

        <Composer onSend={send} streaming={streaming} onStop={() => setStreaming(null)}
          modelId={modelId} setModelId={setModelId}
          scopeId={scopeId} setScopeId={setScopeId}
          k={k} setK={setK}
        />
      </div>

      {tweaks.showSources && sourcesOpen && (
        <SourcesPanel sources={sourcesFor} onClose={() => setSourcesOpen(false)} focusIdx={sourcesFocus} />
      )}

      {tweaksOpen && <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} onClose={() => setTweaksOpen(false)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
