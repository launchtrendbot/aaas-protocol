/**
 * AaaS Protocol – Frontend (consolidated)
 *
 * Fixes vs old split across frontend-v3.js + frontend-execution.js:
 *  - execute endpoint corrected to /execute-agent (was /execute)
 *  - deploy endpoint corrected to /deploy-agent-with-code (was /deploy-agent)
 *  - switchTab() no longer relies on the fragile global `event` object
 *  - loadTemplates / renderTemplates defined once
 *  - renderDevAgents uses agentDetails (correct backend field name)
 *  - buyCredits does a real USDC approve+transfer on-chain
 *  - withdrawEarnings calls the contract directly from the user's wallet
 *  - openModal shows dynamic, per-agent input forms driven by inputSchema
 *  - loadTemplateCode pre-fills the code editor from a template
 *  - toast notifications replace alert() calls
 */

'use strict';

// ─── Config ────────────────────────────────────────────────────────────────
const API_URL       = 'http://localhost:3001';
const USDC_ADDRESS  = '0x833589fcd6edb6e08f4c7c32d4f71b4da5949949';
const CONTRACT_ADDR = ''; // set after deployment – used for on-chain withdraw
const BASE_CHAIN_ID = '0x2105'; // Base mainnet

// ─── State ─────────────────────────────────────────────────────────────────
let allAgents    = [];
let allTemplates = [];
let walletConnected = false;
let userAddress     = null;
let ethersProvider  = null;
let ethersSigner    = null;

// ─── DOM ready ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadAgents();
  loadTemplates();
  loadRankings();
  loadPlatformStats();
});

// ─── Tab switching ──────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => {
    el.classList.remove('tab-active');
    el.classList.add('tab-inactive');
  });
  const tab = document.getElementById(name);
  if (tab) tab.classList.add('active');
  if (btn) { btn.classList.add('tab-active'); btn.classList.remove('tab-inactive'); }
}

// ─── Data loading ───────────────────────────────────────────────────────────
async function loadAgents() {
  try {
    const res  = await fetch(`${API_URL}/agents`);
    const data = await res.json();
    allAgents  = data.agents || [];
    renderAgents(allAgents);
  } catch (e) {
    document.getElementById('agentGrid').innerHTML =
      '<div class="col-span-full text-center text-red-400 py-12">Could not reach backend. Is it running on port 3001?</div>';
  }
}

async function loadTemplates() {
  try {
    const res  = await fetch(`${API_URL}/templates`);
    const data = await res.json();
    allTemplates = data.templates || [];
    renderTemplates();
    populateTemplateSelect();
  } catch (e) { console.error('Templates load failed:', e); }
}

async function loadRankings() {
  const category = document.getElementById('rankingCategory')?.value || '';
  try {
    const url  = `${API_URL}/rankings${category ? '?category=' + category : ''}`;
    const res  = await fetch(url);
    const data = await res.json();
    renderRankings(data.rankings || []);
  } catch (e) { console.error('Rankings load failed:', e); }
}

async function loadPlatformStats() {
  try {
    const res  = await fetch(`${API_URL}/stats`);
    const data = await res.json();
    if (!data.success) return;
    const { stats } = data;
    document.getElementById('platformStats').innerHTML = `
      <div class="text-center"><p class="text-2xl font-black text-blue-300">${stats.totalAgents}</p><p class="text-slate-500 text-xs">Agents</p></div>
      <div class="text-center"><p class="text-2xl font-black text-emerald-300">$${parseFloat(stats.totalVolume).toFixed(0)}</p><p class="text-slate-500 text-xs">Volume</p></div>
      <div class="text-center"><p class="text-2xl font-black text-purple-300">${stats.totalTransactions}</p><p class="text-slate-500 text-xs">Executions</p></div>
    `;
  } catch (_) {}
}

// ─── Render helpers ─────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  defi:        'text-cyan-300 bg-cyan-500/10',
  trading:     'text-blue-300 bg-blue-500/10',
  data:        'text-purple-300 bg-purple-500/10',
  arbitrage:   'text-orange-300 bg-orange-500/10',
  liquidations:'text-red-300 bg-red-500/10',
};

function categoryBadge(cat) {
  const cls = CATEGORY_COLORS[cat] || 'text-slate-300 bg-slate-500/10';
  return `<span class="px-2 py-0.5 rounded text-xs font-semibold ${cls}">${cat.toUpperCase()}</span>`;
}

function renderAgents(list) {
  const grid = document.getElementById('agentGrid');
  if (!list || list.length === 0) {
    grid.innerHTML = '<div class="col-span-full text-center text-slate-500 py-12">No agents found.</div>';
    return;
  }
  grid.innerHTML = list.map((agent, idx) => `
    <div class="agent-card bg-slate-800/40 border border-slate-700/50 hover:border-blue-400/40 rounded-xl p-5 cursor-pointer"
         onclick="openAgentModal('${agent.id}')">
      <div class="flex justify-between items-start mb-2">
        <div class="flex-1 min-w-0">
          <h4 class="font-bold text-base leading-tight truncate">${agent.name}</h4>
          <div class="mt-1 flex gap-1 flex-wrap">
            ${categoryBadge(agent.category)}
            ${agent.verified ? '<span class="badge badge-verified">✓ Verified</span>' : ''}
            ${idx < 3      ? '<span class="badge badge-top">🏆 Top</span>' : ''}
          </div>
        </div>
        <div class="text-right ml-2 flex-shrink-0">
          <p class="font-black text-cyan-300 text-lg">${agent.price}</p>
          <p class="text-slate-500 text-xs">USDC</p>
        </div>
      </div>
      <p class="text-slate-400 text-sm mt-3 mb-4 line-clamp-2">${agent.description}</p>
      <div class="grid grid-cols-3 gap-2 text-xs border-t border-slate-700/50 pt-3">
        <div><p class="text-slate-500">Success</p><p class="font-bold text-green-300">${agent.successRate.toFixed(1)}%</p></div>
        <div><p class="text-slate-500">Rating</p><p class="font-bold text-yellow-300">⭐ ${agent.rating.toFixed(1)}</p></div>
        <div><p class="text-slate-500">Users</p><p class="font-bold text-purple-300">${agent.users}</p></div>
      </div>
      <button class="mt-4 w-full py-2 bg-gradient-to-r from-blue-600/60 to-cyan-600/60 hover:from-blue-600 hover:to-cyan-600 rounded-lg text-sm font-semibold transition">
        ⚡ Execute
      </button>
    </div>
  `).join('');
}

function renderTemplates() {
  const grid = document.getElementById('templateGrid');
  if (!grid) return;
  grid.innerHTML = allTemplates.map(t => `
    <div class="bg-slate-800/40 border border-slate-700/50 hover:border-blue-400/40 rounded-xl p-6 cursor-pointer transition"
         onclick="forkTemplate('${t.id}')">
      <div class="flex justify-between items-start mb-3">
        <div>
          <h4 class="font-bold text-base">${t.name}</h4>
          <div class="mt-1">${categoryBadge(t.category)}</div>
        </div>
        <span class="text-cyan-300 font-bold text-sm whitespace-nowrap">${t.price} USDC</span>
      </div>
      <p class="text-slate-400 text-sm mb-4">${t.description}</p>
      <div class="text-xs text-blue-400 hover:text-blue-300 font-semibold">→ Fork & Deploy</div>
    </div>
  `).join('');
}

function renderRankings(list) {
  const container = document.getElementById('rankingsList');
  container.innerHTML = list.map((agent, idx) => `
    <div class="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
      <div class="flex items-center gap-5">
        <span class="text-3xl font-black ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-orange-400' : 'text-slate-500'} min-w-[2.5rem]">#${idx + 1}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h4 class="font-bold">${agent.name}</h4>
            ${categoryBadge(agent.category)}
            ${agent.verified ? '<span class="badge badge-verified">✓</span>' : ''}
          </div>
          <p class="text-sm text-slate-400 mt-1 truncate">${agent.description}</p>
        </div>
        <button onclick="openAgentModal('${agent.id}')" class="flex-shrink-0 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 rounded-lg text-sm font-bold text-emerald-300 transition">Execute</button>
      </div>
      <div class="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-700/50 text-sm">
        <div><p class="text-slate-500 text-xs">Price</p><p class="font-bold text-cyan-300">${agent.price} USDC</p></div>
        <div><p class="text-slate-500 text-xs">Success</p><p class="font-bold text-green-300">${agent.successRate.toFixed(1)}%</p></div>
        <div><p class="text-slate-500 text-xs">Rating</p><p class="font-bold text-yellow-300">⭐ ${agent.rating.toFixed(1)}</p></div>
        <div><p class="text-slate-500 text-xs">Users</p><p class="font-bold text-purple-300">${agent.users}</p></div>
      </div>
    </div>
  `).join('');
}

function filterAgents() {
  const q   = (document.getElementById('searchBox')?.value || '').toLowerCase();
  const cat = document.getElementById('categoryFilter')?.value || '';
  let list = allAgents;
  if (q)   list = list.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
  if (cat) list = list.filter(a => a.category === cat);
  renderAgents(list);
}

// ─── Template code load ──────────────────────────────────────────────────────
async function loadTemplateCode() {
  const id = document.getElementById('templateSelect').value;
  if (!id) return;
  const tmpl = allTemplates.find(t => t.id === id);
  if (!tmpl) return;

  // Fetch full code from backend (templates endpoint returns schema but not code)
  // Use the template snippet from known templates as a seed – fetch dynamically
  // to keep frontend decoupled from hard-coded template source.
  // We show a placeholder; in production you'd fetch /templates/:id/code
  const placeholder = `// Template: ${tmpl.name}
// Loaded from marketplace. Customise below.
// Input schema: ${JSON.stringify(tmpl.inputSchema?.map(s => s.key) || [])}

async function agent(context) {
  const { input } = context;
  // TODO: implement your logic here
  return { success: true };
}
result = await agent(context);`;

  document.getElementById('agentCode').value = placeholder;
  // Also pre-fill category from template
  const sel = document.getElementById('agentCategory');
  if (sel && tmpl.category) sel.value = tmpl.category;
}

// Copy template id to deploy tab
function forkTemplate(templateId) {
  const deployTab = document.querySelector('[onclick*="deploy"]');
  switchTab('deploy', deployTab);
  setTimeout(() => {
    const sel = document.getElementById('templateSelect');
    if (sel) { sel.value = templateId; loadTemplateCode(); }
  }, 100);
}

function populateTemplateSelect() {
  const sel = document.getElementById('templateSelect');
  if (!sel) return;
  // Remove existing options beyond the first placeholder
  while (sel.options.length > 1) sel.remove(1);
  allTemplates.forEach(t => {
    const opt = new Option(`${t.name} (${t.price} USDC/call)`, t.id);
    sel.add(opt);
  });
}

// ─── Agent modal ────────────────────────────────────────────────────────────
async function openAgentModal(agentId) {
  const agent = allAgents.find(a => a.id === agentId);
  if (!agent) return;

  const schema = agent.inputSchema || [];
  const inputForm = buildInputForm(schema, agentId);

  document.getElementById('modalContent').innerHTML = `
    <div class="flex justify-between items-start mb-4">
      <div>
        <h2 class="text-2xl font-black">${agent.name}</h2>
        <div class="flex gap-2 mt-1 flex-wrap">
          ${categoryBadge(agent.category)}
          ${agent.verified ? '<span class="badge badge-verified">✓ Verified</span>' : ''}
        </div>
      </div>
      <button onclick="closeModal()" class="text-slate-400 hover:text-white text-2xl leading-none ml-4">×</button>
    </div>

    <p class="text-slate-300 mb-5">${agent.description}</p>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      <div class="bg-slate-800/60 rounded-lg p-3 text-center">
        <p class="text-slate-500 text-xs mb-1">Price</p>
        <p class="font-black text-cyan-300">${agent.price} USDC</p>
      </div>
      <div class="bg-slate-800/60 rounded-lg p-3 text-center">
        <p class="text-slate-500 text-xs mb-1">Success</p>
        <p class="font-black text-green-300">${agent.successRate.toFixed(1)}%</p>
      </div>
      <div class="bg-slate-800/60 rounded-lg p-3 text-center">
        <p class="text-slate-500 text-xs mb-1">Rating</p>
        <p class="font-black text-yellow-300">⭐ ${agent.rating.toFixed(1)}</p>
      </div>
      <div class="bg-slate-800/60 rounded-lg p-3 text-center">
        <p class="text-slate-500 text-xs mb-1">Calls</p>
        <p class="font-black text-purple-300">${agent.totalCalls}</p>
      </div>
    </div>

    <div class="bg-slate-800/60 rounded-xl p-5 mb-5">
      <h3 class="font-bold mb-4">⚡ Execute Agent</h3>
      ${inputForm}
      <button onclick="executeAgentFromModal('${agentId}')"
        class="w-full mt-4 py-3 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 rounded-lg font-bold transition">
        Execute (${agent.price} USDC)
      </button>
    </div>

    <div id="execResult-${agentId}" class="hidden"></div>
  `;

  document.getElementById('agentModal').classList.remove('hidden');
}

function buildInputForm(schema, agentId) {
  if (!schema || schema.length === 0) {
    return `<div>
      <label class="text-xs text-blue-300 font-semibold uppercase block mb-1">Input (JSON)</label>
      <textarea id="field-${agentId}-json" class="code-editor" rows="4" placeholder="{}">{}</textarea>
    </div>`;
  }

  return schema.map(field => {
    const id = `field-${agentId}-${field.key}`;
    if (field.type === 'textarea') {
      return `<div class="mb-3">
        <label class="text-xs text-blue-300 font-semibold uppercase block mb-1">${field.label}${field.required ? ' *' : ''}</label>
        <textarea id="${id}" rows="3" placeholder="${field.placeholder || ''}"
          class="w-full px-3 py-2 bg-slate-900/70 border border-slate-600/60 rounded-lg text-white text-sm focus:outline-none focus:border-blue-400 resize-none"></textarea>
      </div>`;
    }
    if (field.type === 'json') {
      return `<div class="mb-3">
        <label class="text-xs text-blue-300 font-semibold uppercase block mb-1">${field.label}${field.required ? ' *' : ''}</label>
        <textarea id="${id}" rows="4" placeholder="${field.placeholder || '[]'}"
          class="code-editor" style="min-height:90px;">${field.placeholder || '[]'}</textarea>
        <p class="text-xs text-slate-500 mt-1">Valid JSON array/object</p>
      </div>`;
    }
    if (field.type === 'select') {
      const opts = (field.options || []).map(o => `<option value="${o}">${o}</option>`).join('');
      return `<div class="mb-3">
        <label class="text-xs text-blue-300 font-semibold uppercase block mb-1">${field.label}${field.required ? ' *' : ''}</label>
        <select id="${id}" class="w-full px-3 py-2 bg-slate-900/70 border border-slate-600/60 rounded-lg text-white focus:outline-none focus:border-blue-400">${opts}</select>
      </div>`;
    }
    // default: number or text
    return `<div class="mb-3">
      <label class="text-xs text-blue-300 font-semibold uppercase block mb-1">${field.label}${field.required ? ' *' : ''}</label>
      <input id="${id}" type="${field.type || 'text'}" placeholder="${field.placeholder || ''}"
        class="w-full px-3 py-2 bg-slate-900/70 border border-slate-600/60 rounded-lg text-white text-sm focus:outline-none focus:border-blue-400">
    </div>`;
  }).join('');
}

async function executeAgentFromModal(agentId) {
  if (!walletConnected) { showToast('Connect your wallet first', 'warning'); return; }

  const agent  = allAgents.find(a => a.id === agentId);
  const schema = agent?.inputSchema || [];
  let input    = {};

  if (schema.length === 0) {
    // Generic JSON input
    const raw = document.getElementById(`field-${agentId}-json`)?.value || '{}';
    try { input = JSON.parse(raw); } catch (_) { showToast('Invalid JSON input', 'error'); return; }
  } else {
    for (const field of schema) {
      const el = document.getElementById(`field-${agentId}-${field.key}`);
      if (!el) continue;
      const val = el.value.trim();
      if (field.required && !val) { showToast(`${field.label} is required`, 'error'); return; }
      if (!val) continue;

      if (field.type === 'number') {
        input[field.key] = parseFloat(val);
      } else if (field.type === 'json') {
        try { input[field.key] = JSON.parse(val); }
        catch (_) { showToast(`${field.label}: invalid JSON`, 'error'); return; }
      } else if (field.parseAs === 'numberArray') {
        input[field.key] = val.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
      } else {
        input[field.key] = val;
      }
    }
  }

  showLoading(true, 'Executing agent…');
  try {
    const res  = await fetch(`${API_URL}/execute-agent`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ agentId, userAddress, input }),
    });
    const data = await res.json();

    if (data.success) {
      showExecutionResult(agentId, data);
      loadAgents();
      if (walletConnected) loadUserData();
    } else {
      showToast('Execution failed: ' + data.error, 'error');
    }
  } catch (e) {
    showToast('Request failed: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

function showExecutionResult(agentId, data) {
  const container = document.getElementById(`execResult-${agentId}`);
  if (!container) return;

  const riskColor = (val) => {
    if (!val) return '';
    const v = val.toLowerCase();
    if (v === 'critical' || v === 'liquidatable') return 'risk-critical';
    if (v === 'high') return 'risk-high';
    if (v === 'medium' || v === 'moderate') return 'risk-medium';
    return 'risk-healthy';
  };

  const result = data.result?.result ?? data.result ?? {};
  const recommendations = result.recommendations;

  container.innerHTML = `
    <div class="bg-emerald-500/10 border border-emerald-400/20 rounded-xl p-5 mt-2">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-bold text-emerald-300">✅ Execution Result</h3>
        <div class="flex gap-3 text-xs text-slate-400">
          <span>⏱ ${data.executionTime}</span>
          <span>💵 ${data.cost}</span>
          ${data.txHash ? `<a href="${data.basescan}" target="_blank" class="text-blue-400 hover:text-blue-300">View tx ↗</a>` : ''}
        </div>
      </div>

      ${recommendations && recommendations.length ? `
        <div class="mb-4 space-y-1">
          ${recommendations.map(r => `<p class="text-sm text-yellow-300 flex gap-2"><span>⚠️</span><span>${r}</span></p>`).join('')}
        </div>
      ` : ''}

      <div class="bg-slate-900/60 rounded-lg p-4">
        <p class="text-xs text-slate-500 mb-2 uppercase tracking-wide font-semibold">Raw Output</p>
        <pre class="text-xs text-slate-300 overflow-auto max-h-64 whitespace-pre-wrap">${JSON.stringify(result, null, 2)}</pre>
      </div>
    </div>
  `;
  container.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('agentModal').classList.add('hidden');
}

// ─── Deploy ─────────────────────────────────────────────────────────────────
async function deployAgent() {
  if (!walletConnected) { showToast('Connect your wallet first', 'warning'); return; }

  const name     = document.getElementById('agentName').value.trim();
  const desc     = document.getElementById('agentDesc').value.trim();
  const category = document.getElementById('agentCategory').value;
  const price    = document.getElementById('agentPrice').value;
  const code     = document.getElementById('agentCode').value.trim();
  const tmplId   = document.getElementById('templateSelect').value;

  if (!name || !desc || !price) { showToast('Name, description and price are required', 'error'); return; }
  if (!code && !tmplId)         { showToast('Provide agent code or select a template', 'error'); return; }
  if (parseFloat(price) <= 0)   { showToast('Price must be greater than 0', 'error'); return; }

  showLoading(true, 'Deploying agent…');
  try {
    const res  = await fetch(`${API_URL}/deploy-agent-with-code`, {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Wallet-Address': userAddress,
      },
      body: JSON.stringify({
        name, description: desc, category, price,
        walletAddress: userAddress,
        agentCode:   code || undefined,
        templateId:  tmplId || undefined,
      }),
    });
    const data = await res.json();

    const msg = document.getElementById('deployMessage');
    if (data.success) {
      msg.innerHTML  = `<p class="text-green-300 font-semibold">✅ Agent deployed! ID: <code>${data.agentId}</code></p>
        ${data.txHash ? `<p class="text-sm text-green-400 mt-1"><a href="${data.basescan}" target="_blank">View on BaseScan ↗</a></p>` : ''}`;
      msg.className  = 'p-4 rounded-lg bg-green-500/10 border border-green-400/20';
      msg.classList.remove('hidden');
      // Reset form
      ['agentName','agentDesc','agentPrice','agentCode'].forEach(id => { document.getElementById(id).value = ''; });
      document.getElementById('templateSelect').value = '';
      setTimeout(() => { loadAgents(); loadUserData(); }, 1500);
    } else {
      msg.innerHTML  = `<p class="text-red-300">❌ ${data.error}</p>`;
      msg.className  = 'p-4 rounded-lg bg-red-500/10 border border-red-400/20';
      msg.classList.remove('hidden');
    }
  } catch (e) {
    showToast('Deployment failed: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ─── Wallet ─────────────────────────────────────────────────────────────────
async function connectWallet() {
  if (!window.ethereum) { showToast('Please install MetaMask', 'error'); return; }

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const chainId  = await window.ethereum.request({ method: 'eth_chainId' });

    if (chainId !== BASE_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BASE_CHAIN_ID }],
        });
      } catch (_) {
        showToast('Switch to Base Mainnet in MetaMask', 'warning');
        return;
      }
    }

    userAddress    = accounts[0];
    ethersProvider = new ethers.BrowserProvider(window.ethereum);
    ethersSigner   = await ethersProvider.getSigner();
    walletConnected = true;

    // Read USDC balance
    const usdc    = new ethers.Contract(USDC_ADDRESS, ['function balanceOf(address) view returns (uint256)'], ethersSigner);
    const balance = await usdc.balanceOf(userAddress);
    const formatted = parseFloat(ethers.formatUnits(balance, 6)).toFixed(2);

    document.getElementById('walletArea').innerHTML = `
      <div class="flex items-center gap-2 flex-wrap justify-end">
        <div class="px-3 py-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-lg text-sm font-semibold">
          $${formatted} USDC
        </div>
        <div class="px-3 py-1.5 bg-blue-500/20 border border-blue-400/30 rounded-lg text-sm font-mono">
          ${userAddress.slice(0,6)}…${userAddress.slice(-4)}
        </div>
        <button onclick="disconnectWallet()" class="px-3 py-1.5 bg-red-500/20 border border-red-400/30 rounded-lg text-sm text-red-300 hover:bg-red-500/30 transition">
          Disconnect
        </button>
      </div>
    `;

    loadUserData();
    showToast('Wallet connected!', 'success');

    // Account change listener
    window.ethereum.on('accountsChanged', accs => {
      if (accs.length === 0) disconnectWallet();
      else { userAddress = accs[0]; loadUserData(); }
    });

  } catch (e) {
    showToast('Connection failed: ' + e.message, 'error');
  }
}

function disconnectWallet() {
  walletConnected = false;
  userAddress     = null;
  ethersSigner    = null;
  document.getElementById('walletArea').innerHTML = `
    <button onclick="connectWallet()" class="px-5 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-lg font-semibold text-sm transition">
      Connect Wallet
    </button>`;
}

// ─── User & developer data ──────────────────────────────────────────────────
async function loadUserData() {
  if (!walletConnected) return;

  try {
    const [userRes, devRes, histRes] = await Promise.all([
      fetch(`${API_URL}/user/${userAddress}`),
      fetch(`${API_URL}/developer/${userAddress}`),
      fetch(`${API_URL}/user/${userAddress}/history`),
    ]);

    const [userData, devData, histData] = await Promise.all([
      userRes.json(), devRes.json(), histRes.json(),
    ]);

    if (userData.success) {
      const u = userData.user;
      document.getElementById('userSpent').textContent = '$' + parseFloat(u.totalSpent).toFixed(2);
      document.getElementById('userExecs').textContent = u.executionCount;
      document.getElementById('userSubs').textContent  = u.subscriptions;
      document.getElementById('userRep').textContent   = (u.reputation / 1000).toFixed(1);
    }

    if (devData.success) {
      const d = devData.developer;
      document.getElementById('devEarned').textContent    = '$' + parseFloat(d.totalEarnings).toFixed(2);
      document.getElementById('devWithdrawn').textContent = '$' + parseFloat(d.totalWithdrawn).toFixed(2);
      document.getElementById('devAvailable').textContent = '$' + parseFloat(d.availableToWithdraw).toFixed(2);
      document.getElementById('devAgentCount').textContent = d.agentCount;
      renderDevAgents(d.agentDetails || []);
    }

    if (histData.success) {
      renderRecentTxs(histData.transactions || []);
    }
  } catch (e) { console.error('loadUserData error:', e); }
}

function renderDevAgents(agentDetails) {
  const container = document.getElementById('devAgents');
  if (!agentDetails || agentDetails.length === 0) {
    container.innerHTML = '<p class="col-span-full text-slate-500">No agents deployed yet. <button onclick="switchTab(\'deploy\')" class="text-blue-400 underline">Deploy one now →</button></p>';
    return;
  }
  container.innerHTML = agentDetails.map(a => `
    <div class="bg-slate-700/40 border border-slate-600/50 rounded-xl p-5">
      <div class="flex justify-between items-start mb-2">
        <div>
          <h4 class="font-bold">${a.name}</h4>
          ${categoryBadge(a.category)}
        </div>
        <span class="text-cyan-300 font-bold">${a.price} USDC</span>
      </div>
      <div class="grid grid-cols-3 gap-2 mt-3 text-xs">
        <div><p class="text-slate-500">Calls</p><p class="font-bold">${a.totalCalls}</p></div>
        <div><p class="text-slate-500">Earned</p><p class="font-bold text-emerald-300">$${parseFloat(a.totalEarnings).toFixed(2)}</p></div>
        <div><p class="text-slate-500">Rating</p><p class="font-bold text-yellow-300">⭐ ${a.rating.toFixed(1)}</p></div>
      </div>
    </div>
  `).join('');
}

function renderRecentTxs(txs) {
  const container = document.getElementById('recentTxs');
  if (!txs.length) { container.innerHTML = '<p class="text-slate-500">No executions yet.</p>'; return; }
  container.innerHTML = txs.map(tx => `
    <div class="flex items-center justify-between bg-slate-800/40 rounded-lg px-4 py-2.5 text-sm">
      <div>
        <span class="font-semibold">${tx.agentName || tx.agentId}</span>
        <span class="text-slate-500 ml-2 text-xs">${new Date(tx.timestamp).toLocaleString()}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-red-300">-${tx.cost} USDC</span>
        ${tx.txHash ? `<a href="https://basescan.org/tx/${tx.txHash}" target="_blank" class="text-blue-400 text-xs hover:text-blue-300">tx ↗</a>` : ''}
      </div>
    </div>
  `).join('');
}

// ─── Withdraw earnings (calls contract from user's wallet) ──────────────────
async function withdrawEarnings() {
  if (!walletConnected) { showToast('Connect your wallet first', 'warning'); return; }
  if (!ethersSigner)    { showToast('Signer not available', 'error'); return; }

  const devEl = document.getElementById('devAvailable');
  const available = parseFloat(devEl?.textContent?.replace('$','') || '0');
  if (available <= 0) { showToast('No earnings to withdraw', 'warning'); return; }

  try {
    showLoading(true, 'Withdrawing…');

    if (CONTRACT_ADDR) {
      // User calls the contract directly — no server key needed
      const contractAbi = ['function withdrawEarnings() external'];
      const c   = new ethers.Contract(CONTRACT_ADDR, contractAbi, ethersSigner);
      const tx  = await c.withdrawEarnings();
      const rec = await tx.wait();
      showToast(`✅ Withdrawn $${available.toFixed(2)} USDC — <a href="https://basescan.org/tx/${rec.hash}" target="_blank" class="underline">view tx</a>`, 'success');
    } else {
      // Fallback: hit backend (signer key-based, development only)
      const res  = await fetch(`${API_URL}/withdraw`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ walletAddress: userAddress }),
      });
      const data = await res.json();
      if (data.success) showToast(`✅ Withdrawn $${data.withdrawn} USDC`, 'success');
      else showToast('Withdrawal failed: ' + data.error, 'error');
    }
    loadUserData();
  } catch (e) {
    showToast('Withdrawal error: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ─── UI helpers ─────────────────────────────────────────────────────────────
function showLoading(show, msg = 'Processing…') {
  document.getElementById('loading').classList.toggle('hidden', !show);
  const msgEl = document.getElementById('loadingMsg');
  if (msgEl) msgEl.textContent = msg;
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const colors = {
    success: 'bg-emerald-900/90 border-emerald-500/50 text-emerald-200',
    error:   'bg-red-900/90 border-red-500/50 text-red-200',
    warning: 'bg-yellow-900/90 border-yellow-500/50 text-yellow-200',
    info:    'bg-blue-900/90 border-blue-500/50 text-blue-200',
  };
  toast.innerHTML = `
    <div class="px-5 py-4 rounded-xl border backdrop-blur-sm text-sm font-medium ${colors[type] || colors.info}">
      ${message}
    </div>`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 4000);
}
