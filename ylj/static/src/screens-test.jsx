function ScreenTest({ onNext, onBack, llmId }) {
  const [q, setQ] = useState('what did i decide about the chunking strategy?');
  const [asked, setAsked] = useState(false);
  const [streamIdx, setStreamIdx] = useState(0);
  const [sources, setSources] = useState([]);

  const answer = "based on your notes — you went with a sliding window, ~512 tokens per chunk, 50-token overlap, and separate embedding for each chunk. you rejected sentence-based chunking because it fragmented code blocks too aggressively. decision is in notes/ideas/embedding-arch.md (mar 14) and cross-ref'd in meetings/2024-03-14.md.";

  const allSources = [
    { file: 'notes/ideas/embedding-arch.md', snippet: '…decided on 512-token sliding window w/ 50-token overlap. sentence splits were bad for code…', score: 0.91 },
    { file: 'meetings/2024-03-14.md',        snippet: '…re-confirmed chunking decision. will revisit if retrieval recall drops below 0.8…', score: 0.87 },
    { file: 'research/rag-papers.pdf',       snippet: '…empirical results suggest fixed-size chunking outperforms semantic on short-form…', score: 0.73 },
  ];

  const ask = () => {
    setAsked(true);
    setStreamIdx(0);
    setSources([]);
    setTimeout(() => {
      setSources(allSources);
      const iv = setInterval(() => {
        setStreamIdx(i => {
          if (i >= answer.length) { clearInterval(iv); return i; }
          return Math.min(answer.length, i + 3);
        });
      }, 22);
    }, 450);
  };

  useEffect(() => { ask(); /* auto-run once */ }, []);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '32px 48px 16px' }}>
          <SectionHeader num="08" label="sanity check" desc="let's make sure retrieval + generation actually work before handing you off. ask anything — responses hit localhost:11434 just like production." />
        </div>

        <div style={{ padding: '0 48px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-alt)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="search" size={12} style={{ color: 'var(--text-dim)' }} />
          <input type="text" value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ask()}
            style={{
              flex: 1, border: 'none', background: 'transparent',
              padding: '14px 0', fontSize: 13, fontFamily: 'var(--mono)',
            }}
          />
          <GhostButton iconLeft="send" onClick={ask}>ask</GhostButton>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '24px 48px' }}>
          {asked && (
            <>
              <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--accent-hi)' }}>●</span>
                answer · {LLMS.find(m => m.id === llmId)?.name} {LLMS.find(m => m.id === llmId)?.size}
                <span style={{ flex: 1 }} />
                {streamIdx < answer.length && <span style={{ color: 'var(--accent-hi)' }}>streaming…</span>}
                {streamIdx >= answer.length && <span style={{ color: 'var(--text-dim)' }}>842 ms · 38 tok/s</span>}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, marginBottom: 28 }}>
                {answer.slice(0, streamIdx)}
                {streamIdx < answer.length && <span style={{ color: 'var(--accent-hi)', animation: 'blink 0.8s steps(2) infinite' }}>▌</span>}
              </div>

              {sources.length > 0 && <>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 10 }}>retrieved chunks · {sources.length}</div>
                <div style={{ border: '1px solid var(--border)' }}>
                  {sources.map((s, i) => (
                    <Row key={i} accent="var(--accent)">
                      <span style={{ fontSize: 10, color: 'var(--text-dimmer)', width: 22 }}>
                        {String(i+1).padStart(2, '0')}
                      </span>
                      <Icon name="file" size={11} style={{ color: 'var(--accent-hi)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, color: 'var(--text)', fontWeight: 500 }}>{s.file}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.snippet}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 120 }}>
                        <div style={{ flex: 1, height: 3, background: 'var(--border)' }}>
                          <div style={{ width: `${s.score*100}%`, height: '100%', background: 'var(--accent)' }} />
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--accent-hi)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {s.score.toFixed(2)}
                        </span>
                      </div>
                    </Row>
                  ))}
                </div>
              </>}
            </>
          )}
        </div>

        <StepNav onBack={onBack} onNext={onNext} nextLabel="launch" nextIcon="arrow-r" nextDisabled={streamIdx < answer.length} />
      </div>

      <div style={{ width: 320, borderLeft: '1px solid var(--border)', background: 'var(--bg-alt)', padding: '28px 22px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 10 }}>try asking</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              'summarize my notes from march',
              'what pdfs mention transformers?',
              'what\'s in my meeting with acme?',
              'find my shopping list',
            ].map(s => (
              <button key={s} onClick={() => { setQ(s); setTimeout(ask, 50); }}
                style={{
                  textAlign: 'left', padding: '8px 10px',
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  fontSize: 11, color: 'var(--text)', fontFamily: 'var(--mono)',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg)'; }}
              >
                <span style={{ color: 'var(--accent-hi)', marginRight: 6 }}>?</span>{s}
              </button>
            ))}
          </div>
        </div>
        <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 10 }}>index stats</div>
          <KV label="documents" value="4,132" />
          <KV label="chunks" value="17,284" />
          <KV label="embeddings" value="768-dim" />
          <KV label="retrieval k" value="3" />
          <KV label="latency p50" value="82 ms" />
        </div>
      </div>
    </div>
  );
}
window.ScreenTest = ScreenTest;
