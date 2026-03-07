/**
 * Copy this file to config.js and fill in your values
 * NEVER commit config.js to GitHub (keep it local)
 */

module.exports = {
  // Your smart contract address (deploy to Base mainnet first)
  CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000000',
  
  // Your MetaMask private key (KEEP SECRET - NEVER COMMIT)
  PRIVATE_KEY: '0x...',
  
  // Backend server port
  PORT: 3001,
  
  // Base Mainnet RPC
  RPC_URL: 'https://base-rpc.publicnode.com',
  
  // USDC contract on Base
  USDC_ADDRESS: '0x833589fcd6edb6e08f4c7c32d4f71b4da5949949',
  
  // Your wallet address for treasury
  PROTOCOL_TREASURY: '0x...'
};
```

---

## STEP 3: .gitignore

**Filename:** `.gitignore`

**File to copy:**
```
# Keep secrets local
config.js

# Node modules
node_modules/
package-lock.json

# Logs
*.log

# Database
db/
sandbox/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
