import { NearRpcClient, tx } from '@psalomo/jsonrpc-client';

  const client = new NearRpcClient('https://archival-rpc.mainnet.fastnear.com');
  
  try {
    // Fetch the transaction
    const txResult = await tx(client, {
      txHash: '7XiaQG8YVv5BsJQETBG9iEDrSag6TyCcpGe6f5jAm3LF',
      senderAccountId: 'aurora'
    });
    console.log('Transaction:', JSON.stringify(txResult, null, 2));
  } catch (error) {
    console.log('Error fetching transaction:', error.message);
  }
