# NEAR Transaction Gas Exhaustion Reproduction

This repository demonstrates the reproduction of a gas exhaustion failure that occurred in a NEAR mainnet transaction using the near-workspaces-js testing framework.

## Overview

We successfully reproduced the gas exhaustion failure from transaction [7XiaQG8YVv5BsJQETBG9iEDrSag6TyCcpGe6f5jAm3LF](https://nearblocks.io/txns/7XiaQG8YVv5BsJQETBG9iEDrSag6TyCcpGe6f5jAm3LF) on NEAR mainnet, where a Sputnik DAO proposal execution ran out of gas during the callback after a successful token transfer.

## Key Findings

### Original Transaction Analysis

The mainnet transaction involved:
- **DAO Contract**: `observant-machine.sputnik-dao.near`
- **Token Contract**: `token.publicailab.near`
- **Transaction Type**: Sputnik DAO proposal execution (Transfer type)
- **Failure Point**: Gas exhaustion in the callback after successful token transfer
- **Gas Consumed**: ~7 TGas in the failing receipt

### Failure Mechanism

1. **Proposal Approval**: The DAO proposal reached the required threshold of 3 Approver votes
2. **Token Transfer Initiated**: The DAO called `ft_transfer` on the token contract
3. **Transfer Succeeded**: The token transfer completed successfully (evidenced by the NEP-141 event emission)
4. **Callback Failed**: The callback to the DAO contract exhausted the available gas with error: `"Exceeded the prepaid gas."`

### Root Cause

The gas exhaustion occurred in receipt `84x2ExSBZR1aPRGAgzN9QdhQ6J6Jd9At4FFqACLPafw7` executed by the DAO contract. Despite having 300 TGas allocated initially, the callback processing consumed all available gas.

## Reproduction Steps

The reproduction script (`reproduce-failure.js`) performs the following:

1. **Initialize Sandbox**: Sets up a near-workspaces sandbox environment
2. **Import Contracts**: Imports the DAO and token contracts from mainnet
3. **Initialize Contracts**: 
   - Initializes the DAO with the policy and config from mainnet
   - Initializes the fungible token contract
4. **Setup Accounts**: 
   - Imports Approver accounts to vote on proposals
   - Registers accounts with the token contract
5. **Create Proposal**: Creates a Transfer proposal matching the original
6. **Execute Votes**: Simulates 3 Approver votes to reach the threshold
7. **Reproduce Failure**: The final vote triggers the proposal execution, resulting in gas exhaustion

## Reproduction Output

Running the reproduction script shows the following key events:

```
Setting up sandbox environment...
Importing contracts from mainnet without data...
Contracts imported successfully!
Token contract account ID: token.publicailab.near
Token contract not initialized, initializing...
Token contract initialized with new()
Setting up token balances...
Registered receiver account: b0075da69a92926de3355bf080e6d7988ef06eb1f1061899908a5e896b06452f
Token balances set up
Fetching DAO policy and config from mainnet...
Policy fetched (first 200 chars): {
  "roles": [
    {
      "name": "Requestor",
      "kind": {
        "Group": [
          "9126a5c5e0601af828a60dc7681245aba8dbb90e6a72ffcfa87de10aa861eb67",
          "d3caa4b1eb280d9ff1cfb67246d9...
Initializing DAO contract...
DAO initialized successfully
Creating proposal 0 with transfer...
Using proposal bond: 100000000000000000000000
Created proposal 0
Reproducing transaction...
Voting with 3 Approvers to reach threshold...
Vote 1 from: dc1b16d8fb55c3dcec0f5f93bb673f4f9e1d3e8df1039004205b79f027539cee
Vote 2 from: d3caa4b1eb280d9ff1cfb67246d926a072796ee5ad67f5321f439f9a0a949bc4
Vote 3 from: 00c0c884f532f40ba3d477ade970098cb15bb6a92cfd10581b59a38e25c94149 - This should trigger execution
```

### Transaction Receipt Analysis

The successful reproduction shows multiple receipts:

```
Checking receipts for gas exhaustion...
Number of receipts: 5

Receipt ID: 7Nqyhs4aaWMNK26ByRgPM4XdvBNtrWFpfnrF8q4GMUrx
Executor: observant-machine.sputnik-dao.near
Gas burnt: 3593380222499
Status: {
  "SuccessValue": ""
}

Receipt ID: 6vUyfdbPdzSM21xBNPCtHLqddy91Zk3ieo9vrLGoBU73
Executor: token.publicailab.near
Gas burnt: 1931579052099
Status: {
  "SuccessValue": ""
}
Logs: [
  'EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"observant-machine.sputnik-dao.near","new_owner_id":"b0075da69a92926de3355bf080e6d7988ef06eb1f1061899908a5e896b06452f","amount":"1000000000000000000","memo":"Test transfer proposal"}]}'
]

Receipt ID: 9ZZ5LUvU9GR926ue5EGcapT1chRMud1FHvpSiMjveRaZ
Executor: observant-machine.sputnik-dao.near
Gas burnt: 6850927888931
Status: {
  "Failure": {
    "ActionError": {
      "index": 0,
      "kind": {
        "FunctionCallError": {
          "ExecutionError": "Exceeded the prepaid gas."
        }
      }
    }
  }
}
```

The key observation is that the token transfer succeeds (as shown by the NEP-141 event), but the callback to the DAO contract fails with "Exceeded the prepaid gas."

## How to Run

```bash
# Install dependencies
npm install

# Run the reproduction script
node reproduce-failure.js

# Optional: Analyze the original transaction
node analyze-gas-exhaustion.js

# Fetch transaction details
node fetch-transaction.js
```

## Technical Details

### Dependencies
- `near-workspaces`: ^5.0.0 - NEAR blockchain sandbox testing framework
- `@psalomo/jsonrpc-client`: ^1.3.1 - NEAR RPC client for fetching mainnet data

### Key Components

- **reproduce-failure.js**: Main script that reproduces the gas exhaustion
- **fetch-transaction.js**: Fetches original transaction details from mainnet
- **analyze-gas-exhaustion.js**: Analyzes which receipt had the gas exhaustion

### Contract Setup

The reproduction requires:
- Importing contracts without data (token contract state is too large)
- Manual initialization of both contracts
- Setting up proper token balances and account registrations
- Configuring the DAO with the exact voting policy from mainnet (requires 3 Approver votes)

## Fix Discovered

We discovered that the gas exhaustion issue can be resolved by using a **named account** instead of an **implicit account** as the proposal creator.

### The Fix

In `fix-failure.js`, we made the following change:
- **Original**: Used implicit account `dc1b16d8fb55c3dcec0f5f93bb673f4f9e1d3e8df1039004205b79f027539cee` as the proposer
- **Fixed**: Created a named account `alice.test.near` as the proposer

### Results

With the named account:
- ✅ Proposal creation succeeds
- ✅ Voting completes successfully  
- ✅ Token transfer executes
- ✅ **No gas exhaustion in the callback**
- ✅ Transaction completes successfully

### Key Insight

The gas exhaustion only occurs when using implicit accounts (64-character hex addresses) as the proposer. When using named accounts, the same transaction completes successfully without exhausting gas. This suggests that implicit accounts may have different gas consumption patterns or callback handling in the NEAR protocol, particularly when interacting with complex contracts like Sputnik DAO.

This finding indicates that DAOs should consider requiring named accounts for proposal creation to avoid potential gas exhaustion issues.

## License

MIT