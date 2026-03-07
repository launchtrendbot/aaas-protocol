/**
 * AaaS Protocol - Updated Frontend for Agent Execution
 * Now shows real agent results
 */

const API_URL = 'http://localhost:3001';

// ===== EXECUTE AGENT WITH REAL CODE =====

async function executeAgentWithRealCode(agentId, input = {}) {
  showLoading(true);
  try {
    console.log(`⚡ Executing agent: ${agentId}`);
    console.log(`📝 Input:`, input);

    const response = await fetch(`${API_URL}/execute-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: agentId,
        userAddress: userAddress,
        input: input
      })
    });

    const data = await response.json();

    if (data.success) {
      showExecutionResult(data);
      loadAgents();
      loadUserData();
      return data;
    } else {
      showError('Execution Failed', data.error);
      return null;
    }
  } catch (error) {
    showError('Execution Error', error.message);
    return null;
  } finally {
    showLoading(false);
  }
}

// ===== SHOW EXECUTION RESULT =====

function showExecutionResult(data) {
  const resultHtml = `
    <div class="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-6 mt-6">
      <h3 class="text-2xl font-black text-emerald-300 mb-4">✅ Execution Result</h3>
      
      <div class="space-y-4">
        <div class="bg-slate-900/50 rounded-lg p-4">
          <p class="text-sm text-slate-400 mb-2">Execution ID:</p>
          <p class="font-mono text-xs text-slate-300 break-all">${data.executionId}</p>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="bg-slate-900/50 rounded-lg p-4">
            <p class="text-sm text-slate-400 mb-1">Cost</p>
            <p class="text-xl font-bold text-cyan-300">${data.cost}</p>
          </div>
          <div class="bg-slate-900/50 rounded-lg p-4">
            <p class="text-sm text-slate-400 mb-1">You Earned</p>
            <p class="text-xl font-bold text-emerald-300">${data.devEarnings}</p>
          </div>
          <div class="bg-slate-900/50 rounded-lg p-4">
            <p class="text-sm text-slate-400 mb-1">Execution Time</p>
            <p class="text-xl font-bold text-purple-300">${data.executionTime}</p>
          </div>
          <div class="bg-slate-900/50 rounded-lg p-4">
            <p class="text-sm text-slate-400 mb-1">Status</p>
            <p class="text-xl font-bold text-green-300">SUCCESS</p>
          </div>
        </div>

        <div class="bg-slate-900/50 rounded-lg p-4">
          <p class="text-sm text-slate-400 mb-2">Agent Result:</p>
          <pre class="text-xs text-slate-300 overflow-auto max-h-64">
${JSON.stringify(data.result, null, 2)}
          </pre>
        </div>

        <div class="bg-slate-900/50 rounded-lg p-4">
          <p class="text-sm text-slate-400 mb-2">Transaction:</p>
          <a href="${data.basescan}" target="_blank" class="text-blue-400 hover:text-blue-300 break-all">
            ${data.txHash || 'Processing...'}
          </a>
        </div>
      </div>
    </div>
  `;

  // Show in modal or notification
  const modalContent = document.getElementById('modalContent');
  if (modalContent) {
    modalContent.innerHTML = modalContent.innerHTML + resultHtml;
  }
}

// ===== DEPLOY AGENT WITH TEMPLATE =====

async function deployAgentWithTemplate() {
  const templateId = document.getElementById('templateSelect').value;
  const name = document.getElementById('agentName').value;
  const description = document.getElementById('agentDesc').value;
  const category = document.getElementById('agentCategory').value;
  const price = document.getElementById('agentPrice').value;

  if (!name || !description || !category || !price) {
    alert('Fill all fields');
    return;
  }

  if (!walletConnected) {
    alert('Connect wallet first');
    return;
  }

  showLoading(true);
  try {
    console.log(`🚀 Deploying agent from template: ${templateId}`);

    const response = await fetch(`${API_URL}/deploy-agent-with-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        category,
        price,
        walletAddress: userAddress,
        templateId: templateId || null
      })
    });

    const data = await response.json();

    if (data.success) {
      showSuccess(
        'Agent Deployed!',
        `Your agent "${name}" is now live and executable!\n\n${data.basescan ? `Tx: ${data.basescan}` : ''}`
      );

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

// ===== EXECUTE AGENT MODAL WITH INPUTS =====

async function showAgentExecutionForm(agentId) {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;

  const modalContent = document.getElementById('modalContent');

  let inputForm = '';

  // Different input forms based on agent category
  if (agent.category === 'data') {
    // Text input for sentiment analyzer, etc
    inputForm = `
      <div class="mb-6">
        <label class="text-sm text-blue-300 block mb-2">Enter Text to Analyze:</label>
        <textarea id="agentInput" class="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-400" rows="4" placeholder="Enter text to analyze..."></textarea>
      </div>
    `;
  } else if (agent.category === 'trading') {
    // Price array for price predictor
    inputForm = `
      <div class="mb-6">
        <label class="text-sm text-blue-300 block mb-2">Price Data (comma-separated):</label>
        <input type="text" id="agentInput" class="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-400" placeholder="100, 102, 101, 103, 104...">
      </div>
    `;
  } else if (agent.category === 'defi') {
    // Numeric inputs for liquidation detector
    inputForm = `
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div>
          <label class="text-sm text-blue-300 block mb-2">Collateral:</label>
          <input type="number" id="agentInput1" class="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white" placeholder="10" step="0.01">
        </div>
        <div>
          <label class="text-sm text-blue-300 block mb-2">Borrowed:</label>
          <input type="number" id="agentInput2" class="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white" placeholder="5" step="0.01">
        </div>
        <div>
          <label class="text-sm text-blue-300 block mb-2">Price:</label>
          <input type="number" id="agentInput3" class="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white" placeholder="100" step="0.01">
        </div>
      </div>
    `;
  } else {
    inputForm = `
      <div class="mb-6">
        <label class="text-sm text-blue-300 block mb-2">Input Data (JSON):</label>
        <textarea id="agentInput" class="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-400" rows="4" placeholder='{"key": "value"}'></textarea>
      </div>
    `;
  }

  modalContent.innerHTML = `
    <button onclick="closeModal()" class="float-right text-2xl">×</button>
    <h2 class="text-4xl font-black mb-2">${agent.name}</h2>
    <p class="text-sm text-slate-400 mb-6">${agent.description}</p>

    <div class="bg-blue-500/10 border border-blue-400/20 rounded-lg p-4 mb-6">
      <p class="text-blue-300"><strong>⚡ This agent executes real code!</strong></p>
      <p class="text-sm text-slate-300 mt-2">Your input will be processed by the agent and return real results.</p>
    </div>

    ${inputForm}

    <button onclick="executeAgentFromModal('${agentId}')" class="w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 rounded-lg font-bold text-white mb-3 transition">
      ⚡ Execute Agent (${agent.price} USDC)
    </button>
  `;

  document.getElementById('agentModal').classList.remove('hidden');
}

// ===== EXECUTE FROM MODAL =====

async function executeAgentFromModal(agentId) {
  const agent = agents.find(a => a.id === agentId);

  let input = {};

  if (agent.category === 'data') {
    const text = document.getElementById('agentInput').value;
    input = { text };
  } else if (agent.category === 'trading') {
    const priceStr = document.getElementById('agentInput').value;
    const prices = priceStr.split(',').map(p => parseFloat(p.trim()));
    input = { prices };
  } else if (agent.category === 'defi') {
    input = {
      collateral: parseFloat(document.getElementById('agentInput1').value),
      borrowed: parseFloat(document.getElementById('agentInput2').value),
      price: parseFloat(document.getElementById('agentInput3').value)
    };
  } else {
    try {
      input = JSON.parse(document.getElementById('agentInput').value);
    } catch (e) {
      alert('Invalid JSON input');
      return;
    }
  }

  await executeAgentWithRealCode(agentId, input);
}

// ===== LOAD TEMPLATES =====

async function loadTemplates() {
  try {
    const response = await fetch(`${API_URL}/templates`);
    const data = await response.json();

    const select = document.getElementById('templateSelect');
    data.templates.forEach(template => {
      const option = document.createElement('option');
      option.value = template.id;
      option.text = `${template.name} (${template.price} USDC/call)`;
      select.appendChild(option);
    });

    // Show templates
    renderTemplates(data.templates);
  } catch (error) {
    console.error('Error loading templates:', error);
  }
}

function renderTemplates(templatesList) {
  const container = document.getElementById('templateGrid');
  if (!container) return;

  container.innerHTML = templatesList.map(template => `
    <div class="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 hover:border-blue-400/50 cursor-pointer transition" onclick="selectTemplateAndShow('${template.id}')">
      <h4 class="font-black text-lg mb-2">${template.name}</h4>
      <p class="text-xs text-slate-400 mb-3">${template.category}</p>
      <p class="text-sm text-slate-300 mb-4">${template.description}</p>
      <div class="flex justify-between text-xs">
        <span class="text-slate-400">Price: ${template.price} USDC</span>
        <span class="text-green-400">Ready to use</span>
      </div>
    </div>
  `).join('');
}

function selectTemplateAndShow(templateId) {
  document.getElementById('templateSelect').value = templateId;
  switchTab('deploy');
}

// ===== HELPER FUNCTIONS =====

function showLoading(show) {
  document.getElementById('loading').classList.toggle('hidden', !show);
}

function showError(title, message) {
  alert(`${title}\n\n${message}`);
}

function showSuccess(title, message) {
  alert(`${title}\n\n${message}`);
}

// ===== INITIALIZE =====

document.addEventListener('DOMContentLoaded', () => {
  loadTemplates();
  loadAgents();
  loadRankings();
});
