const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "green",
  "tone": "light",
  "showStatusBar": true,
  "uppercaseTitles": false
}/*EDITMODE-END*/;

function App() {
  const [step, setStep] = useState(() => localStorage.getItem('ylj-step') || 'welcome');
  const [folders, setFolders] = useState(FOLDERS);
  const [ignores, setIgnores] = useState(IGNORES);
  const [fileTypes, setFileTypes] = useState(FILETYPES);
  const [llmId, setLlmId] = useState('qwen2.5:7b');
  const [embId, setEmbId] = useState('nomic-embed');
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [ollama, setOllama] = useState({ running: null, version: null, models: [] });

  useEffect(() => { localStorage.setItem('ylj-step', step); }, [step]);

  useEffect(() => {
    let cancelled = false;
    const fallback = { running: false, version: null, models: [] };
    const normalize = (d) => ({
      running: !!(d && d.running),
      version: d && typeof d.version === 'string' ? d.version : null,
      models: d && Array.isArray(d.models) ? d.models : [],
    });
    const check = () => {
      fetch('/api/setup/ollama-status')
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((d) => { if (!cancelled) setOllama(normalize(d)); })
        .catch(() => { if (!cancelled) setOllama(fallback); });
    };
    check();
    const iv = setInterval(check, 10000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

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

  const go = (id) => setStep(id);
  const stepIdx = STEPS.findIndex(s => s.id === step);
  const nextStep = () => setStep(STEPS[Math.min(STEPS.length - 1, stepIdx + 1)].id);
  const backStep = () => setStep(STEPS[Math.max(0, stepIdx - 1)].id);

  const screen = (() => {
    switch (step) {
      case 'welcome':  return <ScreenWelcome onNext={nextStep} />;
      case 'hardware': return <ScreenHardware onNext={nextStep} onBack={backStep} />;
      case 'folders':  return <ScreenFolders  onNext={nextStep} onBack={backStep} folders={folders} setFolders={setFolders} ignores={ignores} setIgnores={setIgnores} />;
      case 'types':    return <ScreenFileTypes onNext={nextStep} onBack={backStep} fileTypes={fileTypes} setFileTypes={setFileTypes} />;
      case 'models':   return <ScreenModels   onNext={nextStep} onBack={backStep} llmId={llmId} setLlmId={setLlmId} embId={embId} setEmbId={setEmbId} />;
      case 'install':  return <ScreenInstall  onNext={nextStep} onBack={backStep} llmId={llmId} embId={embId} />;
      case 'ingest':   return <ScreenIngest   onNext={nextStep} onBack={backStep} folders={folders} fileTypes={fileTypes} />;
      case 'test':     return <ScreenTest     onNext={nextStep} onBack={backStep} llmId={llmId} />;
      case 'handoff':  return <ScreenHandoff  onBack={backStep} />;
      default: return null;
    }
  })();

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar step={step} />
      <StepStrip step={step} onStep={go} />
      <div key={step} style={{ flex: 1, display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.18s', minHeight: 0 }}>
        {screen}
      </div>
      {tweaks.showStatusBar && <StatusLine items={[
        ollama.running
          ? { dot: 'on',  text: `ollama ${ollama.version || ''}`.trim() }
          : ollama.running === false
            ? { dot: 'warn', text: 'ollama: not running' }
            : { text: 'ollama: checking…' },
        { dot: 'on',   text: `model ${llmId}` },
        { text: `emb ${embId}` },
        { text: `${folders.filter(f=>f.selected).length} folders` },
        { text: `accent ${tweaks.accent}` },
      ]} />}
      {tweaksOpen && <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} onClose={() => setTweaksOpen(false)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
