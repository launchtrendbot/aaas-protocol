// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract AaaSProtocolV3 {
    
    enum AgentStatus { ACTIVE, SUSPENDED, DEPRECATED }
    enum SLATier { NONE, STANDARD, PREMIUM, ENTERPRISE }
    
    struct Agent {
        bytes32 id;
        address developer;
        string name;
        string description;
        string category;
        uint256 pricePerCall;
        uint256 currentVersion;
        uint256 totalCalls;
        uint256 successfulCalls;
        uint256 failedCalls;
        uint256 totalEarnings;
        uint256 totalRevenue;
        AgentStatus status;
        SLATier slaLevel;
        uint256 uptime;
        uint256 successRate;
        uint256 rating;
        uint256 userCount;
        uint256 deployedAt;
        uint256 lastUpdatedAt;
    }
    
    struct AgentVersion {
        bytes32 agentId;
        uint256 versionNumber;
        string codeHash;
        uint256 deployedAt;
        bool isActive;
        uint256 userCount;
    }
    
    struct Subscription {
        bytes32 id;
        address user;
        bytes32 agentId;
        uint256 creditAmount;
        uint256 creditsUsed;
        uint256 creditsRemaining;
        uint256 createdAt;
        uint256 expiresAt;
        bool active;
    }
    
    struct DeveloperProfile {
        address wallet;
        string name;
        uint256 totalEarnings;
        uint256 totalWithdrawn;
        uint256 reputation;
        uint256 agentCount;
        bool verified;
        uint256 createdAt;
    }
    
    struct UserProfile {
        address wallet;
        uint256 totalSpent;
        uint256 subscriptionCount;
        uint256 executionCount;
        uint256 reputation;
        uint256 createdAt;
    }
    
    struct ExecutionRecord {
        bytes32 agentId;
        address user;
        uint256 cost;
        bool success;
        uint256 timestamp;
        string resultHash;
    }
    
    IERC20 public usdc;
    address public owner;
    address public protocolTreasury;
    
    mapping(bytes32 => Agent) public agents;
    mapping(bytes32 => AgentVersion[]) public agentVersions;
    mapping(bytes32 => Subscription) public subscriptions;
    mapping(address => DeveloperProfile) public developers;
    mapping(address => UserProfile) public users;
    mapping(address => bytes32[]) public developerAgents;
    mapping(address => bytes32[]) public userSubscriptions;
    mapping(address => uint256) public developerEarnings;
    mapping(address => uint256) public developerWithdrawn;
    mapping(address => uint256) public treasuryBalance;
    mapping(bytes32 => ExecutionRecord[]) public agentExecutionHistory;
    mapping(address => ExecutionRecord[]) public userExecutionHistory;
    
    bytes32[] public allAgentIds;
    address[] public allDevelopers;
    address[] public allUsers;
    
    uint256 public constant DEVELOPER_SHARE = 8000;
    uint256 public constant PROTOCOL_SHARE = 2000;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MIN_SUBSCRIPTION = 1000000;
    uint256 public constant SUBSCRIPTION_DURATION = 30 days;
    
    event AgentDeployed(bytes32 indexed agentId, address indexed developer, string name, uint256 pricePerCall, uint256 timestamp);
    event AgentVersionReleased(bytes32 indexed agentId, uint256 versionNumber, uint256 timestamp);
    event SubscriptionCreated(bytes32 indexed subscriptionId, address indexed user, bytes32 indexed agentId, uint256 creditAmount, uint256 timestamp);
    event ExecutionRecorded(bytes32 indexed agentId, address indexed user, uint256 cost, bool success, uint256 devEarnings, uint256 protocolEarnings, uint256 timestamp);
    event EarningsWithdrawn(address indexed developer, uint256 amount, uint256 timestamp);
    event SubscriptionCreditUsed(bytes32 indexed subscriptionId, uint256 amountUsed, uint256 remainingCredits, uint256 timestamp);
    event DeveloperVerified(address indexed developer, uint256 timestamp);
    event AgentMetricsUpdated(bytes32 indexed agentId, uint256 uptime, uint256 successRate, uint256 rating, uint256 timestamp);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    modifier agentExists(bytes32 _agentId) {
        require(agents[_agentId].developer != address(0), "Agent not found");
        _;
    }
    
    modifier agentActive(bytes32 _agentId) {
        require(agents[_agentId].status == AgentStatus.ACTIVE, "Agent not active");
        _;
    }
    
    constructor(address _usdc, address _protocolTreasury) {
        require(_usdc != address(0), "Invalid USDC");
        require(_protocolTreasury != address(0), "Invalid treasury");
        usdc = IERC20(_usdc);
        owner = msg.sender;
        protocolTreasury = _protocolTreasury;
    }
    
    function deployAgent(string memory _name, string memory _description, string memory _category, uint256 _pricePerCall, string memory _codeHash) external returns (bytes32) {
        require(bytes(_name).length > 0, "Name required");
        require(_pricePerCall > 0, "Price required");
        
        bytes32 agentId = keccak256(abi.encodePacked(msg.sender, block.timestamp, _name));
        require(agents[agentId].developer == address(0), "Agent exists");
        
        agents[agentId] = Agent({
            id: agentId,
            developer: msg.sender,
            name: _name,
            description: _description,
            category: _category,
            pricePerCall: _pricePerCall,
            currentVersion: 1,
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            totalEarnings: 0,
            totalRevenue: 0,
            status: AgentStatus.ACTIVE,
            slaLevel: SLATier.NONE,
            uptime: 10000,
            successRate: 10000,
            rating: 5000,
            userCount: 0,
            deployedAt: block.timestamp,
            lastUpdatedAt: block.timestamp
        });
        
        agentVersions[agentId].push(AgentVersion({
            agentId: agentId,
            versionNumber: 1,
            codeHash: _codeHash,
            deployedAt: block.timestamp,
            isActive: true,
            userCount: 0
        }));
        
        if (developers[msg.sender].wallet == address(0)) {
            developers[msg.sender] = DeveloperProfile({
                wallet: msg.sender,
                name: _name,
                totalEarnings: 0,
                totalWithdrawn: 0,
                reputation: 5000,
                agentCount: 1,
                verified: false,
                createdAt: block.timestamp
            });
            allDevelopers.push(msg.sender);
        } else {
            developers[msg.sender].agentCount++;
        }
        
        developerAgents[msg.sender].push(agentId);
        allAgentIds.push(agentId);
        
        emit AgentDeployed(agentId, msg.sender, _name, _pricePerCall, block.timestamp);
        return agentId;
    }
    
    function releaseVersion(bytes32 _agentId, string memory _codeHash) external agentExists(_agentId) {
        require(agents[_agentId].developer == msg.sender, "Not developer");
        
        Agent storage agent = agents[_agentId];
        uint256 newVersion = agent.currentVersion + 1;
        
        agentVersions[_agentId].push(AgentVersion({
            agentId: _agentId,
            versionNumber: newVersion,
            codeHash: _codeHash,
            deployedAt: block.timestamp,
            isActive: true,
            userCount: 0
        }));
        
        agent.currentVersion = newVersion;
        agent.lastUpdatedAt = block.timestamp;
        
        emit AgentVersionReleased(_agentId, newVersion, block.timestamp);
    }
    
    function createSubscription(bytes32 _agentId, uint256 _creditAmount) external agentExists(_agentId) agentActive(_agentId) returns (bytes32) {
        require(_creditAmount >= MIN_SUBSCRIPTION, "Minimum subscription not met");
        require(usdc.balanceOf(msg.sender) >= _creditAmount, "Insufficient balance");
        
        require(usdc.transferFrom(msg.sender, address(this), _creditAmount), "Transfer failed");
        
        bytes32 subscriptionId = keccak256(abi.encodePacked(msg.sender, _agentId, block.timestamp));
        
        subscriptions[subscriptionId] = Subscription({
            id: subscriptionId,
            user: msg.sender,
            agentId: _agentId,
            creditAmount: _creditAmount,
            creditsUsed: 0,
            creditsRemaining: _creditAmount,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + SUBSCRIPTION_DURATION,
            active: true
        });
        
        userSubscriptions[msg.sender].push(subscriptionId);
        
        if (users[msg.sender].wallet == address(0)) {
            users[msg.sender] = UserProfile({
                wallet: msg.sender,
                totalSpent: _creditAmount,
                subscriptionCount: 1,
                executionCount: 0,
                reputation: 5000,
                createdAt: block.timestamp
            });
            allUsers.push(msg.sender);
        } else {
            users[msg.sender].totalSpent += _creditAmount;
            users[msg.sender].subscriptionCount++;
        }
        
        agents[_agentId].userCount++;
        
        emit SubscriptionCreated(subscriptionId, msg.sender, _agentId, _creditAmount, block.timestamp);
        return subscriptionId;
    }
    
    function executeAgent(bytes32 _agentId, address _user, bool _success, string memory _resultHash) external onlyOwner agentExists(_agentId) agentActive(_agentId) {
        Agent storage agent = agents[_agentId];
        uint256 cost = agent.pricePerCall;
        
        bytes32[] storage subs = userSubscriptions[_user];
        bool found = false;
        
        for (uint256 i = 0; i < subs.length; i++) {
            Subscription storage sub = subscriptions[subs[i]];
            if (sub.agentId == _agentId && sub.active && block.timestamp <= sub.expiresAt && sub.creditsRemaining >= cost) {
                sub.creditsRemaining -= cost;
                sub.creditsUsed += cost;
                found = true;
                emit SubscriptionCreditUsed(subs[i], cost, sub.creditsRemaining, block.timestamp);
                break;
            }
        }
        
        require(found, "No subscription");
        
        uint256 devEarnings = (cost * DEVELOPER_SHARE) / BASIS_POINTS;
        uint256 protEarnings = (cost * PROTOCOL_SHARE) / BASIS_POINTS;
        
        developerEarnings[agent.developer] += devEarnings;
        treasuryBalance[protocolTreasury] += protEarnings;
        
        agent.totalCalls++;
        agent.totalRevenue += cost;
        agent.totalEarnings += devEarnings;
        agent.lastUpdatedAt = block.timestamp;
        
        if (_success) {
            agent.successfulCalls++;
        } else {
            agent.failedCalls++;
        }
        
        if (agent.totalCalls > 0) {
            agent.successRate = (agent.successfulCalls * BASIS_POINTS) / agent.totalCalls;
        }
        
        users[_user].executionCount++;
        developers[agent.developer].totalEarnings += devEarnings;
        
        ExecutionRecord memory record = ExecutionRecord({
            agentId: _agentId,
            user: _user,
            cost: cost,
            success: _success,
            timestamp: block.timestamp,
            resultHash: _resultHash
        });
        
        agentExecutionHistory[_agentId].push(record);
        userExecutionHistory[_user].push(record);
        
        emit ExecutionRecorded(_agentId, _user, cost, _success, devEarnings, protEarnings, block.timestamp);
    }
    
    function withdrawEarnings() external {
        uint256 amount = developerEarnings[msg.sender];
        require(amount > 0, "No earnings");
        
        developerEarnings[msg.sender] = 0;
        developerWithdrawn[msg.sender] += amount;
        developers[msg.sender].totalWithdrawn += amount;
        
        require(usdc.transfer(msg.sender, amount), "Transfer failed");
        
        emit EarningsWithdrawn(msg.sender, amount, block.timestamp);
    }
    
    function suspendAgent(bytes32 _agentId) external onlyOwner agentExists(_agentId) {
        agents[_agentId].status = AgentStatus.SUSPENDED;
    }
    
    function reactivateAgent(bytes32 _agentId) external onlyOwner agentExists(_agentId) {
        agents[_agentId].status = AgentStatus.ACTIVE;
    }
    
    function verifyDeveloper(address _developer) external onlyOwner {
        require(developers[_developer].wallet != address(0), "Developer not found");
        developers[_developer].verified = true;
        emit DeveloperVerified(_developer, block.timestamp);
    }
    
    function updateAgentMetrics(bytes32 _agentId, uint256 _uptime, uint256 _rating) external onlyOwner agentExists(_agentId) {
        agents[_agentId].uptime = _uptime;
        agents[_agentId].rating = _rating;
        agents[_agentId].lastUpdatedAt = block.timestamp;
        emit AgentMetricsUpdated(_agentId, _uptime, agents[_agentId].successRate, _rating, block.timestamp);
    }
    
    function getAgent(bytes32 _agentId) external view agentExists(_agentId) returns (Agent memory) {
        return agents[_agentId];
    }
    
    function getDeveloperBalance(address _developer) external view returns (uint256) {
        return developerEarnings[_developer];
    }
    
    function getTotalAgents() external view returns (uint256) {
        return allAgentIds.length;
    }
    
    function getAllAgents() external view returns (bytes32[] memory) {
        return allAgentIds;
    }
}
