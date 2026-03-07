/**
 * AaaS Protocol - Agent Templates
 *
 * Each template is pure-computation JavaScript that runs inside the vm sandbox.
 * Restrictions: no require, no process, no fetch, no file system.
 * Inputs arrive via context.input; output must be assigned to `result`.
 *
 * inputSchema drives the dynamic form in the frontend:
 *   { key, label, type: 'number'|'text'|'select'|'json', placeholder, options?, required? }
 */

// ─── ORIGINAL TEMPLATES ────────────────────────────────────────────────────

const SentimentAnalyzerAgent = `
async function agent(context) {
  const { input } = context;
  if (!input.text) return { success: false, error: 'text field required' };

  const text = input.text.toLowerCase();
  const positiveWords = ['good','great','excellent','amazing','love','best','awesome','happy','wonderful','fantastic','bullish','moon','pump','gain','profit','surge','rally','strong'];
  const negativeWords = ['bad','terrible','awful','hate','worst','horrible','sad','angry','disgusting','useless','bearish','dump','crash','loss','drop','fall','weak','rug'];

  let posCount = 0, negCount = 0;
  positiveWords.forEach(w => { const m = text.match(new RegExp('\\\\b' + w + '\\\\b', 'g')); if (m) posCount += m.length; });
  negativeWords.forEach(w => { const m = text.match(new RegExp('\\\\b' + w + '\\\\b', 'g')); if (m) negCount += m.length; });

  const total = posCount + negCount;
  const score = total > 0 ? posCount / total : 0.5;
  const sentiment = score > 0.6 ? 'positive' : score < 0.4 ? 'negative' : 'neutral';

  return {
    success: true,
    sentiment,
    score: parseFloat(score.toFixed(3)),
    confidence: parseFloat((Math.abs(score - 0.5) * 2).toFixed(3)),
    positiveSignals: posCount,
    negativeSignals: negCount,
    wordCount: text.split(/\\s+/).filter(Boolean).length
  };
}
result = await agent(context);
`;

const PricePredictorAgent = `
async function agent(context) {
  const { input } = context;
  if (!input.prices || !Array.isArray(input.prices) || input.prices.length < 5)
    return { success: false, error: 'prices array with at least 5 values required' };

  const prices = input.prices.map(p => parseFloat(p));
  const ma5 = prices.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const ma10 = prices.length >= 10 ? prices.slice(-10).reduce((a, b) => a + b, 0) / 10 : ma5;
  const last = prices[prices.length - 1];
  const first = prices[0];
  const percentChange = ((last - first) / first) * 100;

  // RSI (simplified)
  const gains = [], losses = [];
  for (let i = 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) gains.push(d); else losses.push(Math.abs(d));
  }
  const avgGain = gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  const prediction = percentChange > 2 ? 'bullish' : percentChange < -2 ? 'bearish' : 'neutral';
  const signal = rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral';

  return {
    success: true,
    prediction,
    signal,
    rsi: parseFloat(rsi.toFixed(2)),
    ma5: parseFloat(ma5.toFixed(4)),
    ma10: parseFloat(ma10.toFixed(4)),
    lastPrice: parseFloat(last.toFixed(4)),
    percentChange: parseFloat(percentChange.toFixed(2)),
    confidence: parseFloat(Math.min(Math.abs(percentChange) / 10, 1).toFixed(3))
  };
}
result = await agent(context);
`;

// ─── NEW PRACTICAL DEFI AGENTS ─────────────────────────────────────────────

const APYCalculatorAgent = `
async function agent(context) {
  const { input } = context;
  const { principal, annualRate, compoundsPerYear, years } = input;

  if (!principal || !annualRate || !years)
    return { success: false, error: 'principal, annualRate (%), years required' };

  const P = parseFloat(principal);
  const r = parseFloat(annualRate) / 100;
  const n = parseFloat(compoundsPerYear || 12);
  const t = parseFloat(years);

  const finalValue = P * Math.pow(1 + r / n, n * t);
  const totalInterest = finalValue - P;
  const effectiveAPY = (Math.pow(1 + r / n, n) - 1) * 100;

  const yearlyBreakdown = [];
  for (let y = 1; y <= Math.min(t, 10); y++) {
    const val = P * Math.pow(1 + r / n, n * y);
    yearlyBreakdown.push({ year: y, balance: parseFloat(val.toFixed(2)), earned: parseFloat((val - P).toFixed(2)) });
  }

  return {
    success: true,
    principal: parseFloat(P.toFixed(2)),
    finalBalance: parseFloat(finalValue.toFixed(2)),
    totalInterestEarned: parseFloat(totalInterest.toFixed(2)),
    effectiveAPY: parseFloat(effectiveAPY.toFixed(4)),
    nominalRate: parseFloat(annualRate),
    compoundsPerYear: n,
    years: t,
    yearlyBreakdown
  };
}
result = await agent(context);
`;

const ImpermanentLossAgent = `
async function agent(context) {
  const { input } = context;
  const { priceChangePercent, initialLiquidityUSD } = input;

  if (priceChangePercent === undefined || priceChangePercent === null || !initialLiquidityUSD)
    return { success: false, error: 'priceChangePercent and initialLiquidityUSD required' };

  const pct = parseFloat(priceChangePercent);
  const liq = parseFloat(initialLiquidityUSD);
  const priceRatio = 1 + pct / 100;

  // IL = 2*sqrt(k) / (1+k) - 1 where k = price ratio
  const ilFactor = (2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1;
  const ilPercent = ilFactor * 100;

  const holdValue = liq * priceRatio;                  // value of just holding tokens
  const lpValue = liq * (1 + ilFactor) * priceRatio;  // corrected LP value
  const lossVsHold = lpValue - holdValue;

  const severity = Math.abs(ilPercent) > 10 ? 'significant' :
                   Math.abs(ilPercent) > 5  ? 'moderate' :
                   Math.abs(ilPercent) > 2  ? 'low' : 'minimal';

  return {
    success: true,
    priceChangePercent: pct,
    ilPercent: parseFloat(ilPercent.toFixed(4)),
    initialLiquidityUSD: parseFloat(liq.toFixed(2)),
    lpValueAtCurrentPrice: parseFloat(lpValue.toFixed(2)),
    holdValueAtCurrentPrice: parseFloat(holdValue.toFixed(2)),
    lossVsHoldUSD: parseFloat(lossVsHold.toFixed(2)),
    severity,
    note: 'Positive lossVsHold means LP outperformed holding; negative means IL exceeded gains'
  };
}
result = await agent(context);
`;

const PortfolioRiskAgent = `
async function agent(context) {
  const { input } = context;
  const { positions } = input;

  if (!positions || !Array.isArray(positions) || positions.length === 0)
    return { success: false, error: 'positions array required: [{token, amount, price}]' };

  const enriched = positions.map(p => ({
    token: p.token || 'UNKNOWN',
    value: parseFloat(p.amount || 0) * parseFloat(p.price || 0)
  }));

  const totalValue = enriched.reduce((s, p) => s + p.value, 0);
  if (totalValue === 0) return { success: false, error: 'Portfolio total value is zero' };

  const weights = enriched.map(p => p.value / totalValue);
  const hhi = weights.reduce((s, w) => s + w * w, 0);
  const diversificationScore = parseFloat(((1 - hhi) * 100).toFixed(1));

  const sorted = enriched
    .map((p, i) => ({ ...p, weightPct: parseFloat((weights[i] * 100).toFixed(2)) }))
    .sort((a, b) => b.value - a.value);

  const top = sorted[0];
  const concentrationRisk = top.weightPct > 50 ? 'high' : top.weightPct > 30 ? 'medium' : 'low';

  const recommendations = [];
  if (top.weightPct > 60) recommendations.push('Reduce ' + top.token + ' (' + top.weightPct + '% of portfolio) — over-concentrated');
  if (positions.length < 3) recommendations.push('Add more assets to improve diversification');
  if (diversificationScore > 65) recommendations.push('Diversification is good');
  if (hhi < 0.15) recommendations.push('Excellent diversification across assets');

  return {
    success: true,
    totalValueUSD: parseFloat(totalValue.toFixed(2)),
    assetCount: positions.length,
    herfindahlIndex: parseFloat(hhi.toFixed(4)),
    diversificationScore,
    concentrationRisk,
    largestPosition: { token: top.token, weightPct: top.weightPct, valueUSD: parseFloat(top.value.toFixed(2)) },
    positions: sorted.map(p => ({ token: p.token, valueUSD: parseFloat(p.value.toFixed(2)), weightPct: p.weightPct })),
    recommendations
  };
}
result = await agent(context);
`;

const DCACalculatorAgent = `
async function agent(context) {
  const { input } = context;
  const { purchases, currentPrice } = input;

  if (!purchases || !Array.isArray(purchases) || purchases.length === 0)
    return { success: false, error: 'purchases array required: [{amount, price}]' };

  let totalInvested = 0, totalTokens = 0;
  purchases.forEach(p => {
    const amt = parseFloat(p.amount || 0);
    const pr  = parseFloat(p.price  || 0);
    if (pr > 0) { totalInvested += amt; totalTokens += amt / pr; }
  });

  const avgCostBasis = totalTokens > 0 ? totalInvested / totalTokens : 0;
  const prices = purchases.map(p => parseFloat(p.price));
  const minPrice = Math.min.apply(null, prices);
  const maxPrice = Math.max.apply(null, prices);

  let currentValueUSD = null, pnlUSD = null, pnlPercent = null;
  if (currentPrice) {
    currentValueUSD = totalTokens * parseFloat(currentPrice);
    pnlUSD = currentValueUSD - totalInvested;
    pnlPercent = (pnlUSD / totalInvested) * 100;
  }

  return {
    success: true,
    purchaseCount: purchases.length,
    totalInvested: parseFloat(totalInvested.toFixed(2)),
    totalTokensAcquired: parseFloat(totalTokens.toFixed(6)),
    averageCostBasis: parseFloat(avgCostBasis.toFixed(4)),
    priceRange: { min: parseFloat(minPrice.toFixed(4)), max: parseFloat(maxPrice.toFixed(4)) },
    currentValueUSD: currentValueUSD !== null ? parseFloat(currentValueUSD.toFixed(2)) : null,
    pnlUSD:     pnlUSD     !== null ? parseFloat(pnlUSD.toFixed(2))    : null,
    pnlPercent: pnlPercent !== null ? parseFloat(pnlPercent.toFixed(2)) : null,
    dcaEfficiency: parseFloat(((avgCostBasis / maxPrice) * 100).toFixed(1))
  };
}
result = await agent(context);
`;

const StakingRewardsAgent = `
async function agent(context) {
  const { input } = context;
  const { stakeAmount, aprPercent, durationDays, compoundFrequency } = input;

  if (!stakeAmount || !aprPercent || !durationDays)
    return { success: false, error: 'stakeAmount, aprPercent (%), durationDays required' };

  const P = parseFloat(stakeAmount);
  const apr = parseFloat(aprPercent) / 100;
  const days = parseFloat(durationDays);
  const compound = compoundFrequency || 'daily';
  const compoundMap = { daily: 365, weekly: 52, monthly: 12, yearly: 1 };
  const n = compoundMap[compound] || 365;
  const t = days / 365;

  const finalBalance = P * Math.pow(1 + apr / n, n * t);
  const totalRewards = finalBalance - P;
  const effectiveAPY = (Math.pow(1 + apr / n, n) - 1) * 100;

  const months = Math.min(Math.ceil(days / 30), 12);
  const monthlyBreakdown = [];
  for (let m = 1; m <= months; m++) {
    const val = P * Math.pow(1 + apr / n, n * (m * 30 / 365));
    monthlyBreakdown.push({ month: m, balance: parseFloat(val.toFixed(4)), rewards: parseFloat((val - P).toFixed(4)) });
  }

  return {
    success: true,
    stakeAmount: parseFloat(P.toFixed(2)),
    aprPercent: parseFloat(aprPercent),
    effectiveAPY: parseFloat(effectiveAPY.toFixed(4)),
    durationDays: days,
    compoundFrequency: compound,
    finalBalance: parseFloat(finalBalance.toFixed(6)),
    totalRewards: parseFloat(totalRewards.toFixed(6)),
    dailyRewards: parseFloat((totalRewards / days).toFixed(6)),
    monthlyBreakdown
  };
}
result = await agent(context);
`;

const GasEstimatorAgent = `
async function agent(context) {
  const { input } = context;
  const { gasPriceGwei, ethPriceUSD } = input;

  if (!gasPriceGwei || !ethPriceUSD)
    return { success: false, error: 'gasPriceGwei and ethPriceUSD required' };

  const gasPrice = parseFloat(gasPriceGwei);
  const ethPrice = parseFloat(ethPriceUSD);

  const txTypes = [
    { name: 'ETH Transfer',          gasUnits: 21000    },
    { name: 'ERC-20 Transfer',       gasUnits: 65000    },
    { name: 'Token Approve',         gasUnits: 46000    },
    { name: 'Uniswap V3 Swap',       gasUnits: 150000   },
    { name: 'Aave Deposit',          gasUnits: 180000   },
    { name: 'Add Liquidity (V3)',     gasUnits: 250000   },
    { name: 'Claim Staking Rewards', gasUnits: 80000    },
    { name: 'NFT Mint',              gasUnits: 200000   },
    { name: 'Contract Deploy',       gasUnits: 400000   },
  ];

  const estimates = txTypes.map(tx => {
    const gasCostETH = tx.gasUnits * gasPrice * 1e-9;
    return {
      txType: tx.name,
      gasUnits: tx.gasUnits,
      gasCostETH: parseFloat(gasCostETH.toFixed(6)),
      gasCostUSD: parseFloat((gasCostETH * ethPrice).toFixed(4))
    };
  });

  const recommendation =
    gasPrice > 100 ? 'High gas — wait for lower prices unless urgent' :
    gasPrice > 50  ? 'Moderate gas — routine transactions only' :
    gasPrice > 20  ? 'Normal gas — proceed with most transactions' :
                     'Low gas — great time to transact!';

  return {
    success: true,
    gasPriceGwei: gasPrice,
    ethPriceUSD: ethPrice,
    recommendation,
    estimates,
    cheapestTxCostUSD: parseFloat(estimates[0].gasCostUSD.toFixed(4))
  };
}
result = await agent(context);
`;

const LoanHealthAgent = `
async function agent(context) {
  const { input } = context;
  const { collateralUSD, borrowedUSD, liquidationThreshold } = input;

  if (!collateralUSD || !borrowedUSD)
    return { success: false, error: 'collateralUSD and borrowedUSD required' };

  const collateral = parseFloat(collateralUSD);
  const borrowed   = parseFloat(borrowedUSD);
  const threshold  = parseFloat(liquidationThreshold || 0.8);

  const healthFactor = (collateral * threshold) / borrowed;
  const ltv = borrowed / collateral;
  const maxBorrow = collateral * threshold;
  const availableToBorrow = Math.max(0, maxBorrow - borrowed);

  let status = 'healthy', riskLevel = 'low', alert = false;
  if      (healthFactor < 1.0 ) { status = 'LIQUIDATABLE'; riskLevel = 'critical'; alert = true; }
  else if (healthFactor < 1.1 ) { status = 'critical';     riskLevel = 'critical'; alert = true; }
  else if (healthFactor < 1.25) { status = 'at_risk';      riskLevel = 'high';     alert = true; }
  else if (healthFactor < 1.5 ) { status = 'caution';      riskLevel = 'medium'; }

  const recommendations = [];
  if (healthFactor < 1.1)  recommendations.push('URGENT: Repay debt or deposit more collateral immediately');
  if (healthFactor < 1.25) recommendations.push('Add collateral or reduce borrowing to avoid liquidation');
  if (ltv > 0.7)           recommendations.push('LTV is high — consider reducing debt');
  if (healthFactor > 2.0)  recommendations.push('Position is safe; you can borrow more if needed');
  if (healthFactor >= 1.5) recommendations.push('Position is in good health');

  return {
    success: true,
    healthFactor: parseFloat(healthFactor.toFixed(4)),
    status,
    riskLevel,
    alert,
    ltvPercent: parseFloat((ltv * 100).toFixed(2)),
    collateralUSD: parseFloat(collateral.toFixed(2)),
    borrowedUSD: parseFloat(borrowed.toFixed(2)),
    maxBorrowableUSD: parseFloat(maxBorrow.toFixed(2)),
    availableToBorrowUSD: parseFloat(availableToBorrow.toFixed(2)),
    liquidationThreshold: parseFloat((threshold * 100).toFixed(0)),
    recommendations
  };
}
result = await agent(context);
`;

const VestingCalculatorAgent = `
async function agent(context) {
  const { input } = context;
  const { totalTokens, cliffMonths, vestingMonths, monthsElapsed } = input;

  if (!totalTokens || vestingMonths === undefined || vestingMonths === null)
    return { success: false, error: 'totalTokens and vestingMonths required' };

  const total   = parseFloat(totalTokens);
  const cliff   = parseFloat(cliffMonths  || 0);
  const vesting = parseFloat(vestingMonths);
  const elapsed = parseFloat(monthsElapsed || 0);

  if (vesting <= cliff)
    return { success: false, error: 'vestingMonths must be greater than cliffMonths' };

  const cliffReached = elapsed >= cliff;
  const vestingPeriod = vesting - cliff;
  const monthsVested  = cliffReached ? Math.min(elapsed - cliff, vestingPeriod) : 0;
  const unlockedPct   = cliffReached ? (monthsVested / vestingPeriod) * 100 : 0;
  const unlockedTokens = (unlockedPct / 100) * total;
  const lockedTokens   = total - unlockedTokens;

  const schedule = [];
  for (let m = 0; m <= Math.min(vesting, 36); m++) {
    const unlocked = m < cliff ? 0 : Math.min(((m - cliff) / vestingPeriod) * total, total);
    schedule.push({ month: m, cumUnlocked: parseFloat(unlocked.toFixed(2)) });
  }

  return {
    success: true,
    totalTokens: parseFloat(total.toFixed(2)),
    unlockedTokens: parseFloat(unlockedTokens.toFixed(2)),
    lockedTokens: parseFloat(lockedTokens.toFixed(2)),
    unlockedPercent: parseFloat(unlockedPct.toFixed(2)),
    cliffReached,
    cliffMonths: cliff,
    vestingMonths: vesting,
    monthsElapsed: elapsed,
    monthsUntilFullyVested: cliffReached ? Math.max(0, parseFloat((vesting - elapsed).toFixed(1))) : vesting - elapsed,
    vestingSchedule: schedule
  };
}
result = await agent(context);
`;

// ─── EXPORTS ───────────────────────────────────────────────────────────────

module.exports = {
  templates: {

    // ── Originals ──────────────────────────────────────────────────────────
    'sentiment-analyzer': {
      id: 'sentiment-analyzer',
      name: 'Sentiment Analyzer',
      description: 'Analyzes text for bullish/bearish sentiment using weighted keyword scoring.',
      category: 'data',
      price: '0.10',
      code: SentimentAnalyzerAgent,
      inputSchema: [
        { key: 'text', label: 'Text to analyze', type: 'textarea', placeholder: 'Bitcoin just hit a new ATH, extremely bullish momentum...', required: true }
      ]
    },

    'price-predictor': {
      id: 'price-predictor',
      name: 'Price Trend Analyzer',
      description: 'Calculates MA5, MA10, RSI and a bullish/bearish signal from historical prices.',
      category: 'trading',
      price: '0.25',
      code: PricePredictorAgent,
      inputSchema: [
        { key: 'prices', label: 'Price history (comma-separated)', type: 'text', placeholder: '100,102,101,105,108,107,110,112,111,115', required: true, parseAs: 'numberArray' }
      ]
    },

    // ── New DeFi Agents ────────────────────────────────────────────────────
    'apy-calculator': {
      id: 'apy-calculator',
      name: 'APY Compound Calculator',
      description: 'Calculates compound interest, effective APY, and a year-by-year earnings breakdown.',
      category: 'defi',
      price: '0.10',
      code: APYCalculatorAgent,
      inputSchema: [
        { key: 'principal',        label: 'Principal Amount ($)',      type: 'number', placeholder: '10000',  required: true },
        { key: 'annualRate',       label: 'Annual Interest Rate (%)',  type: 'number', placeholder: '8.5',    required: true },
        { key: 'compoundsPerYear', label: 'Compounds Per Year',        type: 'number', placeholder: '12',     required: false },
        { key: 'years',            label: 'Duration (years)',          type: 'number', placeholder: '5',      required: true }
      ]
    },

    'il-calculator': {
      id: 'il-calculator',
      name: 'Impermanent Loss Calculator',
      description: 'Calculates IL for a Uniswap-style LP position given a token price change.',
      category: 'defi',
      price: '0.15',
      code: ImpermanentLossAgent,
      inputSchema: [
        { key: 'priceChangePercent',  label: 'Price Change (%)',           type: 'number', placeholder: '50',   required: true },
        { key: 'initialLiquidityUSD', label: 'Initial Liquidity (USD)',     type: 'number', placeholder: '5000', required: true }
      ]
    },

    'portfolio-risk': {
      id: 'portfolio-risk',
      name: 'Portfolio Risk Analyzer',
      description: 'Calculates Herfindahl diversification score, concentration risk and recommendations.',
      category: 'trading',
      price: '0.20',
      code: PortfolioRiskAgent,
      inputSchema: [
        {
          key: 'positions',
          label: 'Positions (JSON array)',
          type: 'json',
          placeholder: '[{"token":"ETH","amount":5,"price":3500},{"token":"BTC","amount":0.1,"price":65000}]',
          required: true
        }
      ]
    },

    'dca-calculator': {
      id: 'dca-calculator',
      name: 'DCA Strategy Calculator',
      description: 'Computes average cost basis, total tokens acquired, and P&L for a DCA purchase history.',
      category: 'trading',
      price: '0.10',
      code: DCACalculatorAgent,
      inputSchema: [
        {
          key: 'purchases',
          label: 'Purchases (JSON array)',
          type: 'json',
          placeholder: '[{"amount":500,"price":2000},{"amount":500,"price":1800},{"amount":500,"price":2200}]',
          required: true
        },
        { key: 'currentPrice', label: 'Current Price (optional)', type: 'number', placeholder: '2500', required: false }
      ]
    },

    'staking-rewards': {
      id: 'staking-rewards',
      name: 'Staking Rewards Projector',
      description: 'Projects staking rewards with compound growth and a monthly breakdown table.',
      category: 'defi',
      price: '0.10',
      code: StakingRewardsAgent,
      inputSchema: [
        { key: 'stakeAmount',       label: 'Stake Amount ($)',          type: 'number', placeholder: '5000',  required: true },
        { key: 'aprPercent',        label: 'APR (%)',                   type: 'number', placeholder: '12.5',  required: true },
        { key: 'durationDays',      label: 'Duration (days)',           type: 'number', placeholder: '365',   required: true },
        { key: 'compoundFrequency', label: 'Compound Frequency',       type: 'select', options: ['daily','weekly','monthly','yearly'], required: false }
      ]
    },

    'gas-estimator': {
      id: 'gas-estimator',
      name: 'Gas Cost Estimator',
      description: 'Estimates USD cost of 9 common DeFi transaction types at your current gas price.',
      category: 'data',
      price: '0.05',
      code: GasEstimatorAgent,
      inputSchema: [
        { key: 'gasPriceGwei', label: 'Gas Price (Gwei)',  type: 'number', placeholder: '15',   required: true },
        { key: 'ethPriceUSD',  label: 'ETH Price (USD)',   type: 'number', placeholder: '3500', required: true }
      ]
    },

    'loan-health': {
      id: 'loan-health',
      name: 'Loan Health Monitor',
      description: 'Calculates health factor, LTV and liquidation risk for Aave/Compound-style positions.',
      category: 'defi',
      price: '0.15',
      code: LoanHealthAgent,
      inputSchema: [
        { key: 'collateralUSD',        label: 'Collateral Value (USD)',       type: 'number', placeholder: '10000', required: true },
        { key: 'borrowedUSD',          label: 'Borrowed Amount (USD)',        type: 'number', placeholder: '6000',  required: true },
        { key: 'liquidationThreshold', label: 'Liquidation Threshold (0–1)', type: 'number', placeholder: '0.8',   required: false }
      ]
    },

    'vesting-calculator': {
      id: 'vesting-calculator',
      name: 'Token Vesting Calculator',
      description: 'Shows unlocked vs locked tokens and a full monthly vesting schedule.',
      category: 'data',
      price: '0.10',
      code: VestingCalculatorAgent,
      inputSchema: [
        { key: 'totalTokens',   label: 'Total Token Allocation',     type: 'number', placeholder: '100000', required: true },
        { key: 'cliffMonths',   label: 'Cliff (months)',             type: 'number', placeholder: '6',      required: false },
        { key: 'vestingMonths', label: 'Total Vesting Period (months)', type: 'number', placeholder: '24', required: true },
        { key: 'monthsElapsed', label: 'Months Elapsed Since TGE',  type: 'number', placeholder: '8',      required: false }
      ]
    }
  },

  getTemplate(id)     { return this.templates[id]; },
  getAllTemplates()    { return Object.values(this.templates); },
  getTemplateCode(id) { const t = this.templates[id]; return t ? t.code : null; }
};
