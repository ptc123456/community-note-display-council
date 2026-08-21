import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { EIP1193Provider } from '../wallet/eip6963';
import { isValidContractAddress } from './types';

// Read-only client connected to Studionet
export function getReadClient() {
  return createClient({
    chain: studionet,
  });
}

// Factory for provider-bound write client
export async function getWriteClient(provider: EIP1193Provider, account: string) {
  const client = createClient({
    chain: studionet,
    account: account as any,
    provider: provider as any,
  });

  // Explicitly connect to studionet per contract specification
  if (typeof client.connect === 'function') {
    await client.connect('studionet');
  }

  return client;
}

export function getConfiguredContractAddress(): string {
  const address = import.meta.env.VITE_CONTRACT_ADDRESS;
  if (!isValidContractAddress(address)) {
    return '';
  }
  return address.trim();
}
