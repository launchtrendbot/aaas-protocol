const SentimentAnalyzerAgent = `
async function agent(context) {
  const { input } = context;
  
  if (!input.text) {
    return { success: false, error: 'Text required' };
  }

  try {
    const text = input.text.toLowerCase();
    let score = 0.5;
    
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'best', 'awesome', 'happy', 'wonderful', 'fantastic'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'sad', 'angry', 'disgusting', 'useless'];
    
    let posCount = 0;
    let negCount = 0;
    
    positiveWords.forEach(word => {
      const regex = new RegExp(\\`\\\\b\${word}\\\\b\\`, 'g');
      const matches = text.match(regex);
      if (matches) posCount += matches.length;
    });
    
    negativeWords.forEach(word => {
      const regex = new RegExp(\\`\\\\b\${word}\\\\b\\`, 'g');
      const matches = text.match(regex);
      if (matches) negCount += matches.length;
    });
    
    const total = posCount + negCount;
    if (total > 0) {
      score = posCount / total;
    }
    
    return {
      success: true,
      sentiment: score > 0.6 ? 'positive' : score < 0.4 ? 'negative' : 'neutral',
      score: score.toFixed(2),
      positiveWords: posCount,
      negativeWords: negCount,
      confidence: (Math.abs(score - 0.5) * 2).toFixed(2)
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

result = await agent(context);
`;

const PricePredictorAgent = `
async function agent(context) {
  const { input } = context;
  
  if (!input.prices || !Array.isArray(input.prices) || input.prices.length < 5) {
    return { success: false, error: 'Need at least 5 prices' };
  }

  try {
    const prices = input.prices;
    const ma5 = prices.slice(-5).reduce((a, b) => a + b) / 5;
    const ma10 = prices.length >= 10 
      ? prices.slice(-10).reduce((a, b) => a + b) / 10 
      : prices.reduce((a, b) => a + b) / prices.length;
    
    const lastPrice = prices[prices.length - 1];
    const trend = lastPrice > ma5 ? 'up' : lastPrice < ma5 ? 'down' : 'neutral';
    
    const priceChange = lastPrice - prices[0];
    const percentChange = (priceChange / prices[0]) * 100;
    
    const prediction = percentChange > 2 ? 'bullish' : percentChange < -2 ? 'bearish' : 'neutral';
    
    return {
      success: true,
      prediction,
      trend,
      ma5: ma5.toFixed(2),
      ma10: ma10.toFixed(2),
      lastPrice: lastPrice.toFixed(2),
      priceChange: priceChange.toFixed(2),
      percentChange: percentChange.toFixed(2),
      confidence: Math.min(Math.abs(percentChange) / 10, 1).toFixed(2)
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

result = await agent(context);
`;

const LiquidationDetectorAgent = `
async function agent(context) {
  const { input } = context;
  
  if (!input.collateral || !input.borrowed || !input.price) {
    return { success: false, error: 'collateral, borrowed, price required' };
  }

  try {
    const collateral = parseFloat(input.collateral);
    const borrowed = parseFloat(input.borrowed);
    const price = parseFloat(input.price);
    const liquidationThreshold = input.liquidationThreshold || 0.8;
    
    const ltv = borrowed / (collateral * price);
    
    let riskLevel = 'safe';
    let riskScore = 0;
    
    if (ltv > liquidationThreshold) {
      riskLevel = 'liquidation_risk';
      riskScore = 1.0;
    } else if (ltv > liquidationThreshold * 0.9) {
      riskLevel = 'high_risk';
      riskScore = 0.8;
    } else if (ltv > liquidationThreshold * 0.7) {
      riskLevel = 'medium_risk';
      riskScore = 0.5;
    }
    
    const liquidationPrice = borrowed / (collateral * liquidationThreshold);
    const priceChange = ((liquidationPrice - price) / price * 100).toFixed(2);
    
    return {
      success: true,
      riskLevel,
      riskScore: riskScore.toFixed(2),
      ltv: ltv.toFixed(4),
      liquidationThreshold: liquidationThreshold.toFixed(2),
      liquidationPrice: liquidationPrice.toFixed(2),
      currentPrice: price.toFixed(2),
      priceChangeToLiquidation: priceChange,
      alert: riskScore > 0.7
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

result = await agent(context);
`;

const MEVDetectorAgent = `
async function agent(context) {
  const { input } = context;
  
  if (!input.transactions || !Array.isArray(input.transactions)) {
    return { success: false, error: 'transactions array required' };
  }

  try {
    const transactions = input.transactions;
    let mevOpportunities = [];
    let totalValue = 0;
    
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const gasPrice = parseFloat(tx.gasPrice || 0);
      const value = parseFloat(tx.value || 0);
      
      totalValue += value;
      
      if (i > 0 && i < transactions.length - 1) {
        const prevTx = transactions[i - 1];
        const nextTx = transactions[i + 1];
        
        if (value > 10 && Math.abs(value - parseFloat(prevTx.value || 0)) < 5) {
          mevOpportunities.push({
            type: 'sandwich',
            targetTx: i,
            estimatedProfit: (value * 0.01).toFixed(2),
            gasPrice: gasPrice.toFixed(0)
          });
        }
      }
    }
    
    const mevDetected = mevOpportunities.length > 0;
    const averageGasPrice = transactions.length > 0 
      ? (transactions.reduce((sum, tx) => sum + parseFloat(tx.gasPrice || 0), 0) / transactions.length).toFixed(0)
      : 0;
    
    return {
      success: true,
      mevDetected,
      opportunityCount: mevOpportunities.length,
      totalValue: totalValue.toFixed(2),
      averageGasPrice,
      opportunities: mevOpportunities,
      estimatedTotalProfit: mevOpportunities.reduce((sum, opp) => sum + parseFloat(opp.estimatedProfit || 0), 0).toFixed(2),
      riskLevel: mevOpportunities.length > 2 ? 'high' : mevOpportunities.length > 0 ? 'medium' : 'low'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

result = await agent(context);
`;

const YieldOptimizerAgent = `
async function agent(context) {
  const { input } = context;
  
  if (!input.protocols || !Array.isArray(input.protocols)) {
    return { success: false, error: 'protocols array required' };
  }

  try {
    const protocols = input.protocols;
    
    const scoredProtocols = protocols.map(p => {
      const apy = parseFloat(p.apy || 0);
      const tvl = parseFloat(p.tvl || 0);
      const risk = parseFloat(p.riskScore || 5) / 10;
      
      const score = (apy * 0.5) + (Math.min(tvl, 100) * 0.3) + ((1 - risk) * 20);
      
      return {
        ...p,
        score: score.toFixed(2),
        recommendationScore: ((apy / 100) * (1 - risk)).toFixed(2)
      };
    });
    
    const sorted = scoredProtocols.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
    const best = sorted[0];
    
    return {
      success: true,
      bestProtocol: best.name,
      apy: best.apy,
      score: best.score,
      riskLevel: best.riskScore > 7 ? 'high' : best.riskScore > 4 ? 'medium' : 'low',
      recommendation: \`Deposit in \${best.name} for \${best.apy}% APY\`,
      allProtocols: sorted.slice(0, 5),
      diversificationScore: (sorted.length / protocols.length).toFixed(2)
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

result = await agent(context);
`;

module.exports = {
  templates: {
    'sentiment-analyzer': {
      id: 'sentiment-analyzer',
      name: 'Sentiment Analyzer',
      description: 'Analyzes text sentiment and returns sentiment score',
      category: 'data',
      code: SentimentAnalyzerAgent,
      price: '0.1'
    },
    'price-predictor': {
      id: 'price-predictor',
      name: 'Price Predictor',
      description: 'Predicts price movement using moving averages',
      category: 'trading',
      code: PricePredictorAgent,
      price: '0.5'
    },
    'liquidation-detector': {
      id: 'liquidation-detector',
      name: 'Liquidation Detector',
      description: 'Detects liquidation risk in lending protocols',
      category: 'defi',
      code: LiquidationDetectorAgent,
      price: '1.0'
    },
    'mev-detector': {
      id: 'mev-detector',
      name: 'MEV Detector',
      description: 'Detects potential MEV opportunities',
      category: 'arbitrage',
      code: MEVDetectorAgent,
      price: '0.75'
    },
    'yield-optimizer': {
      id: 'yield-optimizer',
      name: 'Yield Optimizer',
      description: 'Finds best yield opportunities',
      category: 'defi',
      code: YieldOptimizerAgent,
      price: '0.25'
    }
  },

  getTemplate(templateId) {
    return this.templates[templateId];
  },

  getAllTemplates() {
    return Object.values(this.templates);
  },

  getTemplateCode(templateId) {
    const template = this.templates[templateId];
    return template ? template.code : null;
  }
};
