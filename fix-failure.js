import { Worker } from 'near-workspaces';
import { NearRpcClient, viewFunctionAsJson } from '@psalomo/jsonrpc-client';

// Set the RPC URL for mainnet operations
process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL = "https://archival-rpc.mainnet.fastnear.com";

console.log('Setting up sandbox environment...');
const worker = await Worker.init();
const mainnetClient = new NearRpcClient('https://archival-rpc.mainnet.fastnear.com');

try {
  // Import contracts directly from mainnet
  console.log('Importing contracts from mainnet without data...');
  
  // Import Sputnik DAO contract without data
  const sputnikDao = await worker.rootAccount.importContract({
    mainnetContract: 'observant-machine.sputnik-dao.near'
  });
  
  // Import token contract without data (too large to import with data)
  const tokenContract = await worker.rootAccount.importContract({
    mainnetContract: 'token.publicailab.near'
  });
  
  // Create a named account instead of using implicit account for proposer
  const user = await worker.rootAccount.createSubAccount('alice', {
    initialBalance: '10000000000000000000000000'  // 10 NEAR for creating proposals
  });
  console.log('Created named user account:', user.accountId);
  
  // Import the original Approver accounts to vote
  const approver2 = await worker.rootAccount.importContract({
    mainnetContract: 'd3caa4b1eb280d9ff1cfb67246d926a072796ee5ad67f5321f439f9a0a949bc4',
    initialBalance: '1000000000000000000000000'  // 1 NEAR
  });
  
  const approver3 = await worker.rootAccount.importContract({
    mainnetContract: '00c0c884f532f40ba3d477ade970098cb15bb6a92cfd10581b59a38e25c94149',
    initialBalance: '1000000000000000000000000'  // 1 NEAR
  });
  
  console.log('Contracts imported successfully!');
  console.log('Token contract account ID:', tokenContract.accountId);
  
  // Initialize token contract if needed and set up balances
  try {
    const tokenMetadata = await tokenContract.view('ft_metadata', {});
    console.log('Token metadata:', tokenMetadata);
  } catch (e) {
    console.log('Token contract not initialized, initializing...');
    // Initialize the token contract - try standard NEP-141 initialization
    try {
      // Try the standard 'new' method with metadata
      await tokenContract.callRaw(tokenContract, 'new', {
        owner_id: tokenContract.accountId,
        total_supply: '1000000000000000000000000000',  // 1 billion tokens with 18 decimals
        metadata: {
          spec: 'ft-1.0.0',
          name: 'Public AI Token',
          symbol: 'PUBLICAI',
          decimals: 18
        }
      }, {
        gas: '100000000000000'
      });
      console.log('Token contract initialized with new()');
    } catch (initError) {
      console.log('Error with new():', initError.message);
      // Try alternative initialization method
      try {
        await tokenContract.callRaw(tokenContract, 'new_default_meta', {
          owner_id: tokenContract.accountId,
          total_supply: '1000000000000000000000000000'
        }, {
          gas: '100000000000000'
        });
        console.log('Token contract initialized with new_default_meta()');
      } catch (altInitError) {
        console.log('Error with new_default_meta():', altInitError.message);
      }
    }
  }
  
  // Give the DAO some tokens to transfer
  console.log('Setting up token balances...');
  try {
    // First register the DAO account with the token
    await sputnikDao.callRaw(tokenContract, 'storage_deposit', {
      account_id: sputnikDao.accountId
    }, {
      gas: '30000000000000',
      attachedDeposit: '1250000000000000000000'  // Storage deposit
    });
    
    // Also register the receiver account from the proposal
    const receiverAccount = 'b0075da69a92926de3355bf080e6d7988ef06eb1f1061899908a5e896b06452f';
    await worker.rootAccount.callRaw(tokenContract, 'storage_deposit', {
      account_id: receiverAccount
    }, {
      gas: '30000000000000',
      attachedDeposit: '1250000000000000000000'  // Storage deposit
    });
    console.log('Registered receiver account:', receiverAccount);
    
    // Transfer some tokens to the DAO
    await tokenContract.callRaw(tokenContract, 'ft_transfer', {
      receiver_id: sputnikDao.accountId,
      amount: '10000000000000000000'  // Give DAO 10 tokens
    }, {
      gas: '30000000000000',
      attachedDeposit: '1'  // 1 yoctoNEAR for transfer
    });
    
    console.log('Token balances set up');
  } catch (e) {
    console.log('Error setting up token balances:', e.message);
  }
  
  // Fetch policy and config from mainnet
  console.log('Fetching DAO policy and config from mainnet...');
  
  const policy = await viewFunctionAsJson(mainnetClient, {
    accountId: 'observant-machine.sputnik-dao.near',
    methodName: 'get_policy',
    args: {}
  });
  
  const config = await viewFunctionAsJson(mainnetClient, {
    accountId: 'observant-machine.sputnik-dao.near', 
    methodName: 'get_config',
    args: {}
  });
  
  console.log('Policy fetched (first 200 chars):', JSON.stringify(policy, null, 2).substring(0, 200) + '...');
  console.log('Config fetched:', JSON.stringify(config, null, 2));
  console.log('Proposal bond from policy:', policy.proposal_bond);
  
  // Check the voting policy for Transfer proposals
  console.log('Checking voting policy for Transfer proposals...');
  console.log('Default vote policy:', policy.default_vote_policy);
  for (const role of policy.roles) {
    if (role.name === 'Approver' || role.vote_policy) {
      console.log(`Role: ${role.name}`);
      console.log('  Vote policy:', role.vote_policy);
      console.log('  Kind:', JSON.stringify(role.kind, null, 2));
    }
  }
  
  // Modify policy to add alice to the Requestor role so she can create proposals
  console.log('Adding alice to the policy...');
  
  // Find the Requestor role and add alice
  for (const role of policy.roles) {
    if (role.name === 'Requestor' && role.kind?.Group) {
      // Add alice.test.near to the Requestor group
      role.kind.Group.push(user.accountId);
      console.log(`Added ${user.accountId} to Requestor role`);
    }
    // Also add alice to Approver role so she can vote
    if (role.name === 'Approver' && role.kind?.Group) {
      role.kind.Group.push(user.accountId);
      console.log(`Added ${user.accountId} to Approver role`);
    }
  }
  
  // Initialize the DAO contract
  console.log('Initializing DAO contract with modified policy...');
  
  try {
    await sputnikDao.callRaw(sputnikDao, 'new', {
      config: config,
      policy: policy
    }, {
      gas: '300000000000000'
    });
    console.log('DAO initialized successfully');
  } catch (e) {
    console.log('Error initializing DAO:', e.message);
    // Contract might already be initialized or have different init method
  }
  
  // Fetch proposal 3 from mainnet to see what it looks like
  console.log('Fetching proposal 3 from mainnet...');
  
  try {
    // Args need to be base64 encoded
    const argsBase64 = Buffer.from(JSON.stringify({ id: 3 })).toString('base64');
    const mainnetProposal = await viewFunctionAsJson(mainnetClient, {
      accountId: 'observant-machine.sputnik-dao.near',
      methodName: 'get_proposal',
      argsBase64: argsBase64
    });
    console.log('Mainnet proposal 3:', JSON.stringify(mainnetProposal, null, 2).substring(0, 500) + '...');
  } catch (e) {
    console.log('Error fetching mainnet proposal:', e.message);
  }
  
  // Create a single proposal (ID 0) with the same content as proposal 3 from mainnet
  console.log('Creating proposal 0 with transfer...');
  
  // Check user balance before creating proposal
  const userBalance = await user.balance();
  console.log('User balance before proposal:', userBalance.total.toString());
  
  // Get the proposal bond from policy
  const proposalBond = policy.proposal_bond || '1000000000000000000000000'; // Default 1 NEAR
  console.log('Using proposal bond:', proposalBond);
  
  try {
    const proposalArgs = {
      proposal: {
        description: 'Test transfer proposal',
        kind: {
          Transfer: {
            token_id: tokenContract.accountId,
            receiver_id: 'b0075da69a92926de3355bf080e6d7988ef06eb1f1061899908a5e896b06452f',
            amount: '1000000000000000000',
            msg: null
          }
        }
      }
    };
    
    const result = await user.callRaw(sputnikDao, 'add_proposal', proposalArgs, {
      gas: '100000000000000',
      attachedDeposit: proposalBond  // Try attachedDeposit instead of deposit
    });
    console.log('Created proposal 0');
    console.log('Transaction result:', JSON.stringify(result.result.transaction, null, 2));
  } catch (e) {
    console.log('Error creating proposal:', e.message);
  }
  
  // Check existing proposals
  console.log('Checking existing proposals...');
  
  try {
    const proposalCount = await sputnikDao.view('get_last_proposal_id', {});
    console.log('Last proposal ID:', proposalCount);
    
    // Try to get proposal 0
    const proposal = await sputnikDao.view('get_proposal', { id: 0 });
    console.log('Proposal 0:', JSON.stringify(proposal, null, 2).substring(0, 300) + '...');
  } catch (e) {
    console.log('Error checking proposals:', e.message);
  }
  
  // Now let's try to reproduce the transaction
  console.log('Reproducing transaction...');
  
  // Vote with 3 Approvers to reach the threshold
  console.log('Voting with 3 Approvers to reach threshold...');
  
  // First vote from user (who is also an Approver)
  console.log('Vote 1 from:', user.accountId);
  await user.callRaw(sputnikDao, 'act_proposal', {
    id: 0,
    action: 'VoteApprove'
  }, {
    gas: '100000000000000'
  });
  
  // Second vote
  console.log('Vote 2 from:', approver2.accountId);
  await approver2.callRaw(sputnikDao, 'act_proposal', {
    id: 0,
    action: 'VoteApprove'
  }, {
    gas: '100000000000000'
  });
  
  // Third vote - this should trigger the execution with potentially gas exhaustion
  console.log('Vote 3 from:', approver3.accountId, '- This should trigger execution');
  const result = await approver3.callRaw(sputnikDao, 'act_proposal', {
    id: 0,
    action: 'VoteApprove'
  }, {
    gas: '300000000000000'  // Max gas (300 TGas)
  });
  
  console.log('Transaction result status:', result.result.status);
  
  // Check proposal status after voting
  const proposalAfterVote = await sputnikDao.view('get_proposal', { id: 0 });
  console.log('Proposal status after vote:', proposalAfterVote.status);
  
  // Check all receipts for gas exhaustion
  console.log('\nChecking receipts for gas exhaustion...');
  console.log('Number of receipts:', result.result.receipts_outcome.length);
  for (const receipt of result.result.receipts_outcome) {
    console.log('Receipt ID:', receipt.id);
    console.log('Executor:', receipt.outcome.executor_id);  
    console.log('Gas burnt:', receipt.outcome.gas_burnt);
    console.log('Status:', JSON.stringify(receipt.outcome.status, null, 2));
    if (receipt.outcome.logs && receipt.outcome.logs.length > 0) {
      console.log('Logs:', receipt.outcome.logs);
    }
    console.log('---');
  }
  
} catch (error) {
  console.error('Error reproducing transaction:', error);
  console.error('Error details:', error.message);
  if (error.logs) {
    console.error('Logs:', error.logs);
  }
} finally {
  await worker.tearDown();
}