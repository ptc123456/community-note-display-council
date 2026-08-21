import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  EIP6963ProviderDetail,
  EIP1193Provider,
  globalEIP6963Store,
} from './eip6963';

export interface WalletState {
  providers: EIP6963ProviderDetail[];
  selectedProvider: EIP6963ProviderDetail | null;
  account: string | null;
  chainId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  connect: (providerDetail: EIP6963ProviderDetail) => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
}

const WalletContext = createContext<WalletState | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [providers, setProviders] = useState<EIP6963ProviderDetail[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<EIP6963ProviderDetail | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Keep ref to clean up active provider listeners
  const activeListenersRef = useRef<{
    provider: EIP1193Provider;
    onAccountsChanged: (accounts: string[]) => void;
    onChainChanged: (chain: string) => void;
  } | null>(null);

  // Initialize EIP-6963 discovery without persisting or auto-connecting
  useEffect(() => {
    const cleanupStore = globalEIP6963Store.init();
    const unsubscribe = globalEIP6963Store.subscribe((discovered) => {
      setProviders(discovered);
    });

    return () => {
      unsubscribe();
      cleanupStore();
    };
  }, []);

  const removeActiveListeners = useCallback(() => {
    if (activeListenersRef.current) {
      const { provider, onAccountsChanged, onChainChanged } = activeListenersRef.current;
      if (typeof provider.removeListener === 'function') {
        try {
          provider.removeListener('accountsChanged', onAccountsChanged);
          provider.removeListener('chainChanged', onChainChanged);
        } catch {
          // Ignore listener removal failure
        }
      }
      activeListenersRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    removeActiveListeners();
    setSelectedProvider(null);
    setAccount(null);
    setChainId(null);
    setIsConnecting(false);
    setError(null);
  }, [removeActiveListeners]);

  const connect = useCallback(
    async (detail: EIP6963ProviderDetail) => {
      setIsConnecting(true);
      setError(null);

      // Clean up any existing listeners first
      removeActiveListeners();

      try {
        const provider = detail.provider;
        const accounts = (await provider.request({
          method: 'eth_requestAccounts',
        })) as string[];

        if (!accounts || accounts.length === 0) {
          throw new Error('No accounts returned from wallet.');
        }

        let currentChainId = '';
        try {
          currentChainId = (await provider.request({ method: 'eth_chainId' })) as string;
        } catch {
          // Non-fatal if chainId fetch fails
        }

        const primaryAccount = accounts[0];
        setAccount(primaryAccount);
        setSelectedProvider(detail);
        setChainId(currentChainId);
        setIsModalOpen(false);

        // Bind event listeners
        const handleAccountsChanged = (newAccounts: string[]) => {
          if (!newAccounts || newAccounts.length === 0) {
            disconnect();
          } else {
            setAccount(newAccounts[0]);
          }
        };

        const handleChainChanged = (newChain: string) => {
          setChainId(newChain);
        };

        if (typeof provider.on === 'function') {
          provider.on('accountsChanged', handleAccountsChanged);
          provider.on('chainChanged', handleChainChanged);
          activeListenersRef.current = {
            provider,
            onAccountsChanged: handleAccountsChanged,
            onChainChanged: handleChainChanged,
          };
        }
      } catch (err: any) {
        removeActiveListeners();
        setSelectedProvider(null);
        setAccount(null);
        setChainId(null);
        if (err?.code === 4001 || err?.message?.includes('User rejected') || err?.message?.includes('rejected')) {
          setError('Connection rejected by user.');
        } else {
          setError(err?.message || 'Failed to connect to wallet.');
        }
      } finally {
        setIsConnecting(false);
      }
    },
    [disconnect, removeActiveListeners]
  );

  const openModal = useCallback(() => {
    setError(null);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      removeActiveListeners();
    };
  }, [removeActiveListeners]);

  return (
    <WalletContext.Provider
      value={{
        providers,
        selectedProvider,
        account,
        chainId,
        isConnected: Boolean(account && selectedProvider),
        isConnecting,
        error,
        isModalOpen,
        openModal,
        closeModal,
        connect,
        disconnect,
        clearError,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = (): WalletState => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
