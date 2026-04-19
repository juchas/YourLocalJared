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

  const abortRef = useRef(null);
  const thinkTimerRef = useRef(null);

  const stop = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    if (thinkTimerRef.current) { clearTimeout(thinkTimerRef.current); thinkTimerRef.current = null; }
    setStreaming(null);
  };

  const send = async (text) => {
    const userMsg = { id: 'u' + Date.now(), role: 'user', text, ts: Date.now() };
    setConversations(cs => cs.map(c => c.id === activeId ? {
      ...c,
      title: c.messages.length === 0 ? text.slice(0, 40) : c.title,
      preview: text.slice(0, 60),
      updated: Date.now(),
      messages: [...c.messages, userMsg],
    } : c));

    // Build wire-format history (UI state uses `text`; API expects `content`).
    // The backend only reads the last user message today, but sending full
    // history keeps the contract stable for future multi-turn support.
    const convo = conversations.find(c => c.id === activeId);
    const history = (convo?.messages || []).map(m => ({ role: m.role, content: m.text }));
    const wire = [...history, { role: 'user', content: text }];

    setStreaming({ model: modelId, text: '', phase: 'retrieving' });
    thinkTimerRef.current = setTimeout(() => {
      setStreaming(s => s && { ...s, phase: 'thinking' });
    }, 300);

    const controller = new AbortController();
    abortRef.current = controller;
    const t0 = performance.now();

    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId, messages: wire, scopeId, k }),
        signal: controller.signal,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || err.error || `HTTP ${r.status}`);
      }
      const data = await r.json();
      if (controller.signal.aborted) return;
      if (thinkTimerRef.current) { clearTimeout(thinkTimerRef.current); thinkTimerRef.current = null; }

      const answer = data.answer || '';
      const sources = Array.isArray(data.sources) ? data.sources : [];
      const latency = Math.round(performance.now() - t0);

      // Reveal the answer gradually so the UI stays alive even though
      // the backend response is non-streaming for now.
      setStreaming(s => s && { ...s, phase: 'streaming', text: '' });
      let i = 0;
      const step = Math.max(1, Math.ceil(answer.length / 80));
      const iv = setInterval(() => {
        if (controller.signal.aborted) { clearInterval(iv); return; }
        i = Math.min(answer.length, i + step);
        setStreaming(s => s && { ...s, text: answer.slice(0, i) });
        if (i >= answer.length) {
          clearInterval(iv);
          const botMsg = {
            id: 'b' + Date.now(), role: 'assistant', text: answer, ts: Date.now(),
            model: data.model || modelId, sources,
            meta: {
              latency,
              tokens: Math.floor(answer.length / 4),
              tokensPerSec: Math.round((answer.length / 4) / Math.max(latency / 1000, 0.1)),
            },
          };
          setConversations(cs => cs.map(c => c.id === activeId ? { ...c, messages: [...c.messages, botMsg] } : c));
          setStreaming(null);
          setSourcesFor(sources);
          setSourcesFocus(0);
          abortRef.current = null;
        }
      }, 16);
    } catch (e) {
      if (thinkTimerRef.current) { clearTimeout(thinkTimerRef.current); thinkTimerRef.current = null; }
      if (controller.signal.aborted || e?.name === 'AbortError') return;
      const message = `⚠︎ chat failed: ${e.message || e}`;
      const botMsg = {
        id: 'b' + Date.now(), role: 'assistant', text: message, ts: Date.now(),
        model: modelId, sources: [],
        meta: { latency: Math.round(performance.now() - t0) },
      };
      setConversations(cs => cs.map(c => c.id === activeId ? { ...c, messages: [...c.messages, botMsg] } : c));
      setStreaming(null);
      abortRef.current = null;
    }
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

        <Composer onSend={send} streaming={streaming} onStop={stop}
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
