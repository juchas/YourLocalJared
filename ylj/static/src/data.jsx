// Mock data for the onboarding
const HARDWARE = {
  os: 'macOS 14.5 (Sonoma)',
  chip: 'Apple M3 Pro',
  cores: '12 cores (8P / 4E)',
  ram: '36 GB unified',
  gpu: 'M3 Pro 18-core GPU',
  disk: '486 GB free / 1 TB',
  ramGB: 36,
  diskFreeGB: 486,
  hasGPU: true,
  tier: 'capable',
};

const FOLDERS = [
  { id: 'docs', path: '~/Documents', files: 2412, sizeGB: 3.2, selected: true, warn: null },
  { id: 'notes', path: '~/Obsidian/vault', files: 1104, sizeGB: 0.4, selected: true, warn: null },
  { id: 'desk', path: '~/Desktop', files: 217, sizeGB: 1.1, selected: false, warn: null },
  { id: 'proj', path: '~/Projects', files: 18432, sizeGB: 12.6, selected: false, warn: 'heavy — 18k files' },
  { id: 'dl', path: '~/Downloads', files: 893, sizeGB: 4.8, selected: false, warn: 'mixed content' },
  { id: 'icloud', path: '~/iCloud Drive', files: 5621, sizeGB: 8.3, selected: false, warn: null },
];

const IGNORES = ['node_modules', '.git', '.venv', '__pycache__', '*.log', 'dist', 'build', '.DS_Store'];

// Each category owns a set of extensions (lowercased, with leading dot).
// `count` is computed live from folder.extensions at render time, so the
// hardcoded numbers here are only used as a fallback before the first
// folder scan completes.
const FILETYPES = [
  { id: 'md',   ext: '.md, .markdown, .mdx',                      label: 'markdown',    count: 0, on: true,  extensions: ['.md', '.markdown', '.mdx'] },
  { id: 'txt',  ext: '.txt',                                      label: 'plain text',  count: 0, on: true,  extensions: ['.txt'] },
  { id: 'pdf',  ext: '.pdf',                                      label: 'pdf',         count: 0, on: true,  extensions: ['.pdf'] },
  { id: 'docx', ext: '.docx, .doc',                               label: 'word',        count: 0, on: true,  extensions: ['.docx', '.doc'] },
  { id: 'code', ext: '.py, .js, .ts, .go, .rs, .java, .rb',       label: 'source code', count: 0, on: false, extensions: ['.py', '.js', '.ts', '.tsx', '.jsx', '.go', '.rs', '.java', '.rb', '.c', '.cpp', '.h'] },
  { id: 'html', ext: '.html, .htm',                               label: 'html',        count: 0, on: false, extensions: ['.html', '.htm'] },
  { id: 'csv',  ext: '.csv, .tsv',                                label: 'tabular',     count: 0, on: false, extensions: ['.csv', '.tsv', '.xlsx'] },
  { id: 'epub', ext: '.epub',                                     label: 'ebooks',      count: 0, on: false, extensions: ['.epub'] },
];

function computeFileTypeCounts(folders, fileTypes) {
  // Sum folder.extensions across selected folders into each category's count.
  // If no selected folder has extensions data yet, preserve the fallback
  // counts defined in FILETYPES so offline/pre-scan rendering still works.
  const totals = {};
  let hasExtensionsData = false;
  for (const f of folders || []) {
    if (!f.selected) continue;
    if (f.extensions !== undefined) hasExtensionsData = true;
    for (const [ext, n] of Object.entries(f.extensions || {})) {
      totals[ext] = (totals[ext] || 0) + n;
    }
  }
  return fileTypes.map(t => ({
    ...t,
    count: hasExtensionsData
      ? t.extensions.reduce((acc, e) => acc + (totals[e] || 0), 0)
      : t.count,
  }));
}

const LLMS = [
  { id: 'llama3.1:8b',    name: 'Llama 3.1',         size: '8B',  sizeGB: 4.7, ram: 8,  gated: true,  desc: 'meta · general, multilingual', rec: false },
  { id: 'qwen2.5:7b',     name: 'Qwen 2.5',          size: '7B',  sizeGB: 4.4, ram: 8,  gated: false, desc: 'alibaba · strong at code + reasoning', rec: true },
  { id: 'mistral:7b',     name: 'Mistral',           size: '7B',  sizeGB: 4.1, ram: 8,  gated: true,  desc: 'mistral · fast, accurate', rec: false },
  { id: 'phi3.5:mini',    name: 'Phi 3.5 Mini',      size: '3.8B',sizeGB: 2.2, ram: 6,  gated: false, desc: 'microsoft · small, punches up', rec: false },
  { id: 'gemma2:9b',      name: 'Gemma 2',           size: '9B',  sizeGB: 5.4, ram: 12, gated: false, desc: 'google · balanced reasoner', rec: false },
  { id: 'llama3.1:70b',   name: 'Llama 3.1',         size: '70B', sizeGB: 40,  ram: 64, gated: true,  desc: 'meta · frontier-class, needs beefy hw', rec: false },
];

const EMBEDDERS = [
  { id: 'nomic-embed',     name: 'nomic-embed-text',  dims: 768,  sizeGB: 0.27, desc: 'nomic · best tradeoff',     rec: true  },
  { id: 'mxbai-embed',     name: 'mxbai-embed-large', dims: 1024, sizeGB: 0.67, desc: 'mixedbread · highest recall', rec: false },
  { id: 'bge-small',       name: 'bge-small-en',      dims: 384,  sizeGB: 0.13, desc: 'baai · tiny, fast',         rec: false },
  { id: 'all-minilm',      name: 'all-MiniLM-L6',     dims: 384,  sizeGB: 0.09, desc: 'sbert · classic, tiny',     rec: false },
];

Object.assign(window, { HARDWARE, FOLDERS, IGNORES, FILETYPES, LLMS, EMBEDDERS, computeFileTypeCounts });
