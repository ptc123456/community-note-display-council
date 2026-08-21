import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type React from 'react';
import { WalletProvider, useWallet } from '../wallet/WalletContext';
import { WalletModal } from '../wallet/WalletModal';
import {
  EIP6963ProviderDetail,
  globalEIP6963Store,
  isSupportedProvider,
} from '../wallet/eip6963';

// Test consumer component
const TestWalletConsumer: React.FC = () => {
  const { isConnected, account, openModal, disconnect, selectedProvider, error } = useWallet();
  return (
    <div>
      <div data-testid="status">{isConnected ? 'connected' : 'disconnected'}</div>
      <div data-testid="account">{account || 'none'}</div>
      <div data-testid="provider-name">{selectedProvider?.info.name || 'none'}</div>
      {error && <div data-testid="error">{error}</div>}
      <button onClick={openModal}>Open Connect</button>
      <button onClick={disconnect}>Disconnect</button>
      <WalletModal />
    </div>
  );
};

describe('EIP-6963 Wallet Lifecycle & Isolation', () => {
  beforeEach(() => {
    globalEIP6963Store.clear();
    vi.clearAllMocks();
  });

  it('1. Chooser open/cancel triggers zero RPC calls', async () => {
    const mockRequest = vi.fn();
    const fakeMetaMask: EIP6963ProviderDetail = {
      info: {
        uuid: 'mm-1',
        name: 'MetaMask',
        icon: 'data:image/svg+xml;base64,mock',
        rdns: 'io.metamask',
      },
      provider: {
        request: mockRequest,
      },
    };

    render(
      <WalletProvider>
        <TestWalletConsumer />
      </WalletProvider>
    );

    // Announce provider
    act(() => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', { detail: fakeMetaMask })
      );
    });

    // Open modal
    const openBtn = screen.getByText('Open Connect');
    fireEvent.click(openBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Connect Wallet')).toBeInTheDocument();

    // Cancel modal
    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);

    // Assert ZERO RPC requests occurred
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('2. Exact RDNS trust boundary: only verified RDNS allowed, name-based spoofs strictly rejected', () => {
    const metaMask: EIP6963ProviderDetail = {
      info: { uuid: '1', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
      provider: { request: vi.fn() },
    };
    const metaMaskMobile: EIP6963ProviderDetail = {
      info: { uuid: '1b', name: 'MetaMask Mobile', icon: '', rdns: 'io.metamask.mobile' },
      provider: { request: vi.fn() },
    };
    const metaMaskMmi: EIP6963ProviderDetail = {
      info: { uuid: '1c', name: 'MetaMask Institutional', icon: '', rdns: 'io.metamask.mmi' },
      provider: { request: vi.fn() },
    };
    const rabby: EIP6963ProviderDetail = {
      info: { uuid: '2', name: 'Rabby Wallet', icon: '', rdns: 'io.rabby' },
      provider: { request: vi.fn() },
    };
    const okx: EIP6963ProviderDetail = {
      info: { uuid: '3', name: 'OKX Wallet', icon: '', rdns: 'com.okex.wallet' },
      provider: { request: vi.fn() },
    };
    const spoofedMetaMask: EIP6963ProviderDetail = {
      info: { uuid: '4', name: 'MetaMask Fake Extension', icon: '', rdns: 'com.evil.metamask' },
      provider: { request: vi.fn() },
    };
    const spoofedRabby: EIP6963ProviderDetail = {
      info: { uuid: '5', name: 'Rabby', icon: '', rdns: 'org.phishing.rabby' },
      provider: { request: vi.fn() },
    };
    const unknownWallet: EIP6963ProviderDetail = {
      info: { uuid: '6', name: 'Some Random Wallet', icon: '', rdns: 'com.unknown.wallet' },
      provider: { request: vi.fn() },
    };

    expect(isSupportedProvider(metaMask)).toBe(true);
    expect(isSupportedProvider(metaMaskMobile)).toBe(false);
    expect(isSupportedProvider(metaMaskMmi)).toBe(false);
    expect(isSupportedProvider(rabby)).toBe(true);
    expect(isSupportedProvider(okx)).toBe(true);

    // Spoofed display names MUST be rejected
    expect(isSupportedProvider(spoofedMetaMask)).toBe(false);
    expect(isSupportedProvider(spoofedRabby)).toBe(false);
    expect(isSupportedProvider(unknownWallet)).toBe(false);
  });

  it('3. Selected-provider call isolation with multiple providers', async () => {
    const metaMaskRequest = vi.fn().mockResolvedValue(['0x1111111111111111111111111111111111111111']);
    const rabbyRequest = vi.fn();
    const okxRequest = vi.fn();

    const mmDetail: EIP6963ProviderDetail = {
      info: { uuid: 'mm', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
      provider: { request: metaMaskRequest, on: vi.fn(), removeListener: vi.fn() },
    };
    const rabbyDetail: EIP6963ProviderDetail = {
      info: { uuid: 'rb', name: 'Rabby', icon: '', rdns: 'io.rabby' },
      provider: { request: rabbyRequest, on: vi.fn(), removeListener: vi.fn() },
    };
    const okxDetail: EIP6963ProviderDetail = {
      info: { uuid: 'ok', name: 'OKX Wallet', icon: '', rdns: 'com.okex.wallet' },
      provider: { request: okxRequest, on: vi.fn(), removeListener: vi.fn() },
    };

    render(
      <WalletProvider>
        <TestWalletConsumer />
      </WalletProvider>
    );

    act(() => {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: mmDetail }));
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: rabbyDetail }));
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: okxDetail }));
    });

    fireEvent.click(screen.getByText('Open Connect'));

    // Select MetaMask only
    const mmBtn = screen.getByLabelText('Connect MetaMask');
    await act(async () => {
      fireEvent.click(mmBtn);
    });

    // Verify only MetaMask received the eth_requestAccounts call
    expect(metaMaskRequest).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
    expect(rabbyRequest).not.toHaveBeenCalled();
    expect(okxRequest).not.toHaveBeenCalled();

    expect(screen.getByTestId('status')).toHaveTextContent('connected');
    expect(screen.getByTestId('account')).toHaveTextContent('0x1111111111111111111111111111111111111111');
    expect(screen.getByTestId('provider-name')).toHaveTextContent('MetaMask');
  });

  it('4. Reload initial state is disconnected and no auto request occurs', () => {
    const mockRequest = vi.fn();
    const fakeMetaMask: EIP6963ProviderDetail = {
      info: { uuid: 'mm', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
      provider: { request: mockRequest },
    };

    render(
      <WalletProvider>
        <TestWalletConsumer />
      </WalletProvider>
    );

    act(() => {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: fakeMetaMask }));
    });

    expect(screen.getByTestId('status')).toHaveTextContent('disconnected');
    expect(screen.getByTestId('account')).toHaveTextContent('none');
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('5. User rejection, accountsChanged, chainChanged, and disconnect cleanup', async () => {
    let accountsListener: ((accs: string[]) => void) | null = null;
    let chainListener: ((c: string) => void) | null = null;

    const onMock = vi.fn((event, handler) => {
      if (event === 'accountsChanged') accountsListener = handler;
      if (event === 'chainChanged') chainListener = handler;
    });
    const removeListenerMock = vi.fn();

    // 5a. Rejection
    const rejectingRequest = vi.fn().mockRejectedValue({ code: 4001, message: 'User rejected the request' });
    const rejectingProvider: EIP6963ProviderDetail = {
      info: { uuid: 'mm-rej', name: 'MetaMask Rejection', icon: '', rdns: 'io.metamask' },
      provider: { request: rejectingRequest },
    };

    const { unmount } = render(
      <WalletProvider>
        <TestWalletConsumer />
      </WalletProvider>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', { detail: rejectingProvider })
      );
    });

    fireEvent.click(screen.getByText('Open Connect'));
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Connect MetaMask Rejection'));
    });

    expect(screen.getByTestId('status')).toHaveTextContent('disconnected');
    expect(screen.getByTestId('error')).toHaveTextContent('Connection rejected by user.');

    unmount();
    globalEIP6963Store.clear();

    // 5b. Connect and handle accountsChanged / chainChanged / disconnect
    const successfulRequest = vi
      .fn()
      .mockResolvedValueOnce(['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']) // eth_requestAccounts
      .mockResolvedValueOnce('0xf22f'); // eth_chainId (61999)

    const goodProvider: EIP6963ProviderDetail = {
      info: { uuid: 'mm-good', name: 'MetaMask Active', icon: '', rdns: 'io.metamask' },
      provider: {
        request: successfulRequest,
        on: onMock,
        removeListener: removeListenerMock,
      },
    };

    render(
      <WalletProvider>
        <TestWalletConsumer />
      </WalletProvider>
    );

    act(() => {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: goodProvider }));
    });

    fireEvent.click(screen.getByText('Open Connect'));
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Connect MetaMask Active'));
    });

    expect(screen.getByTestId('status')).toHaveTextContent('connected');
    expect(screen.getByTestId('account')).toHaveTextContent(
      '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    );

    // Test chainChanged
    act(() => {
      if (chainListener) {
        chainListener('0xf22f');
      }
    });
    expect(screen.getByTestId('status')).toHaveTextContent('connected');

    // Test accountsChanged with new account
    act(() => {
      if (accountsListener) {
        accountsListener(['0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB']);
      }
    });
    expect(screen.getByTestId('account')).toHaveTextContent(
      '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
    );

    // Test accountsChanged with empty array (user locked wallet)
    act(() => {
      if (accountsListener) {
        accountsListener([]);
      }
    });
    expect(screen.getByTestId('status')).toHaveTextContent('disconnected');

    // Test explicit disconnect cleans up listeners
    fireEvent.click(screen.getByText('Disconnect'));
    expect(removeListenerMock).toHaveBeenCalled();
  });
});
