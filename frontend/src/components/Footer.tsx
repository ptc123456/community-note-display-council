import React from 'react';
import { STUDIONET_EXPLORER, getExplorerAddressUrl } from '../genlayer/types';

interface FooterProps {
  contractAddress: string;
}

export const Footer: React.FC<FooterProps> = ({ contractAddress }) => {
  return (
    <footer className="ft5-footer">
      <div className="ft5-content">
        <p className="ft5-statement">
          The Community Note Display Council ranks competing contextual notes for public content snapshots through decentralized GenLayer validator consensus. It is a contextual evidence ranking mechanism, not a universal truth oracle or censorship authority.
        </p>

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', lineHeight: '1.4' }}>
          <strong>Civic & Trust Disclosure:</strong> Wallet addresses are pseudonymous. Sybil resistance is not provided. Reputation is non-transferable, non-economic, and represents only this application's finalized evidence history.
        </p>

        <div className="ft5-meta">
          <div>
            <span>Network: </span>
            <a href={STUDIONET_EXPLORER} target="_blank" rel="noreferrer">
              GenLayer Studionet (Chain 61999)
            </a>
          </div>

          {contractAddress && (
            <div>
              <span>Council Contract: </span>
              <a
                href={getExplorerAddressUrl(contractAddress)}
                target="_blank"
                rel="noreferrer"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {contractAddress}
              </a>
            </div>
          )}

          <div>
            <span>Format: </span>
            <span>Hallmark Workbench (Hum)</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
