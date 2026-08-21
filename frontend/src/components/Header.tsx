import React from 'react';
import { useWallet } from '../wallet/WalletContext';
import { CouncilDot } from './CouncilDot';
import { formatAddress, STUDIONET_EXPLORER } from '../genlayer/types';

interface HeaderProps {
  onOpenReputation: () => void;
  isTxSuccess: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onOpenReputation, isTxSuccess }) => {
  const { account, isConnected, openModal, disconnect } = useWallet();

  return (
    <header className="n7-header">
      <div className="brand-wrapper">
        <CouncilDot isConnected={isConnected} isTxSuccess={isTxSuccess} />
        <span className="brand-title">Community Note Display Council</span>
      </div>

      <div className="header-actions">
        <a
          href={STUDIONET_EXPLORER}
          target="_blank"
          rel="noreferrer"
          className="network-badge"
          title="Connected to GenLayer Studionet (Chain ID 61999)"
        >
          <span className="network-indicator" />
          <span>Studionet (61999)</span>
        </a>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onOpenReputation}
          style={{ padding: '0 var(--space-3)', fontSize: 'var(--text-xs)' }}
        >
          Reputation
        </button>

        {isConnected && account ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span
              className="badge"
              style={{
                backgroundColor: 'var(--color-paper-3)',
                border: '1px solid var(--color-border)',
                fontFamily: 'var(--font-mono)',
                padding: 'var(--space-1) var(--space-3)',
              }}
              title={account}
            >
              {formatAddress(account)}
            </span>
            <button
              type="button"
              className="btn btn-outline"
              onClick={disconnect}
              style={{ padding: '0 var(--space-3)', fontSize: 'var(--text-xs)' }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={openModal}
            style={{ padding: '0 var(--space-4)', fontSize: 'var(--text-sm)' }}
          >
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
};
