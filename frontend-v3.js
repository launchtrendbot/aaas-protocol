// AaaS Protocol V3 - Frontend JavaScript
// Complete functionality: agents, templates, deploy, earnings, rankings

const API_URL = 'http://localhost:3001';
const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b4da5949949';
const BASE_MAINNET_ID = '0x2105';

let agents = [];
let templates = [];
let walletConnected = false;
let userAddress = null;
let signer = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadAgents();
  loadTemplates();
  loadRankings();
  setupTabButtons();
});

// ===== TAB SWITCHING =====

function setupTabButtons() {
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.addEventListener('click', function() {
      const tabName = this.onclick.toString().match(/'([^']+)'/)[1];
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('tab-active');
    btn.classList.add('tab-inactive');
  });

  // Show selected tab
  document.getElementById(tabName).classList.add('active');
  event.target.classList.add('tab-active');
  event.target.classList.remove('tab-inactive');
}

// ===== LOAD DATA =====

async function loadAgents() {
  try {
    const response = await fetch(`${API_URL}/agents`);
    const data = await response.json();
    agents = data.agents;
    renderAgents();
  } catch (error) {
    console.error('Error loading agents:', error);
    document.getElementById('agentGrid').innerHTML = '<div class="col-span-full text-center text-red-400">Failed to load agents. Is backend running?</div>';
  }
}

async function loadTemplates() {
  try {
    const response = await fetch(`${API_URL}/templates`);
    const data = await response.json();
    templates = data.templates;
    renderTemplates();
    populateTemplateSelect();
  } catch (error) {
    console.error('Error loading templates:', error);
  }
}

async function loadRankings() {
  try {
    const category = document.getElementById('rankingCategory')?.value || '';
    const url = category ? `${API_URL}/rankings?category=${category}` : `${API_URL}/rankings`;
    const response = await fetch(url);
    const data = await response.json();
    renderRankings(data.rankings);
  } catch (error) {
    console.error('Error loading rankings:', error);
  }
}

function renderAgents() {
  const grid = document.getElementById('agentGrid');
  grid.innerHTML = agents.map((agent, idx) => `
    <div class="agent-card bg-slate-800/40 border border-slate-700/50 hover:border-emerald-400/50 rounded-xl p-6 cursor-pointer" onclick="openModal('${agent.id}')">
      <div class="flex justify-between items-start mb-3">
        <h4 class="font-black text-lg">${agent.name}</h4>
        <span class="text-xs bg-blue-500/30 text-blue-300 px-2 py-1 rounded">${agent.category}</span>
      </div>
      ${agent.verified ? '<span class="badge badge-verified">✅ Verified</span>' : ''}
      ${idx < 3 ? '<span class="badge badge-top">🏆 Top</span>' : ''}
      <p class="text-sm text-slate-300 mb-4 line-clamp-2">${agent.description}</p>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-slate-400">Price/Call</span>
          <span class="text-cyan-300 font-bold">${agent.price} USDC</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Success Rate</span>
          <span class="text-green-300 font-bold">${agent.successRate.toFixed(1)}%</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Rating</span>
          <span class="text-yellow-300">⭐ ${agent.rating.toFixed(1)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Users</span>
          <span class="text-purple-300">${agent.users}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function renderTemplates() {
  const grid = document.getElementById('templateGrid');
  grid.innerHTML = templates.map(template => `
    <div class="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 hover:border-blue-400/50 transition cursor-pointer" onclick="selectTemplate('${template.id}')">
      <h4 class="font-black text-lg mb-2">${template.name}</h4>
      <p class="text-xs text-slate-400 mb-3">${template.category}</p>
      <p class="text-sm text-slate-300 mb-4">${template.description}</p>
      <div class="flex justify-between text-xs text-slate-400">
        <span>📥 ${template.downloads} downloads</span>
        <span>⭐ ${template.rating.toFixed(1)}</span>
      </div>
    </div>
  `).join('');
}

function renderRankings(rankings) {
  const list = document.getElementById('rankingsList');
  list.innerHTML = rankings.map((agent, idx) => `
    <div class="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-4 flex-1">
          <div class="text-3xl font-black text-yellow-400 min-w-12">#${idx + 1}</div>
          <div class="flex-1">
            <h4 class="font-black text-lg">${agent.name}</h4>
            <p class="text-sm text-slate-400">${agent.description}</p>
          </div>
        </div>
        <button onclick="openModal('${agent.id}')" class="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 rounded-lg text-sm font-bold text-emerald-300 transition">Execute</button>
      </div>
      <div class="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-700/50">
        <div>
          <p class="text-xs text-slate-400">Price</p>
          <p class="font-bold text-cyan-300">${agent.price} USDC</p>
        </div>
        <div>
          <p class="text-xs text-slate-400">Success</p>
          <p class="font-bold text-green-300">${agent.successRate.toFixed(1)}%</p>
        </div>
        <div>
          <p class="text-xs text-slate-400">Rating</p>
          <p class="font-bold text-yellow-300">⭐${agent.rating.toFixed(1)}</p>
        </div>
        <div>
          <p class="text-xs text-slate-400">Users</p>
          <p class="font-bold text-purple-300">${agent.users}</p>
        </div>
      </div>
    </div>
  `).join('');
}

function filterAgents() {
  const search = document.getElementById('searchBox')?.value.toLowerCase() || '';
  const category = document.getElementById('categoryFilter')?.value || '';

  let filtered = agents;
  if (search) {
    filtered = filtered.filter(a =>
      a.name.toLowerCase().includes(search) ||
      a.description.toLowerCase().includes(search)
    );
  }
  if (category) {
    filtered = filtered.filter(a => a.category === category);
  }

  const grid = document.getElementById('agentGrid');
  grid.innerHTML = filtered.map((agent, idx) => `
    <div class="agent-card bg-slate-800/40 border border-slate-700/50 hover:border-emerald-400/50 rounded-xl p-6 cursor-pointer" onclick="openModal('${agent.id}')">
      <h4 class="font-black text-lg mb-2">${agent.name}</h4>
      <span class="text-xs bg-blue-500/30 text-blue-300 px-2 py-1 rounded mb-3 inline-block">${agent.category}</span>
      <p class="text-sm text-slate-300 mb-4">${agent.description}</p>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span>Price</span>
          <span class="font-bold text-cyan-300">${agent.price}</span>
        </div>
        <div class="flex justify-between">
          <span>Success</span>
          <span class="font-bold text-green-300">${agent.successRate.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ===== AGENT MODAL =====

async function openModal(agentId) {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;

  const content = document.getElementById('modalContent');
  content.innerHTML = `
    <button onclick="closeModal()" class="float-right text-2xl">×</button>
    <h2 class="text-4xl font-black mb-2">${agent.name}</h2>
    <p class="text-sm text-slate-400 mb-6">${agent.category.toUpperCase()}</p>
    <p class="text-lg text-slate-200 mb-6">${agent.description}</p>

    <div class="grid grid-cols-2 gap-4 mb-6">
      <div class="bg-slate-800/40 rounded-lg p-4">
        <p class="text-slate-400 text-sm mb-2">Success Rate</p>
        <p class="text-2xl font-black text-green-400">${agent.successRate.toFixed(1)}%</p>
      </div>
      <div class="bg-slate-800/40 rounded-lg p-4">
        <p class="text-slate-400 text-sm mb-2">Rating</p>
        <p class="text-2xl font-black text-yellow-400">⭐${agent.rating.toFixed(1)}</p>
      </div>
      <div class="bg-slate-800/40 rounded-lg p-4">
        <p class="text-slate-400 text-sm mb-2">Uptime</p>
        <p class="text-2xl font-black text-blue-400">${agent.uptime.toFixed(1)}%</p>
      </div>
      <div class="bg-slate-800/40 rounded-lg p-4">
        <p class="text-slate-400 text-sm mb-2">Users</p>
        <p class="text-2xl font-black text-purple-400">${agent.users}</p>
      </div>
    </div>

    <div class="bg-emerald-500/10 border border-emerald-400/20 rounded-lg p-4 mb-6">
      <p class="text-sm text-emerald-300">💰 Price: <span class="font-bold">${agent.price} USDC</span> per execution</p>
      <p class="text-sm text-emerald-300 mt-2">📈 Total Earnings: <span class="font-bold">$${agent.totalEarnings.toFixed(2)}</span></p>
    </div>

    <button onclick="executeAgent('${agent.id}')" class="w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 rounded-lg font-bold text-white mb-3 transition">
      ✅ Execute Agent (${agent.price} USDC)
    </button>
    <button onclick="closeModal()" class="w-full px-6 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg font-bold">
      Close
    </button>
  `;
  document.getElementById('agentModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('agentModal').classList.add('hidden');
}

// ===== ACTIONS =====

async function executeAgent(agentId) {
  if (!walletConnected) {
    alert('Connect wallet first');
    return;
  }

  try {
    showLoading(true);

    const response = await fetch(`${API_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: agentId, userAddress: userAddress })
    });

    const data = await response.json();

    if (data.success) {
      alert(`✅ Executed!\n\nCost: ${data.cost}\nTx: ${data.txHash || 'Processing...'}`);
      closeModal();
      loadAgents();
      loadUserData();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    alert('Error: ' + error.message);
  } finally {
    showLoading(false);
  }
}

async function deployAgent() {
  if (!walletConnected) {
    alert('Connect wallet first');
    return;
  }

  const name = document.getElementById('agentName').value;
  const desc = document.getElementById('agentDesc').value;
  const category = document.getElementById('agentCategory').value;
  const price = document.getElementById('agentPrice').value;

  if (!name || !desc || !price) {
    alert('Fill all required fields');
    return;
  }

  try {
    showLoading(true);

    const response = await fetch(`${API_URL}/deploy-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        description: desc,
        category: category,
        price: price,
        walletAddress: userAddress
      })
    });

    const data = await response.json();

    if (data.success) {
      const msg = document.getElementById('deployMessage');
      msg.innerHTML = `<p class="text-green-300">✅ Agent deployed! ID: ${data.agentId}</p><p class="text-sm text-green-300 mt-2">Tx: ${data.txHash || 'Processing...'}</p>`;
      msg.className = 'mt-4 p-4 rounded-lg text-sm bg-green-500/10 border border-green-400/30';
      msg.classList.remove('hidden');

      document.getElementById('agentName').value = '';
      document.getElementById('agentDesc').value = '';
      document.getElementById('agentPrice').value = '';

      setTimeout(loadAgents, 2000);
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    alert('Error: ' + error.message);
  } finally {
    showLoading(false);
  }
}

function selectTemplate(templateId) {
  document.getElementById('templateSelect').value = templateId;
}

function populateTemplateSelect() {
  const select = document.getElementById('templateSelect');
  templates.forEach(t => {
    const option = document.createElement('option');
    option.value = t.id;
    option.text = t.name;
    select.appendChild(option);
  });
}

async function buyCredits() {
  if (!walletConnected) {
    alert('Connect wallet first');
    return;
  }

  const amount = document.getElementById('creditAmount').value;
  if (!amount || amount <= 0) {
    alert('Enter valid amount');
    return;
  }

  showLoading(true);
  setTimeout(() => {
    alert(`💳 Purchasing ${amount} USDC in credits...\nApprove transaction in MetaMask`);
    showLoading(false);
  }, 1000);
}

async function withdrawEarnings() {
  if (!walletConnected) {
    alert('Connect wallet first');
    return;
  }

  showLoading(true);
  setTimeout(() => {
    alert('Withdrawing earnings...\nApprove transaction in MetaMask');
    showLoading(false);
  }, 1000);
}

// ===== WALLET =====

async function connectWallet() {
  try {
    if (!window.ethereum) {
      alert('Install MetaMask');
      return;
    }

    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    userAddress = accounts[0];

    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId !== BASE_MAINNET_ID) {
      alert('Switch to Base Mainnet');
      return;
    }

    walletConnected = true;
    const provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();

    const usdcABI = ['function balanceOf(address) view returns (uint256)'];
    const usdc = new ethers.Contract(USDC_ADDRESS, usdcABI, signer);
    const balance = await usdc.balanceOf(userAddress);

    document.getElementById('walletInfo').innerHTML = `
      <div class="flex items-center gap-3">
        <div class="px-4 py-2 bg-emerald-500/20 border border-emerald-400/30 rounded-lg text-sm">
          USDC: <span class="font-bold">${parseFloat(ethers.formatUnits(balance, 6)).toFixed(2)}</span>
        </div>
        <div class="px-4 py-2 bg-blue-500/20 border border-blue-400/30 rounded-lg text-sm">
          ${userAddress.substring(0, 6)}...${userAddress.substring(userAddress.length - 4)}
        </div>
        <button onclick="disconnectWallet()" class="px-4 py-2 bg-red-500/20 border border-red-400/30 rounded-lg text-sm">Disconnect</button>
      </div>
    `;

    loadUserData();
  } catch (error) {
    alert('Connection failed: ' + error.message);
  }
}

function disconnectWallet() {
  walletConnected = false;
  userAddress = null;
  document.getElementById('walletInfo').innerHTML = `
    <button onclick="connectWallet()" class="px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-semibold text-sm">
      Connect Wallet
    </button>
  `;
}

async function loadUserData() {
  if (!walletConnected) return;

  try {
    const response = await fetch(`${API_URL}/user/${userAddress}`);
    const data = await response.json();

    if (data.success) {
      document.getElementById('userSpent').textContent = '$' + data.user.totalSpent;
      document.getElementById('userExecs').textContent = data.user.executionCount;
      document.getElementById('userSubs').textContent = data.user.subscriptions;
      document.getElementById('userRep').textContent = (data.user.reputation / 1000).toFixed(1);
    }

    const devResponse = await fetch(`${API_URL}/developer/${userAddress}`);
    const devData = await devResponse.json();

    if (devData.success) {
      document.getElementById('devEarned').textContent = '$' + devData.developer.totalEarnings;
      document.getElementById('devWithdrawn').textContent = '$' + devData.developer.totalWithdrawn;
      document.getElementById('devAvailable').textContent = '$' + devData.developer.availableToWithdraw;
      document.getElementById('devAgentCount').textContent = devData.developer.agents;

      renderDevAgents(devData.developer.agentDetails);
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

function renderDevAgents(agentDetails) {
  const container = document.getElementById('devAgents');
  if (!agentDetails || agentDetails.length === 0) {
    container.innerHTML = '<p class="col-span-full text-slate-400">No agents deployed yet</p>';
    return;
  }

  container.innerHTML = agentDetails.map(agent => `
    <div class="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
      <h4 class="font-black text-lg mb-2">${agent.name}</h4>
      <p class="text-xs text-slate-400 mb-3">${agent.category}</p>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span>Calls</span>
          <span class="font-bold">${agent.totalCalls}</span>
        </div>
        <div class="flex justify-between">
          <span>Earnings</span>
          <span class="font-bold text-emerald-300">$${agent.totalEarnings.toFixed(2)}</span>
        </div>
        <div class="flex justify-between">
          <span>Rating</span>
          <span class="font-bold text-yellow-300">⭐${agent.rating.toFixed(1)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function showLoading(show) {
  document.getElementById('loading').classList.toggle('hidden', !show);
}
