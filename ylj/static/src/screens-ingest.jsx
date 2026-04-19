function ScreenIngest({ onNext, onBack, folders, fileTypes }) {
  const selectedFolders = (folders || []).filter(f => f.selected);
  const enabledExtensions = (fileTypes || [])
    .filter(t => t.on)
    .flatMap(t => t.extensions || []);

  // Estimate before scan comes back — once the backend tells us the real
  // count we swap to that. Keeps the ring gauge from snapping at zero on
  // the first frame.
  const estimatedFiles = selectedFolders.reduce((a, b) => a + (b.files || 0), 0)
    * ((fileTypes || []).filter(t => t.on).length / Math.max(1, (fileTypes || []).length));

  // Keep this list in lock-step with the phases the backend emits in
  // `ingest_stream()` (ylj/ingest.py). Adding a label that the server never
  // emits leaves an unreachable step in the UI, and skipping one shifts the
  // indices below.
  const phases = ['scan', 'parse', 'embed', 'store'];
  const phaseIndex = { scan: 0, parse: 1, embed: 2, store: 3 };
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [totalFiles, setTotalFiles] = useState(Math.max(1, Math.floor(estimatedFiles)));
  const [filesProcessed, setFilesProcessed] = useState(0);
  const [chunks, setChunks] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [log, setLog] = useState([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(performance.now());

  useEffect(() => {
    const iv = setInterval(() => {
      if (done) { clearInterval(iv); return; }
      setElapsedMs(performance.now() - startRef.current);
    }, 250);
    return () => clearInterval(iv);
  }, [done]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    startRef.current = performance.now();
    // Reset progress when inputs change so a re-run doesn't render
    // mixed counters from a previous attempt.
    setPhaseIdx(0);
    setFilesProcessed(0);
    setChunks(0);
    setDone(false);
    setError(null);
    setLog([]);
    const stamp = () => ((performance.now() - startRef.current) / 1000).toFixed(2);

    const handleEvent = (ev) => {
      if (cancelled) return;
      switch (ev.phase) {
        case 'scan':
          setPhaseIdx(i => Math.max(i, phaseIndex.scan));
          setTotalFiles(Math.max(1, ev.total_files | 0));
          break;
        case 'parse': {
          setPhaseIdx(i => Math.max(i, phaseIndex.parse));
          if (typeof ev.files_done === 'number') setFilesProcessed(ev.files_done);
          if (typeof ev.chunks === 'number') setChunks(c => c + ev.chunks);
          const displayFile = typeof ev.file === 'string'
            ? ev.file.split(/[\\/]/).slice(-2).join('/')
            : '(unknown)';
          setLog(l => [{
            t: stamp(), file: displayFile, chunks: ev.chunks | 0, ms: ev.ms | 0,
          }, ...l].slice(0, 40));
          break;
        }
        case 'embed':
          setPhaseIdx(i => Math.max(i, phaseIndex.embed));
          break;
        case 'store':
          setPhaseIdx(i => Math.max(i, phaseIndex.store));
          break;
        case 'done':
          setPhaseIdx(phaseIndex.store);
          if (typeof ev.files === 'number') setFilesProcessed(ev.files);
          if (typeof ev.chunks === 'number') setChunks(ev.chunks);
          setDone(true);
          break;
        case 'error':
          setError(ev.message || 'ingest failed');
          setDone(true);
          break;
      }
    };

    const run = async () => {
      // `folders` is fetched async in app.jsx; if a reload lands us
      // straight on step 07 the array can be empty for the first frames.
      // Wait for it to populate before deciding whether nothing was
      // selected.
      if (!folders) return;
      if (folders.length > 0 && selectedFolders.length === 0) {
        setError('No folders selected. Go back to step 03 and pick at least one.');
        setDone(true);
        return;
      }
      if (selectedFolders.length === 0) return;
      try {
        const r = await fetch('/api/setup/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folders: selectedFolders.map(f => f.path),
            extensions: enabledExtensions,
          }),
          signal: controller.signal,
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.detail || `HTTP ${r.status}`);
        }
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let sawTerminal = false;
        const feed = (ev) => {
          if (ev && (ev.phase === 'done' || ev.phase === 'error')) sawTerminal = true;
          handleEvent(ev);
        };
        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          if (cancelled) return;
          buffer += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try { feed(JSON.parse(line)); } catch { /* skip malformed */ }
          }
        }
        // Flush any trailing partial line.
        const tail = buffer.trim();
        if (tail) {
          try { feed(JSON.parse(tail)); } catch { /* skip malformed */ }
        }
        if (!cancelled && !sawTerminal) {
          // `ingest_stream()` always yields a `done` (or `error`) event on
          // the happy path, so an early close almost always means the
          // network/connection dropped. Surface that instead of pretending
          // we made it to 100%.
          setError('Connection closed before ingest finished (unexpected end of stream).');
          setDone(true);
        }
      } catch (e) {
        if (cancelled || e?.name === 'AbortError') return;
        setError(String(e.message || e));
        setDone(true);
      }
    };

    run();
    return () => { cancelled = true; controller.abort(); };
    // Re-run when the folder/filetype selection becomes available or
    // changes (e.g. browser reload landing directly on step 07 before
    // /api/setup/folders has resolved).
  }, [folders, fileTypes]);

  const pct = totalFiles > 0 ? Math.min(100, (filesProcessed / totalFiles) * 100) : (done ? 100 : 0);
  const displayPct = done && !error ? 100 : pct;
  const SZ = 180;
  const R = (SZ - 16) / 2;
  const C = 2 * Math.PI * R;

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: '1 1 55%', padding: '32px 48px', display: 'flex', flexDirection: 'column' }}>
        <SectionHeader num="07" label="building the index" desc="parsing files, splitting into chunks, generating embeddings, writing to the local vector store. nothing leaves this machine." />

        <div style={{ flex: 1, display: 'flex', gap: 32, alignItems: 'center', padding: '16px 0' }}>
          <div style={{ position: 'relative', width: SZ, height: SZ, flexShrink: 0 }}>
            <svg width={SZ} height={SZ} style={{ transform: 'rotate(-90deg)' }}>
              <circle cx={SZ/2} cy={SZ/2} r={R} stroke="var(--border)" strokeWidth={4} fill="none" />
              <circle cx={SZ/2} cy={SZ/2} r={R}
                stroke={error ? 'var(--warn, #c97d17)' : 'var(--accent)'} strokeWidth={4} fill="none"
                strokeLinecap="square"
                strokeDasharray={C}
                strokeDashoffset={C - (C * displayPct) / 100}
                style={{ transition: 'stroke-dashoffset 0.25s' }}
              />
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {displayPct.toFixed(0)}<span style={{ fontSize: 16, color: 'var(--text-dim)' }}>%</span>
              </div>
              <div style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-dimmer)', textTransform: 'uppercase' }}>
                {done && !error ? 'done' : `${phases[phaseIdx]}ing`}
              </div>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', marginBottom: 18 }}>
              {[
                ['files', `${filesProcessed.toLocaleString()} / ${totalFiles.toLocaleString()}`],
                ['chunks', chunks.toLocaleString()],
                ['elapsed', `${(elapsedMs / 1000).toFixed(1)}s`],
                ['phase', phases[phaseIdx]],
              ].map(([l, v]) => (
                <div key={l} style={{ background: 'var(--bg)', padding: 12 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dimmer)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 8 }}>pipeline</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {phases.map((ph, i) => {
                const cur = i === phaseIdx && !done;
                const dn = i < phaseIdx || done;
                return (
                  <React.Fragment key={ph}>
                    <div style={{
                      flex: 1, padding: '8px 6px',
                      textAlign: 'center', fontSize: 10,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: dn || cur ? 'var(--text)' : 'var(--text-faintest)',
                      fontWeight: cur ? 600 : 400,
                      background: cur ? 'var(--accent-dim)' : dn ? 'var(--bg-hi)' : 'var(--bg)',
                      border: `1px solid ${cur ? 'var(--accent-border)' : 'var(--border)'}`,
                      borderRadius: 2,
                    }}>
                      {ph}
                    </div>
                    {i < phases.length - 1 && <span style={{ color: 'var(--text-faintest)', fontSize: 10 }}>→</span>}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 14, padding: 14, border: '1px solid var(--warn, #c97d17)', background: 'rgba(201,125,23,0.08)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn, #c97d17)', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>ingest failed</div>
            <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</div>
          </div>
        )}

        <StepNav onBack={onBack} onNext={error ? onBack : onNext}
          nextLabel={error ? 'go back' : done ? 'run a test query' : 'indexing…'}
          nextDisabled={!done && !error} />
      </div>

      <div style={{ flex: '1 1 45%', borderLeft: '1px solid var(--border)', background: 'var(--bg-alt)', display: 'flex', flexDirection: 'column' }}>
        <ColHeader>
          <span style={{ flex: 1 }}>processed</span>
          <span style={{ width: 70, textAlign: 'right' }}>chunks</span>
          <span style={{ width: 60, textAlign: 'right' }}>ms</span>
        </ColHeader>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {log.length === 0 && !done && (
            <div style={{ padding: '14px 18px', fontSize: 11, color: 'var(--text-dimmer)' }}>
              waiting for parse events…
            </div>
          )}
          {log.map((l, i) => (
            <Row key={i} accent="var(--accent)" style={{ animation: 'slideIn 0.2s' }}>
              <span style={{ fontSize: 10, color: 'var(--text-faintest)', width: 36, fontVariantNumeric: 'tabular-nums' }}>{l.t}</span>
              <Icon name="check" size={10} stroke={2.5} style={{ color: 'var(--accent-hi)' }} />
              <span style={{ flex: 1, fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.file}
              </span>
              <span style={{ width: 70, textAlign: 'right', fontSize: 11, color: 'var(--accent-hi)', fontVariantNumeric: 'tabular-nums' }}>+{l.chunks}</span>
              <span style={{ width: 60, textAlign: 'right', fontSize: 11, color: 'var(--text-dimmer)', fontVariantNumeric: 'tabular-nums' }}>{l.ms}</span>
            </Row>
          ))}
        </div>
      </div>
    </div>
  );
}
window.ScreenIngest = ScreenIngest;
