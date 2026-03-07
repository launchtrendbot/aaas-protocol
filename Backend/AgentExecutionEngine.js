/**
 * AaaS Protocol – Agent Execution Engine (vm-based sandbox)
 *
 * Security model (compared to the old subprocess+eval approach):
 *  - Agent code runs in an isolated vm.Context with NO access to require,
 *    process, fs, child_process, or any Node global.
 *  - Synchronous execution is limited to 2 s (blocks infinite loops).
 *  - Total async execution (including await chains) is limited to 8 s.
 *  - Input is deep-cloned before injection so agents can't mutate caller state.
 *
 * Limitation: Node's vm module is NOT a full security boundary — a determined
 * attacker with enough knowledge can escape. For production, replace with
 * `isolated-vm` (https://github.com/laverdet/isolated-vm) or Docker containers.
 */

'use strict';

const vm   = require('vm');
const { v4: uuidv4 } = require('uuid');

// ─── Safe subset of globals exposed to agent code ──────────────────────────
function buildSandbox(input) {
  return {
    // user data
    context: { input: JSON.parse(JSON.stringify(input)) },
    result:  undefined,

    // pure Math / language
    Math,
    JSON:      { parse: JSON.parse, stringify: JSON.stringify },
    parseFloat, parseInt, isNaN, isFinite, isInteger: Number.isInteger,
    Array, Object, String, Number, Boolean, Date, RegExp,
    Promise,

    // allow simple console.log inside agents (captured, not printed to stdout)
    console: {
      log:   () => {},
      error: () => {},
      warn:  () => {},
    },

    // explicitly block dangerous globals
    require:       undefined,
    process:       undefined,
    global:        undefined,
    __dirname:     undefined,
    __filename:    undefined,
    Buffer:        undefined,
    setTimeout:    undefined,
    setInterval:   undefined,
    setImmediate:  undefined,
    clearTimeout:  undefined,
    clearInterval: undefined,
    eval:          undefined,
    Function:      undefined,
  };
}

// ─── Wrap raw agent code in an async IIFE ──────────────────────────────────
function wrapCode(agentCode) {
  return `
(async function __agentRunner__() {
  try {
    ${agentCode}
    if (typeof agent === 'function' && typeof result === 'undefined') {
      result = await agent(context);
    }
  } catch (__err__) {
    result = { success: false, error: __err__.message };
  }
})()`;
}

// ─── Basic static analysis – block obviously dangerous patterns ────────────
function validateCode(code) {
  // Patterns that should never appear in legitimate pure-computation agents.
  const forbidden = [
    /\brequire\s*\(/,
    /\bimport\s*\(/,
    /\beval\s*\(/,
    /\bFunction\s*\(/,
    /\bprocess\b/,
    /\bglobal\b/,
    /\b__dirname\b/,
    /\b__filename\b/,
    /\bchild_process\b/,
    /\bspawn\s*\(/,
    /\bexec\s*\(/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bfs\s*\./,
    /\bBuffer\s*\./,
    /\bsetTimeout\s*\(/,
    /\bsetInterval\s*\(/,
  ];

  for (const pattern of forbidden) {
    if (pattern.test(code)) {
      return { valid: false, reason: `Forbidden pattern detected: ${pattern.source}` };
    }
  }
  if (code.length > 50_000) {
    return { valid: false, reason: 'Agent code exceeds 50 KB limit' };
  }
  return { valid: true };
}

// ─── Engine class ──────────────────────────────────────────────────────────
class AgentExecutionEngine {
  constructor(config = {}) {
    this.syncTimeout  = config.syncTimeout  || 2000;  // ms – kills sync infinite loops
    this.totalTimeout = config.totalTimeout || 8000;  // ms – total async budget
    this.agents = {};
    this.executionHistory = [];
  }

  /**
   * Register an agent's code in memory.
   * Returns { success, agentId } or { success: false, error }.
   */
  registerAgent(agentId, agentCode, metadata = {}) {
    const validation = validateCode(agentCode);
    if (!validation.valid) {
      console.error(`[Engine] Registration rejected for ${agentId}: ${validation.reason}`);
      return { success: false, error: validation.reason };
    }

    this.agents[agentId] = {
      id:            agentId,
      code:          agentCode,
      metadata,
      registeredAt:  new Date().toISOString(),
      executionCount: 0,
      successCount:   0,
      failureCount:   0,
      avgExecutionTime: 0,
    };

    console.log(`[Engine] ✅ Registered agent: ${agentId}`);
    return { success: true, agentId };
  }

  /** Remove an agent from the registry. */
  deleteAgent(agentId) {
    if (!this.agents[agentId]) return { success: false, error: 'Agent not found' };
    delete this.agents[agentId];
    return { success: true };
  }

  /**
   * Execute an agent with the supplied input.
   * Returns { success, executionId, result, executionTime, agentStats }
   *      or { success: false, error, executionTime }.
   */
  async executeAgent(agentId, input = {}) {
    const agent = this.agents[agentId];
    if (!agent) return { success: false, error: `Agent '${agentId}' not found in engine`, executionTime: 0 };

    const executionId = uuidv4();
    const startTime   = Date.now();

    try {
      const sandbox = buildSandbox(input);
      vm.createContext(sandbox);

      const script = new vm.Script(wrapCode(agent.code), {
        filename:        `agent-${agentId}.js`,
        lineOffset:      0,
        columnOffset:    0,
        displayErrors:   true,
        timeout:         this.syncTimeout,   // stops synchronous infinite loops
      });

      // runInContext returns the Promise from the async IIFE
      const runPromise = new Promise((resolve, reject) => {
        try {
          const p = script.runInContext(sandbox, { timeout: this.syncTimeout });
          if (p && typeof p.then === 'function') {
            p.then(() => resolve(sandbox.result)).catch(reject);
          } else {
            resolve(sandbox.result);
          }
        } catch (e) {
          reject(e);
        }
      });

      const killTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Agent execution timed out after ${this.totalTimeout}ms`)),
          this.totalTimeout)
      );

      const result       = await Promise.race([runPromise, killTimeout]);
      const executionTime = Date.now() - startTime;

      // Update running stats
      agent.executionCount++;
      agent.successCount++;
      agent.avgExecutionTime =
        (agent.avgExecutionTime * (agent.executionCount - 1) + executionTime) /
        agent.executionCount;

      this.executionHistory.push({ executionId, agentId, input, result, executionTime, timestamp: new Date().toISOString() });

      return {
        success: true,
        executionId,
        result: result ?? { success: true, executed: true },
        executionTime,
        agentStats: {
          totalExecutions: agent.executionCount,
          successRate:     ((agent.successCount / agent.executionCount) * 100).toFixed(1),
          avgTimeMs:       Math.round(agent.avgExecutionTime),
        },
      };

    } catch (err) {
      const executionTime = Date.now() - startTime;
      agent.executionCount++;
      agent.failureCount++;

      this.executionHistory.push({ executionId, agentId, input, error: err.message, executionTime, timestamp: new Date().toISOString() });

      return { success: false, error: err.message, executionTime };
    }
  }

  isRegistered(agentId) { return !!this.agents[agentId]; }

  getAgentStats(agentId) {
    const agent = this.agents[agentId];
    if (!agent) return null;
    return {
      agentId,
      executionCount:   agent.executionCount,
      successCount:     agent.successCount,
      failureCount:     agent.failureCount,
      successRate:      agent.executionCount > 0
        ? ((agent.successCount / agent.executionCount) * 100).toFixed(1)
        : '0',
      avgExecutionTime: Math.round(agent.avgExecutionTime),
      registeredAt:     agent.registeredAt,
    };
  }

  getExecutionHistory(agentId = null, limit = 50) {
    let history = this.executionHistory;
    if (agentId) history = history.filter(h => h.agentId === agentId);
    return history.slice(-limit);
  }

  listAgents() {
    return Object.values(this.agents).map(a => ({
      id:             a.id,
      executionCount: a.executionCount,
      successRate:    a.executionCount > 0
        ? ((a.successCount / a.executionCount) * 100).toFixed(1)
        : '0',
      avgExecutionTime: Math.round(a.avgExecutionTime),
      registeredAt:   a.registeredAt,
    }));
  }
}

module.exports = AgentExecutionEngine;
