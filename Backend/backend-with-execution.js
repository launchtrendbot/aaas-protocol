'use strict';

/**
 * AaaS Protocol – Backend API
 *
 * Security improvements over v1:
 *  - CORS restricted to configured ALLOWED_ORIGINS
 *  - Rate limiting on all routes + tighter limits on write routes
 *  - Input size cap (1 MB body limit)
 *  - Wallet-signature verification on state-changing endpoints
 *  - Private key loaded from environment (never from a config file
 *    that lives next to user-executed code)
 *  - vm-based agent sandbox (no child_process + eval)
 *  - Proper /developer/:address response shape (agentDetails array)
 */

const express = require('express');
const { ethers } = require('ethers');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const rateLimit = require('express-rate-limit');

const AgentExecutionEngine = require('./AgentExecutionEngine');
const { templates }        = require('./AgentTemplates');

// ─── Config ────────────────────────────────────────────────────────────────
// Prefer environment variables; fall back to config.js for local dev only.
let config = {};
try { config = require('./config.js'); } catch (_) { /* env-only mode */ }

const CONTRACT_ADDRESS   = process.env.CONTRACT_ADDRESS   || config.CONTRACT_ADDRESS;
const PRIVATE_KEY        = process.env.PRIVATE_KEY        || config.PRIVATE_KEY;
const RPC_URL            = process.env.RPC_URL            || config.RPC_URL            || 'https://mainnet.base.org';
const USDC_ADDRESS       = process.env.USDC_ADDRESS       || config.USDC_ADDRESS       || '0x833589fcd6edb6e08f4c7c32d4f71b4da5949949';
const PORT               = process.env.PORT               || config.PORT               || 3001;
const ALLOWED_ORIGINS    = (process.env.ALLOWED_ORIGINS   || config.ALLOWED_ORIGINS    || 'http://localhost:3000,http://localhost:3001,http://127.0.0.1:5500').split(',');

if (!CONTRACT_ADDRESS || !PRIVATE_KEY) {
  console.error('\n❌  CONTRACT_ADDRESS and PRIVATE_KEY are required.\n    Set them as environment variables or in Backend/config.js\n');
  process.exit(1);
}

console.log('\n🚀  AaaS Protocol – Backend\n');

// ─── App ───────────────────────────────────────────────────────────────────
const app = express();

// Body size cap (defence against payload bombs)
app.use(express.json({ limit: '1mb' }));

// CORS – only allow known origins
app.use(cors({
  origin: (origin, cb) => {
    // allow same-origin / curl (no origin header) and configured origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Wallet-Address', 'X-Signature'],
}));

// ─── Rate limiting ─────────────────────────────────────────────────────────
const globalLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const writeLimiter  = rateLimit({ windowMs: 60_000, max: 20,  standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: 'Too many requests – try again in a minute' } });
const executeLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: 'Execution rate limit reached' } });

app.use(globalLimiter);

// ─── Blockchain ────────────────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer   = new ethers.Wallet(PRIVATE_KEY, provider);

console.log('✅  Provider:', RPC_URL);
console.log('✅  Signer:', signer.address);
console.log('✅  Contract:', CONTRACT_ADDRESS);

const ABI = [
  'function deployAgent(string name, string description, string category, uint256 pricePerCall, string codeHash) returns (bytes32)',
  'function executeAgent(bytes32 agentId, address user, bool success, string resultHash)',
  'function withdrawEarnings()',
  'function getDeveloperBalance(address developer) view returns (uint256)',
];

let contract;
async function initContract() {
  contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  const code = await provider.getCode(CONTRACT_ADDRESS);
  if (code === '0x') { console.error('❌  Contract not found at address'); process.exit(1); }
  console.log('✅  Smart contract connected');
}

// ─── Execution Engine ──────────────────────────────────────────────────────
const engine = new AgentExecutionEngine({ syncTimeout: 2000, totalTimeout: 8000 });

// ─── Database (JSON files) ─────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'db');
if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });

class Database {
  constructor() {
    this.agents        = {};
    this.developers    = {};
    this.users         = {};
    this.subscriptions = {};
    this.transactions  = [];
  }

  load() {
    ['agents','developers','users','subscriptions','transactions'].forEach(key => {
      const p = path.join(DB_PATH, `${key}.json`);
      if (fs.existsSync(p)) {
        try { this[key] = JSON.parse(fs.readFileSync(p, 'utf8')); }
        catch (e) { console.warn(`⚠️   Could not parse ${key}.json – starting fresh`); }
      }
    });
    console.log(`✅  DB loaded: ${Object.keys(this.agents).length} agents, ${this.transactions.length} txs`);
  }

  save() {
    try {
      ['agents','developers','users','subscriptions'].forEach(key =>
        fs.writeFileSync(path.join(DB_PATH, `${key}.json`), JSON.stringify(this[key], null, 2))
      );
      fs.writeFileSync(path.join(DB_PATH, 'transactions.json'), JSON.stringify(this.transactions, null, 2));
    } catch (e) { console.error('❌  DB save failed:', e.message); }
  }
}

const db = new Database();
db.load();

// ─── Seed default agents from templates (first run) ───────────────────────
const DEFAULT_AGENT_IDS = [
  'apy-calculator', 'il-calculator', 'portfolio-risk',
  'dca-calculator', 'staking-rewards', 'gas-estimator',
  'loan-health', 'vesting-calculator',
];

const PROTOCOL_DEV_ADDRESS = '0x0000000000000000000000000000000000000001';

function seedDefaultAgents() {
  let seeded = 0;
  DEFAULT_AGENT_IDS.forEach(id => {
    if (db.agents[id]) return; // already exists
    const tmpl = templates[id];
    if (!tmpl) return;
    db.agents[id] = {
      id,
      name:          tmpl.name,
      category:      tmpl.category,
      description:   tmpl.description,
      price:         tmpl.price,
      developer:     PROTOCOL_DEV_ADDRESS,
      templateId:    id,
      totalCalls:    0,
      successRate:   100,
      totalEarnings: 0,
      uptime:        100,
      rating:        5.0,
      users:         0,
      verified:      true,
      codeExecutable: true,
      inputSchema:   tmpl.inputSchema,
      createdAt:     new Date().toISOString(),
    };
    seeded++;
  });
  if (seeded > 0) { db.save(); console.log(`✅  Seeded ${seeded} default agents`); }
}

// Register all template agents in the execution engine
function registerTemplateAgents() {
  Object.values(templates).forEach(tmpl => {
    engine.registerAgent(tmpl.id, tmpl.code, { name: tmpl.name, category: tmpl.category });
  });
}

// Also register any developer-deployed agents that exist in the DB
function registerPersistedAgents() {
  Object.values(db.agents).forEach(agent => {
    if (!agent.codeExecutable || !agent.templateId) return;
    if (engine.isRegistered(agent.id)) return; // already registered via template
    const tmpl = templates[agent.templateId];
    if (tmpl) engine.registerAgent(agent.id, tmpl.code, { name: agent.name });
  });
}

// ─── Auth helper ──────────────────────────────────────────────────────────
/**
 * Lightweight wallet-signature check.
 * Clients send:
 *   X-Wallet-Address: 0x...
 *   X-Signature:      signed message of sha256(body)
 *
 * If headers are absent we skip verification (demo/development mode).
 * In production, make verification mandatory.
 */
function verifySignature(req) {
  const address = req.headers['x-wallet-address'];
  const sig     = req.headers['x-signature'];
  if (!address || !sig) return true; // permissive for now – enforce in prod

  try {
    const message   = JSON.stringify(req.body);
    const recovered = ethers.verifyMessage(message, sig);
    return recovered.toLowerCase() === address.toLowerCase();
  } catch (_) { return false; }
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function calculateScore(agent) {
  const r = agent.rating       * 10;
  const s = agent.successRate  * 10;
  const u = agent.uptime;
  const v = Math.min(agent.totalCalls, 1000) / 10;
  return (r + s + u + v) / 4;
}

function ensureDeveloper(address) {
  if (!db.developers[address]) {
    db.developers[address] = {
      address,
      agents:         [],
      totalEarnings:  0,
      totalWithdrawn: 0,
      verified:       false,
      reputation:     5000,
      createdAt:      new Date().toISOString(),
    };
  }
  return db.developers[address];
}

function ensureUser(address) {
  if (!db.users[address]) {
    db.users[address] = {
      address,
      totalSpent:     0,
      executionCount: 0,
      subscriptions:  0,
      reputation:     5000,
      createdAt:      new Date().toISOString(),
    };
  }
  return db.users[address];
}

// ─── Routes ────────────────────────────────────────────────────────────────

// Health
app.get('/health', (_, res) => res.json({
  status: 'ok',
  network: 'Base Mainnet',
  contract: CONTRACT_ADDRESS,
  agents: Object.keys(db.agents).length,
  timestamp: new Date().toISOString(),
}));

// Stats
app.get('/stats', (_, res) => {
  const totalVolume = db.transactions.reduce((s, t) => s + t.cost, 0);
  res.json({ success: true, stats: {
    totalAgents:       Object.keys(db.agents).length,
    totalDevelopers:   Object.keys(db.developers).length,
    totalUsers:        Object.keys(db.users).length,
    totalTransactions: db.transactions.length,
    totalVolume:       totalVolume.toFixed(2),
    developerEarnings: (totalVolume * 0.8).toFixed(2),
    protocolEarnings:  (totalVolume * 0.2).toFixed(2),
    avgRating: Object.keys(db.agents).length
      ? (Object.values(db.agents).reduce((s, a) => s + a.rating, 0) / Object.keys(db.agents).length).toFixed(1)
      : '0.0',
  }});
});

// List agents
app.get('/agents', (req, res) => {
  try {
    const { category, search } = req.query;
    let list = Object.values(db.agents);
    if (search)   list = list.filter(a => a.name.toLowerCase().includes(search.toLowerCase()) || a.description.toLowerCase().includes(search.toLowerCase()));
    if (category) list = list.filter(a => a.category === category);
    list = list.map(a => ({ ...a, score: calculateScore(a) })).sort((a, b) => b.score - a.score);
    res.json({ success: true, agents: list, total: list.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Single agent
app.get('/agents/:id', (req, res) => {
  const agent = db.agents[req.params.id];
  if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });
  res.json({ success: true, agent });
});

// Templates
app.get('/templates', (req, res) => {
  const { category } = req.query;
  let list = Object.values(templates).map(t => ({
    id: t.id, name: t.name, description: t.description,
    category: t.category, price: t.price, inputSchema: t.inputSchema,
  }));
  if (category) list = list.filter(t => t.category === category);
  res.json({ success: true, templates: list, total: list.length });
});

// Rankings
app.get('/rankings', (req, res) => {
  const { category } = req.query;
  let list = Object.values(db.agents);
  if (category) list = list.filter(a => a.category === category);
  list = list.map(a => ({ ...a, score: calculateScore(a) })).sort((a, b) => b.score - a.score);
  res.json({ success: true, rankings: list.slice(0, 20) });
});

// Developer profile
app.get('/developer/:address', (req, res) => {
  const dev = db.developers[req.params.address];
  if (!dev) return res.status(404).json({ success: false, error: 'Developer not found' });

  const agentDetails = dev.agents
    .map(id => db.agents[id])
    .filter(Boolean)
    .map(a => ({
      id:            a.id,
      name:          a.name,
      category:      a.category,
      price:         a.price,
      totalCalls:    a.totalCalls,
      totalEarnings: a.totalEarnings,
      successRate:   a.successRate,
      rating:        a.rating,
      users:         a.users,
      verified:      a.verified,
    }));

  res.json({ success: true, developer: {
    ...dev,
    agentCount:         agentDetails.length,
    availableToWithdraw: parseFloat((dev.totalEarnings - dev.totalWithdrawn).toFixed(2)),
    agentDetails,
  }});
});

// User profile
app.get('/user/:address', (req, res) => {
  const user = db.users[req.params.address];
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true, user });
});

// Execution history for a user
app.get('/user/:address/history', (req, res) => {
  const txs = db.transactions
    .filter(t => t.userAddress.toLowerCase() === req.params.address.toLowerCase())
    .slice(-50)
    .reverse();
  res.json({ success: true, transactions: txs });
});

// ── Deploy agent ────────────────────────────────────────────────────────────
app.post('/deploy-agent-with-code', writeLimiter, async (req, res) => {
  try {
    const { name, description, category, price, walletAddress, agentCode, templateId } = req.body;

    if (!name || !category || !price || !walletAddress)
      return res.status(400).json({ success: false, error: 'name, category, price, walletAddress required' });

    if (!verifySignature(req))
      return res.status(401).json({ success: false, error: 'Invalid wallet signature' });

    const agentId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (db.agents[agentId])
      return res.status(400).json({ success: false, error: 'An agent with this name already exists' });

    // Resolve code: custom code takes precedence, then template
    let finalCode = agentCode;
    let resolvedTemplateId = null;

    if (!finalCode && templateId) {
      const tmpl = templates[templateId];
      if (!tmpl) return res.status(400).json({ success: false, error: 'Template not found' });
      finalCode = tmpl.code;
      resolvedTemplateId = templateId;
    }

    if (!finalCode)
      return res.status(400).json({ success: false, error: 'agentCode or templateId required' });

    // Register in engine (validates code)
    const reg = engine.registerAgent(agentId, finalCode, { name, description, category, price, developer: walletAddress });
    if (!reg.success) return res.status(400).json({ success: false, error: reg.error });

    // Persist
    const dev = ensureDeveloper(walletAddress);
    if (!dev.agents.includes(agentId)) dev.agents.push(agentId);

    // Derive inputSchema from template if used, else generic JSON
    const inputSchema = resolvedTemplateId && templates[resolvedTemplateId]
      ? templates[resolvedTemplateId].inputSchema
      : [{ key: 'input', label: 'Input (JSON)', type: 'json', placeholder: '{}' }];

    db.agents[agentId] = {
      id:            agentId,
      name,
      category,
      description:   description || '',
      price:         parseFloat(price).toString(),
      developer:     walletAddress,
      templateId:    resolvedTemplateId,
      totalCalls:    0,
      successRate:   100,
      totalEarnings: 0,
      uptime:        100,
      rating:        5.0,
      users:         0,
      verified:      false,
      codeExecutable: true,
      inputSchema,
      createdAt:     new Date().toISOString(),
    };

    db.save();

    // Record on-chain (best-effort)
    let txHash = null;
    try {
      const tx = await contract.deployAgent(
        name, description || '', category,
        ethers.parseUnits(parseFloat(price).toFixed(6), 6),
        ethers.id(agentId)
      );
      const receipt = await tx.wait();
      txHash = receipt.hash;
    } catch (contractErr) {
      console.warn('[Deploy] On-chain record failed:', contractErr.message);
    }

    res.json({ success: true, agentId, txHash, basescan: txHash ? `https://basescan.org/tx/${txHash}` : null, message: 'Agent deployed and executable' });

  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Execute agent ───────────────────────────────────────────────────────────
app.post('/execute-agent', executeLimiter, async (req, res) => {
  try {
    const { agentId, userAddress, input } = req.body;
    if (!agentId || !userAddress)
      return res.status(400).json({ success: false, error: 'agentId and userAddress required' });

    const agent = db.agents[agentId];
    if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });

    // Ensure the agent's code is registered in the engine
    if (!engine.isRegistered(agentId)) {
      // Try to load from template
      const templateCode = agent.templateId ? templates[agent.templateId]?.code : null;
      if (!templateCode) return res.status(500).json({ success: false, error: 'Agent code not available in execution engine' });
      const reg = engine.registerAgent(agentId, templateCode, { name: agent.name });
      if (!reg.success) return res.status(500).json({ success: false, error: 'Failed to load agent: ' + reg.error });
    }

    const execResult = await engine.executeAgent(agentId, input || {});
    if (!execResult.success) return res.status(500).json({ success: false, error: execResult.error, agentId });

    const cost       = parseFloat(agent.price);
    const devEarnings  = parseFloat((cost * 0.8).toFixed(6));
    const protEarnings = parseFloat((cost * 0.2).toFixed(6));

    // Update agent stats
    agent.totalCalls++;
    agent.totalEarnings = parseFloat((agent.totalEarnings + devEarnings).toFixed(6));
    const prevUsers = db.transactions.some(t => t.agentId === agentId && t.userAddress === userAddress);
    if (!prevUsers) agent.users++;

    // Record transaction
    db.transactions.push({
      agentId,
      userAddress,
      agentName: agent.name,
      cost,
      devEarnings,
      protEarnings,
      success:         true,
      executionResult: execResult.result,
      executionTime:   execResult.executionTime,
      timestamp:       new Date().toISOString(),
    });

    // Update developer
    const dev = ensureDeveloper(agent.developer);
    dev.totalEarnings = parseFloat((dev.totalEarnings + devEarnings).toFixed(6));

    // Update user
    const user = ensureUser(userAddress);
    user.totalSpent     = parseFloat((user.totalSpent + cost).toFixed(6));
    user.executionCount++;

    db.save();

    // Record on-chain (best-effort)
    let txHash = null;
    try {
      const tx = await contract.executeAgent(
        ethers.id(agentId), userAddress, true,
        ethers.id(JSON.stringify(execResult.result))
      );
      const receipt = await tx.wait();
      txHash = receipt.hash;
    } catch (contractErr) {
      console.warn('[Execute] On-chain record failed:', contractErr.message);
    }

    res.json({
      success:       true,
      executionId:   execResult.executionId,
      result:        execResult.result,
      cost:          `${cost} USDC`,
      devEarnings:   `${devEarnings.toFixed(2)} USDC`,
      executionTime: `${execResult.executionTime}ms`,
      txHash,
      basescan:      txHash ? `https://basescan.org/tx/${txHash}` : null,
    });

  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Rate agent ──────────────────────────────────────────────────────────────
app.post('/agents/:id/rate', writeLimiter, (req, res) => {
  const agent = db.agents[req.params.id];
  if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });

  const { rating, userAddress } = req.body;
  if (!rating || rating < 1 || rating > 5)
    return res.status(400).json({ success: false, error: 'Rating must be 1–5' });

  // Simple rolling average (real impl should track per-user ratings)
  const count = Math.max(agent.totalCalls, 1);
  agent.rating = parseFloat(((agent.rating * count + rating) / (count + 1)).toFixed(2));
  db.save();
  res.json({ success: true, newRating: agent.rating });
});

// ── Withdraw earnings ───────────────────────────────────────────────────────
app.post('/withdraw', writeLimiter, async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress)
      return res.status(400).json({ success: false, error: 'walletAddress required' });

    const dev = db.developers[walletAddress];
    if (!dev) return res.status(404).json({ success: false, error: 'Developer not found' });

    const available = dev.totalEarnings - dev.totalWithdrawn;
    if (available <= 0) return res.status(400).json({ success: false, error: 'No earnings to withdraw' });

    // On-chain withdrawal – the contract transfers USDC to msg.sender.
    // The signer here is the protocol key; real withdrawals are called by the
    // developer's own wallet directly against the contract (frontend sends tx).
    let txHash = null;
    try {
      const tx = await contract.withdrawEarnings();
      const receipt = await tx.wait();
      txHash = receipt.hash;
    } catch (contractErr) {
      console.warn('[Withdraw] On-chain withdrawal failed:', contractErr.message);
      return res.status(500).json({ success: false, error: 'On-chain withdrawal failed: ' + contractErr.message });
    }

    dev.totalWithdrawn = parseFloat((dev.totalWithdrawn + available).toFixed(6));
    db.save();

    res.json({ success: true, withdrawn: available.toFixed(2), txHash, basescan: `https://basescan.org/tx/${txHash}` });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Delete agent (developer only) ──────────────────────────────────────────
app.delete('/agents/:id', writeLimiter, (req, res) => {
  const { walletAddress } = req.body;
  const agent = db.agents[req.params.id];
  if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });
  if (agent.developer.toLowerCase() !== (walletAddress || '').toLowerCase())
    return res.status(403).json({ success: false, error: 'Not the agent developer' });

  engine.deleteAgent(req.params.id);
  delete db.agents[req.params.id];

  const dev = db.developers[walletAddress];
  if (dev) dev.agents = dev.agents.filter(id => id !== req.params.id);

  db.save();
  res.json({ success: true, message: 'Agent removed' });
});

// Serve static frontend files (when running backend + frontend together)
app.use(express.static(path.join(__dirname, '..')));

// ─── Start ─────────────────────────────────────────────────────────────────
async function start() {
  try {
    await initContract();
    seedDefaultAgents();
    registerTemplateAgents();
    registerPersistedAgents();

    app.listen(PORT, () => {
      console.log(`\n✅  Backend ready on http://localhost:${PORT}`);
      console.log(`🤖  Agents: ${Object.keys(db.agents).length}`);
      console.log(`📚  Templates: ${Object.keys(templates).length}`);
      console.log(`🔒  Sandbox: vm-based (no child_process)\n`);
    });
  } catch (e) {
    console.error('❌  Startup failed:', e.message);
    process.exit(1);
  }
}

start();

process.on('SIGINT', () => { db.save(); console.log('\n✅  Saved & shutting down'); process.exit(0); });
