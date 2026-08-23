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
export function getWriteClient(provider: EIP1193Provider, account: string) {
  return createClient({
    chain: studionet,
    account: account as any,
    provider: provider as any,
  });
}

export function getConfiguredContractAddress(): string {
  const address = import.meta.env.VITE_CONTRACT_ADDRESS;
  if (!isValidContractAddress(address)) {
    return '';
  }
  return address.trim();
}
