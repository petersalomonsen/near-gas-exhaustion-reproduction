import { NearRpcClient, tx } from '@psalomo/jsonrpc-client';

const client = new NearRpcClient('https://archival-rpc.mainnet.fastnear.com');

// Fetch the transaction
const txResult = await tx(client, {
  txHash: '7XiaQG8YVv5BsJQETBG9iEDrSag6TyCcpGe6f5jAm3LF',
  senderAccountId: 'aurora'
});

// Find the receipt with gas exhaustion
for (const receipt of txResult.receiptsOutcome) {
  if (receipt.outcome.status.Failure?.ActionError?.kind?.FunctionCallError?.ExecutionError === "Exceeded the prepaid gas.") {
    console.log('Found gas exhaustion in receipt:', receipt.id);
    console.log('Executor:', receipt.outcome.executorId);
    console.log('Gas burnt:', receipt.outcome.gasBurnt);
    console.log('Full receipt:', JSON.stringify(receipt, null, 2));
  }
}