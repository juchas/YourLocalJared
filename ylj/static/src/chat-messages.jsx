// Messages area — bubbles with sources inline
function Messages({ conversation, onOpenSources, streaming }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conversation?.messages.length, streaming]);

  if (!conversation || conversation.messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '0 0 24px' }}>
      <div style={{ padding: '20px 48px 8px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, background: 'linear-gradient(var(--bg) 70%, transparent)', zIndex: 1, minWidth: 0 }}>
        <Icon name="terminal" size={12} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, maxWidth: '60%' }}>{conversation.title}</span>
        <Chip tone="ok">{conversation.messages.length} messages</Chip>
        {conversation.folderScope && conversation.folderScope.length > 0 && (
          <Chip>
            <Icon name="folder" size={9} />
            {conversation.folderScope.length} scope{conversation.folderScope.length > 1 ? 's' : ''}
          </Chip>
        )}
        <div style={{ flex: 1 }} />
        <button style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="download" size={10} /> export
        </button>
      </div>

      <div style={{ padding: '8px 48px 0', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {conversation.messages.map((m, i) => (
          <Message key={m.id} m={m} idx={i} onOpenSources={onOpenSources} />
        ))}
        {streaming && <StreamingMessage streaming={streaming} onOpenSources={onOpenSources} />}
      </div>
    </div>
  );
}

function Message({ m, idx, onOpenSources }) {
  if (m.role === 'user') {
    return (
      <div style={{ display: 'flex', gap: 12, animation: 'fadeIn 0.2s' }}>
        <div style={{
          width: 20, height: 20, borderRadius: 2, flexShrink: 0,
          background: 'var(--text)', color: 'var(--bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
        }}>
          YOU
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dimmer)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
            you · {fmtTime(m.ts)} ago
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.6, fontWeight: 500 }}>{m.text}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 12, animation: 'fadeIn 0.2s' }}>
      <div style={{ flexShrink: 0 }}><Logo size={20} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, color: 'var(--text-dimmer)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>jared · {m.model}</span>
          <span style={{ color: 'var(--text-faintest)' }}>·</span>
          <span>{fmtTime(m.ts)} ago</span>
          {m.meta && <>
            <span style={{ color: 'var(--text-faintest)' }}>·</span>
            <span>{m.meta.latency} ms</span>
            <span style={{ color: 'var(--text-faintest)' }}>·</span>
            <span>{m.meta.tokensPerSec} tok/s</span>
          </>}
        </div>
        <MarkdownText
          text={m.text}
          sourceCount={m.sources ? m.sources.length : 0}
          onCite={(i) => m.sources && onOpenSources(m.sources, i)}
        />

        {m.sources && m.sources.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dimmer)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>retrieved · {m.sources.length} chunks</span>
              <button onClick={() => onOpenSources(m.sources)} style={{ color: 'var(--accent-hi)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                open panel →
              </button>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 2 }}>
              {m.sources.map((s, si) => <SourceRow key={s.id} s={s} idx={si+1} onOpen={() => onOpenSources(m.sources, si)} />)}
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', gap: 4 }}>
          {[
            { i: 'check', l: 'helpful' },
            { i: 'x',     l: 'off' },
            { i: 'book',  l: 'cite' },
          ].map(a => (
            <button key={a.l} style={{
              fontSize: 10, color: 'var(--text-dimmer)',
              padding: '4px 8px', border: '1px solid transparent',
              display: 'flex', alignItems: 'center', gap: 4,
              letterSpacing: '0.04em',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--text-dimmer)'; }}
            >
              <Icon name={a.i} size={10} /> {a.l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SourceRow({ s, idx, onOpen }) {
  return (
    <Row accent="var(--accent)" onClick={onOpen} style={{ padding: 0 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dimmer)', width: 22, fontVariantNumeric: 'tabular-nums' }}>
        {String(idx).padStart(2, '0')}
      </span>
      <Icon name="file" size={11} style={{ color: 'var(--accent-hi)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.file}
          {s.page != null && (
            <span style={{ color: 'var(--text-dimmer)', fontWeight: 400 }}> · p. {s.page}</span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.snippet}
        </div>
      </div>
      <div style={{ width: 90, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, height: 3, background: 'var(--border)' }}>
          <div style={{ width: `${s.score*100}%`, height: '100%', background: 'var(--accent)' }} />
        </div>
        <span style={{ fontSize: 10, color: 'var(--accent-hi)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {s.score.toFixed(2)}
        </span>
      </div>
    </Row>
  );
}

function MarkdownText({ text, sourceCount = 0, onCite }) {
  // tiny markdown: bold **x** + inline `code` + [N] citation pills + paragraphs
  const parts = text.split(/\n\n+/);
  return (
    <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.7 }}>
      {parts.map((p, i) => (
        <p key={i} style={{ marginTop: i > 0 ? 12 : 0 }}>
          {inlineMd(p, { sourceCount, onCite })}
        </p>
      ))}
    </div>
  );
}

function CitationPill({ n, onClick }) {
  return (
    <button
      onClick={onClick}
      title={`jump to source ${n}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 20, height: 18, padding: '0 5px',
        marginLeft: 2, marginRight: 2,
        fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600,
        lineHeight: 1,
        color: 'var(--accent-hi)',
        background: 'var(--accent-dim)',
        border: '1px solid var(--accent-border)',
        borderRadius: 2,
        cursor: 'pointer',
        verticalAlign: 'baseline',
      }}
    >
      {n}
    </button>
  );
}

function inlineMd(s, opts = {}) {
  const { sourceCount = 0, onCite } = opts;
  const out = [];
  let rest = s;
  let key = 0;
  // Order in the alternation matters: bold / code first (they can't
  // contain whitespace-adjacent digits like `[3]`), then citations.
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[(\d+)\])/;
  while (rest.length) {
    const m = rest.match(re);
    if (!m) { out.push(rest); break; }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      out.push(<strong key={key++} style={{ fontWeight: 700, color: 'var(--text)' }}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('`')) {
      out.push(<code key={key++} style={{
        fontFamily: 'var(--mono)', fontSize: '0.92em',
        background: 'var(--accent-dim)', color: 'var(--accent-hi)',
        padding: '1px 5px', borderRadius: 2, fontWeight: 500,
      }}>{tok.slice(1, -1)}</code>);
    } else {
      // [N] citation — render as pill if N is in range and we have a
      // handler, else fall back to plain text so a stray [2024] in the
      // model's output doesn't become a bogus button.
      const n = parseInt(m[2], 10);
      if (onCite && n >= 1 && n <= sourceCount) {
        out.push(<CitationPill key={key++} n={n} onClick={() => onCite(n - 1)} />);
      } else {
        out.push(tok);
      }
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

function StreamingMessage({ streaming, onOpenSources }) {
  const sources = streaming.sources || [];
  return (
    <div style={{ display: 'flex', gap: 12, animation: 'fadeIn 0.2s' }}>
      <div style={{ flexShrink: 0 }}><Logo size={20} /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 9, color: 'var(--text-dimmer)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>jared · {streaming.model}</span>
          <span style={{ color: 'var(--text-faintest)' }}>·</span>
          <span style={{ color: 'var(--accent-hi)' }}>
            {streaming.phase === 'retrieving' ? 'retrieving chunks…' : streaming.phase === 'thinking' ? 'thinking…' : 'streaming'}
          </span>
        </div>
        {streaming.text ? (
          <MarkdownText
            text={streaming.text + '▌'}
            sourceCount={sources.length}
            onCite={(i) => onOpenSources && onOpenSources(sources, i)}
          />
        ) : (
          <div style={{ display: 'flex', gap: 4, padding: '8px 0' }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
                animation: `dot-bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  const prompts = [
    'summarize my notes from this week',
    'what pdfs mention transformers?',
    'find my packing list from tokyo',
    'what did i decide about pricing?',
    'who did i meet with last tuesday?',
    'search my journal for "burnout"',
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <div style={{ marginBottom: 18 }}><Logo size={48} /></div>
      <h1 style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 8, color: 'var(--text)' }}>
        ask jared anything.
      </h1>
      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 24, textAlign: 'center', maxWidth: 440, lineHeight: 1.6 }}>
        retrieval runs against your local index · nothing leaves this machine · citations inline
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, width: '100%', maxWidth: 540 }}>
        {prompts.map(p => (
          <button key={p} style={{
            textAlign: 'left', padding: '10px 12px',
            border: '1px solid var(--border)', background: 'var(--bg)',
            fontSize: 11.5, color: 'var(--text)', fontFamily: 'var(--mono)',
            display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.1s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg)'; }}
          >
            <span style={{ color: 'var(--accent-hi)' }}>?</span>
            <span style={{ flex: 1 }}>{p}</span>
            <Icon name="arrow-r" size={10} style={{ color: 'var(--text-dimmer)' }} />
          </button>
        ))}
      </div>
    </div>
  );
}

window.Messages = Messages;
