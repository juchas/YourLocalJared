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

const FILETYPES = [
  { id: 'md',   ext: '.md, .markdown, .mdx', label: 'markdown',       count: 1342, on: true },
  { id: 'txt',  ext: '.txt',                  label: 'plain text',     count: 412,  on: true },
  { id: 'pdf',  ext: '.pdf',                  label: 'pdf',            count: 284,  on: true },
  { id: 'docx', ext: '.docx, .doc',           label: 'word',           count: 98,   on: true },
  { id: 'code', ext: '.py, .js, .ts, .go…',   label: 'source code',    count: 1104, on: false },
  { id: 'html', ext: '.html, .htm',           label: 'html',           count: 62,   on: false },
  { id: 'csv',  ext: '.csv, .tsv',            label: 'tabular',        count: 28,   on: false },
  { id: 'epub', ext: '.epub',                 label: 'ebooks',         count: 14,   on: false },
];

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

Object.assign(window, { HARDWARE, FOLDERS, IGNORES, FILETYPES, LLMS, EMBEDDERS });
