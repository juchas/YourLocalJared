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
  const [chunksDone, setChunksDone] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [orphans, setOrphans] = useState(0);
  const [pruned, setPruned] = useState(0);
  const [failed, setFailed] = useState(0);
  const [rebuild, setRebuild] = useState(false);
  const [rerun, setRerun] = useState(0);
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
    setChunksDone(0);
    setSkipped(0);
    setOrphans(0);
    setPruned(0);
    setFailed(0);
    setDone(false);
    setError(null);
    setLog([]);
    const stamp = () => ((performance.now() - startRef.current) / 1000).toFixed(2);

    const handleEvent = (ev) => {
      if (cancelled) return;
      switch (ev.phase) {
        case 'rebuild':
          setLog(l => [{
            t: stamp(), file: `rebuild: ${ev.reason || 'full re-embed'}`, chunks: 0, ms: 0, kind: 'rebuild',
          }, ...l].slice(0, 40));
          break;
        case 'scan':
          setPhaseIdx(i => Math.max(i, phaseIndex.scan));
          setTotalFiles(Math.max(1, ev.total_files | 0));
          setSkipped(ev.skipped | 0);
          setOrphans(ev.orphans | 0);
          break;
        case 'prune':
          setPruned(p => p + 1);
          setLog(l => [{
            t: stamp(),
            file: `pruned ${typeof ev.file === 'string' ? ev.file.split(/[\\/]/).slice(-2).join('/') : ''}`,
            // Keep the full path so the log row can reveal it in the
            // file manager. Pruned files won't exist on disk though, so
            // don't offer reveal for them.
            fullPath: null,
            chunks: 0, ms: 0, kind: 'prune',
          }, ...l].slice(0, 40));
          break;
        case 'parse': {
          setPhaseIdx(i => Math.max(i, phaseIndex.parse));
          if (typeof ev.files_done === 'number') setFilesProcessed(ev.files_done);
          if (typeof ev.chunks === 'number') setChunks(c => c + ev.chunks);
          const displayFile = typeof ev.file === 'string'
            ? ev.file.split(/[\\/]/).slice(-2).join('/')
            : '(unknown)';
          setLog(l => [{
            t: stamp(), file: displayFile, fullPath: typeof ev.file === 'string' ? ev.file : null,
            chunks: ev.chunks | 0, ms: ev.ms | 0, kind: 'parse',
          }, ...l].slice(0, 40));
          break;
        }
        case 'skip': {
          // A single bad file (encrypted PDF, locked workbook, …) is
          // logged and counted but does NOT block the rest of the run.
          setPhaseIdx(i => Math.max(i, phaseIndex.parse));
          if (typeof ev.files_done === 'number') setFilesProcessed(ev.files_done);
          setFailed(f => f + 1);
          const displayFile = typeof ev.file === 'string'
            ? ev.file.split(/[\\/]/).slice(-2).join('/')
            : '(unknown)';
          setLog(l => [{
            t: stamp(),
            file: displayFile,
            reason: ev.reason || 'parse failed',
            chunks: 0, ms: 0, kind: 'skip',
          }, ...l].slice(0, 40));
          break;
        }
        case 'embed':
          setPhaseIdx(i => Math.max(i, phaseIndex.embed));
          if (typeof ev.chunks_done === 'number') setChunksDone(ev.chunks_done);
          break;
        case 'store':
          setPhaseIdx(i => Math.max(i, phaseIndex.store));
          if (typeof ev.chunks_done === 'number') setChunksDone(ev.chunks_done);
          break;
        case 'done':
          setPhaseIdx(phaseIndex.store);
          // `ev.files` is the successful-processed count; bumping
          // filesProcessed to (files + failed) keeps the progress
          // ring in sync with what the user watched scroll past.
          if (typeof ev.files === 'number') setFilesProcessed(ev.files + (ev.failed | 0));
          if (typeof ev.chunks === 'number') {
            setChunks(ev.chunks);
            setChunksDone(ev.chunks);
          }
          if (typeof ev.skipped === 'number') setSkipped(ev.skipped);
          if (typeof ev.pruned === 'number') setPruned(ev.pruned);
          if (typeof ev.failed === 'number') setFailed(ev.failed);
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
            rebuild,
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
    // /api/setup/folders has resolved), and when the user clicks the
    // "run again" button (which bumps `rerun`).
  }, [folders, fileTypes, rerun]);

  // total_files is "files to process this run" — when everything was
  // already up to date it's 0 and we'd divide by zero. Count skipped
  // files as implicitly done so the ring lands on 100% in that case.
  const fileDenom = totalFiles + skipped;
  const fileNumer = filesProcessed + skipped;
  const filePct = fileDenom > 0 ? (fileNumer / fileDenom) * 100 : (done ? 100 : 0);

  // Blend file-level progress with intra-file chunk progress so the
  // ring keeps moving during the embed/store tail of a big file (e.g.
  // a spreadsheet that balloons into tens of thousands of chunks).
  // `chunksDone` comes from embed/store events; `chunks` is the
  // running total the parse phase has accumulated so far. When we're
  // mid-file, chunksDone/chunks interpolates between filesProcessed
  // and filesProcessed+1 on the file-denominator axis.
  let pct = filePct;
  if (!done && chunks > 0 && chunksDone > 0 && chunksDone < chunks && fileDenom > 0) {
    const frac = chunksDone / chunks;           // 0..1 across chunks seen so far
    const step = (1 / fileDenom) * 100;         // one file's share of the ring
    pct = Math.min(100, filePct + step * frac);
  }
  const displayPct = done && !error ? 100 : Math.min(100, pct);
  const SZ = 180;
  const R = (SZ - 16) / 2;
  const C = 2 * Math.PI * R;

  const hasSubStats = failed > 0 || skipped > 0 || orphans > 0 || pruned > 0;

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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', marginBottom: hasSubStats ? 10 : 18 }}>
              {[
                ['files', `${filesProcessed.toLocaleString()} / ${totalFiles.toLocaleString()}`],
                // Show chunks_done / chunks_parsed while embed+store are
                // chewing through a big file; falls back to the running
                // total once we've stored everything.
                ['chunks',
                  (!done && chunks > 0 && chunksDone > 0 && chunksDone < chunks)
                    ? `${chunksDone.toLocaleString()} / ${chunks.toLocaleString()}`
                    : chunks.toLocaleString()],
                ['elapsed', `${(elapsedMs / 1000).toFixed(1)}s`],
                ['phase', phases[phaseIdx]],
              ].map(([l, v]) => (
                <div key={l} style={{ background: 'var(--bg)', padding: 12 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dimmer)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                </div>
              ))}
            </div>
            {failed > 0 && (
              <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--warn, #c97d17)', marginBottom: (skipped > 0 || orphans > 0 || pruned > 0) ? 6 : 14, fontVariantNumeric: 'tabular-nums' }}>
                {failed.toLocaleString()} unparseable — see log
              </div>
            )}
            {(skipped > 0 || orphans > 0 || pruned > 0) && (
              <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 14, fontVariantNumeric: 'tabular-nums' }}>
                {skipped > 0 && <span>{skipped.toLocaleString()} unchanged</span>}
                {skipped > 0 && (orphans > 0 || pruned > 0) && <span> · </span>}
                {pruned > 0 && <span>{pruned.toLocaleString()} pruned</span>}
                {pruned === 0 && orphans > 0 && <span>{orphans.toLocaleString()} orphaned</span>}
              </div>
            )}
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
            {done && !error && (
              <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer' }}>
                  <Check checked={rebuild} onChange={setRebuild} />
                  <span>full rebuild</span>
                </label>
                <button
                  onClick={() => setRerun(n => n + 1)}
                  style={{
                    padding: '6px 12px', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: 'var(--text-dim)', border: '1px solid var(--border)', background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  run again
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 14, padding: 14, border: '1px solid var(--warn, #c97d17)', background: 'rgba(201,125,23,0.08)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn, #c97d17)', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>ingest failed</div>
            <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</div>
          </div>
        )}

        {/* When `error` is set we route `onNext` to `onBack` so the
            user has a working escape hatch — that's why the button is
            intentionally enabled (`!done && !error`) rather than the
            naive `!done || !!error` which would leave them stuck. */}
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
          {log.map((l, i) => {
            const isSkip = l.kind === 'skip';
            const isPrune = l.kind === 'prune';
            const isRebuild = l.kind === 'rebuild';
            const isWarn = isSkip || isPrune;
            const revealTitle = window.revealTooltip ? window.revealTooltip() : 'show in folder';
            return (
              <Row key={i} accent={isWarn ? 'var(--warn, #c97d17)' : 'var(--accent)'} style={{ animation: 'slideIn 0.2s' }}
                title={isSkip ? l.reason : undefined}>
                <span style={{ fontSize: 10, color: 'var(--text-faintest)', width: 36, fontVariantNumeric: 'tabular-nums' }}>{l.t}</span>
                <Icon name={isSkip || isPrune ? 'x' : isRebuild ? 'cog' : 'check'} size={10} stroke={2.5}
                  style={{ color: isWarn ? 'var(--warn, #c97d17)' : 'var(--accent-hi)' }} />
                {l.fullPath ? (
                  <button
                    onClick={() => window.revealInFolder && window.revealInFolder(l.fullPath)}
                    title={revealTitle}
                    style={{
                      flex: 1, textAlign: 'left', padding: 0, background: 'transparent',
                      border: 'none', cursor: 'pointer',
                      fontSize: 11, color: isWarn ? 'var(--text-dim)' : 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      textDecoration: 'underline', textDecorationColor: 'transparent',
                      transition: 'text-decoration-color 0.1s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecorationColor = 'var(--accent-hi)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecorationColor = 'transparent'; }}
                  >
                    {l.file}
                  </button>
                ) : (
                  <span style={{
                    flex: 1, fontSize: 11,
                    color: isWarn ? 'var(--text-dim)' : 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {l.file}{isSkip && <span style={{ color: 'var(--warn, #c97d17)', marginLeft: 8 }}>· {l.reason}</span>}
                  </span>
                )}
                <span style={{ width: 70, textAlign: 'right', fontSize: 11, color: 'var(--accent-hi)', fontVariantNumeric: 'tabular-nums' }}>
                  {l.chunks > 0 ? `+${l.chunks}` : ''}
                </span>
                <span style={{ width: 60, textAlign: 'right', fontSize: 11, color: 'var(--text-dimmer)', fontVariantNumeric: 'tabular-nums' }}>
                  {l.ms > 0 ? l.ms : ''}
                </span>
              </Row>
            );
          })}
        </div>
      </div>
    </div>
  );
}
window.ScreenIngest = ScreenIngest;
