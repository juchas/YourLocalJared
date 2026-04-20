// Mock conversations + sources for chat
const NOW = Date.now();
const mins = (n) => NOW - n * 60000;
const days = (n) => NOW - n * 86400000;

const CONVERSATIONS = [
  {
    id: 'c1',
    title: 'chunking strategy decision',
    preview: '…decided on 512-token sliding window with 50 overlap',
    updated: mins(3),
    pinned: true,
    folderScope: ['~/Obsidian/vault', '~/Documents'],
    messages: [
      { id: 'm1', role: 'user', text: 'what did i decide about the chunking strategy?', ts: mins(8) },
      {
        id: 'm2', role: 'assistant', ts: mins(7), model: 'gemma4:e4b',
        text: "based on your notes — you went with a **sliding window**, ~512 tokens per chunk, 50-token overlap, and separate embedding for each chunk.\n\nyou rejected sentence-based chunking because it fragmented code blocks too aggressively. decision is in `notes/ideas/embedding-arch.md` (mar 14) and cross-ref'd in `meetings/2024-03-14.md`.",
        sources: [
          { id: 's1', file: 'notes/ideas/embedding-arch.md',  line: '42-58', snippet: '…decided on 512-token sliding window w/ 50-token overlap. sentence splits were bad for code…', score: 0.91 },
          { id: 's2', file: 'meetings/2024-03-14.md',         line: '12-19', snippet: '…re-confirmed chunking decision. will revisit if retrieval recall drops below 0.8…', score: 0.87 },
          { id: 's3', file: 'research/rag-papers.pdf',        line: 'p.14',  snippet: '…empirical results suggest fixed-size chunking outperforms semantic on short-form docs…', score: 0.73 },
        ],
        meta: { latency: 842, tokens: 58, tokensPerSec: 38 },
      },
      { id: 'm3', role: 'user', text: 'and what about chunk size for code files specifically?', ts: mins(4) },
      {
        id: 'm4', role: 'assistant', ts: mins(3), model: 'gemma4:e4b',
        text: "for code you overrode the default — **1024 tokens, no overlap**, split on top-level symbol boundaries (functions, classes). the reasoning was that code has strong local coherence, so splitting mid-function kills retrieval quality.\n\nyou also added a soft rule: files under 400 tokens stay unchunked so the whole file is one embedding.",
        sources: [
          { id: 's4', file: 'notes/ideas/embedding-arch.md', line: '60-75', snippet: '…for code specifically, 1024 tokens w/o overlap, split on AST boundaries (def/class/top-level)…', score: 0.94 },
          { id: 's5', file: 'notes/recipes/ingestion.md',    line: '8-14',  snippet: '…small-file bypass: anything <400 tok just gets one embedding, no chunking step…', score: 0.81 },
        ],
        meta: { latency: 712, tokens: 74, tokensPerSec: 42 },
      },
    ],
  },
  {
    id: 'c2', title: 'acme contract review',
    preview: 'payment terms net-45, renewal auto-opt-out…',
    updated: mins(47), pinned: true, folderScope: ['~/Documents'],
    messages: [],
  },
  {
    id: 'c3', title: 'recipe from that book',
    preview: 'the carbonara one with pecorino, not parm',
    updated: mins(180), folderScope: ['~/Obsidian/vault'],
    messages: [],
  },
  {
    id: 'c4', title: 'q1 retro — what went well',
    preview: 'shipped the search redesign, onboarding rewrite…',
    updated: days(1), folderScope: ['~/Obsidian/vault'],
    messages: [],
  },
  {
    id: 'c5', title: 'packing list — tokyo',
    preview: 'adapter, melatonin, power bank, the navy jacket',
    updated: days(2),
    messages: [],
  },
  {
    id: 'c6', title: 'transformer paper questions',
    preview: 'why the √d_k scaling in attention?',
    updated: days(3), folderScope: ['~/Documents/research'],
    messages: [],
  },
  {
    id: 'c7', title: 'rental agreement',
    preview: 'deposit returnable within 30 days of vacate',
    updated: days(5),
    messages: [],
  },
  {
    id: 'c8', title: 'book list to finish',
    preview: 'GEB, godfather of ai, thinking fast & slow',
    updated: days(8),
    messages: [],
  },
];

const MODELS = [
  { id: 'gemma4:e4b',  name: 'gemma 4 e4b',   size: '4B',  speed: 'fast',    rec: true  },
  { id: 'gemma4:e2b',  name: 'gemma 4 e2b',   size: '2B',  speed: 'fastest', rec: false },
  { id: 'qwen2.5:7b',  name: 'qwen 2.5',      size: '7B',  speed: 'fast',    rec: false },
  { id: 'phi4:14b',    name: 'phi 4',         size: '14B', speed: 'medium',  rec: false },
];

const SCOPES = [
  { id: 'all',    label: 'all sources',      count: 4132 },
  { id: 'obs',    label: '~/Obsidian/vault', count: 1104 },
  { id: 'docs',   label: '~/Documents',      count: 2412 },
  { id: 'proj',   label: '~/Projects (off)', count: 0, off: true },
];

Object.assign(window, { CONVERSATIONS, MODELS, SCOPES });
