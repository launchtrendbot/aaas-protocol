const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class AgentExecutionEngine {
  constructor(config = {}) {
    this.config = {
      sandboxPath: config.sandboxPath || path.join(__dirname, 'sandbox'),
      timeout: config.timeout || 30000,
      maxMemory: config.maxMemory || 512,
      ...config
    };

    this.agents = {};
    this.executionHistory = [];
    this.initializeSandbox();
  }

  initializeSandbox() {
    if (!fs.existsSync(this.config.sandboxPath)) {
      fs.mkdirSync(this.config.sandboxPath, { recursive: true });
    }
  }

  registerAgent(agentId, agentCode, agentMetadata = {}) {
    try {
      if (!this.validateCode(agentCode)) {
        throw new Error('Invalid agent code');
      }

      const agentPath = path.join(this.config.sandboxPath, `${agentId}.js`);
      const wrappedCode = this.wrapCode(agentCode);
      fs.writeFileSync(agentPath, wrappedCode);

      this.agents[agentId] = {
        id: agentId,
        path: agentPath,
        code: agentCode,
        metadata: agentMetadata,
        registeredAt: new Date().toISOString(),
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        avgExecutionTime: 0
      };

      console.log(`✅ Agent registered: ${agentId}`);
      return { success: true, agentId };
    } catch (err) {
      console.error(`❌ Agent registration failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  validateCode(code) {
    const forbidden = [
      'require(',
      'eval(',
      'exec(',
      'spawn(',
      'fork(',
      'child_process',
      'fs.writeFile',
      'fs.unlink',
      'process.exit',
      'global.',
      '__dirname',
      '__filename'
    ];

    for (const pattern of forbidden) {
      if (code.includes(pattern)) {
        console.warn(`⚠️  Forbidden pattern detected: ${pattern}`);
        return false;
      }
    }

    return true;
  }

  wrapCode(agentCode) {
    return `
(async function() {
  try {
    const context = {
      data: {},
      state: {},
      memory: {},
      log: function(msg) {
        console.log('[AGENT LOG]', msg);
      }
    };

    ${agentCode}

    if (typeof agent === 'function') {
      return await agent(context);
    } else if (typeof result !== 'undefined') {
      return result;
    } else {
      return { success: true, executed: true };
    }
  } catch (error) {
    console.error('[AGENT ERROR]', error.message);
    return { success: false, error: error.message };
  }
})();
`;
  }

  async executeAgent(agentId, input = {}, timeout = null) {
    try {
      const agent = this.agents[agentId];
      if (!agent) {
        throw new Error('Agent not found');
      }

      const executionId = uuidv4();
      const startTime = Date.now();

      const execScript = this.createExecutionScript(agent.path, input);
      const scriptPath = path.join(this.config.sandboxPath, `exec-${executionId}.js`);
      fs.writeFileSync(scriptPath, execScript);

      const result = await this.runInSandbox(
        scriptPath,
        timeout || this.config.timeout
      );

      const executionTime = Date.now() - startTime;

      agent.executionCount++;
      if (result.success) {
        agent.successCount++;
      } else {
        agent.failureCount++;
      }
      agent.avgExecutionTime =
        (agent.avgExecutionTime * (agent.executionCount - 1) + executionTime) /
        agent.executionCount;

      this.executionHistory.push({
        executionId,
        agentId,
        input,
        result,
        executionTime,
        timestamp: new Date().toISOString()
      });

      try {
        fs.unlinkSync(scriptPath);
      } catch (e) {}

      return {
        success: true,
        executionId,
        result,
        executionTime,
        agentStats: {
          totalExecutions: agent.executionCount,
          successRate: (agent.successCount / agent.executionCount * 100).toFixed(1),
          avgTime: agent.avgExecutionTime.toFixed(0)
        }
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        executionTime: Date.now() - startTime
      };
    }
  }

  createExecutionScript(agentPath, input) {
    return `
const fs = require('fs');
const path = require('path');

const agentCode = fs.readFileSync('${agentPath}', 'utf8');

eval(agentCode).then(result => {
  console.log(JSON.stringify({ success: true, result }));
  process.exit(0);
}).catch(error => {
  console.log(JSON.stringify({ success: false, error: error.message }));
  process.exit(1);
});
`;
  }

  async runInSandbox(scriptPath, timeout) {
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';

      const child = spawn('node', [scriptPath], {
        timeout: timeout,
        maxBuffer: 10 * 1024 * 1024
      });

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        try {
          if (output) {
            const result = JSON.parse(output);
            resolve(result);
          } else if (code === 0) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: errorOutput });
          }
        } catch (err) {
          resolve({ success: false, error: output || errorOutput });
        }
      });

      child.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  async executeOpenClawAgent(agentId, input = {}) {
    try {
      const agent = this.agents[agentId];
      if (!agent) {
        throw new Error('Agent not found');
      }

      const result = await this.executeAgent(agentId, input);

      const openClawResult = {
        agentId,
        status: result.success ? 'success' : 'error',
        data: result.result,
        executionTime: result.executionTime,
        timestamp: new Date().toISOString()
      };

      return openClawResult;
    } catch (err) {
      return {
        agentId,
        status: 'error',
        error: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  getAgentStats(agentId) {
    const agent = this.agents[agentId];
    if (!agent) return null;

    return {
      agentId,
      executionCount: agent.executionCount,
      successCount: agent.successCount,
      failureCount: agent.failureCount,
      successRate: agent.executionCount > 0 
        ? (agent.successCount / agent.executionCount * 100).toFixed(1)
        : 0,
      avgExecutionTime: agent.avgExecutionTime.toFixed(0),
      registeredAt: agent.registeredAt
    };
  }

  getExecutionHistory(agentId = null, limit = 100) {
    let history = this.executionHistory;
    if (agentId) {
      history = history.filter(h => h.agentId === agentId);
    }
    return history.slice(-limit);
  }

  deleteAgent(agentId) {
    try {
      const agent = this.agents[agentId];
      if (!agent) {
        throw new Error('Agent not found');
      }

      if (fs.existsSync(agent.path)) {
        fs.unlinkSync(agent.path);
      }

      delete this.agents[agentId];

      return { success: true, message: 'Agent deleted' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  listAgents() {
    return Object.values(this.agents).map(agent => ({
      id: agent.id,
      executionCount: agent.executionCount,
      successRate: agent.executionCount > 0
        ? (agent.successCount / agent.executionCount * 100).toFixed(1)
        : 0,
      avgExecutionTime: agent.avgExecutionTime.toFixed(0),
      registeredAt: agent.registeredAt
    }));
  }
}

module.exports = AgentExecutionEngine;
