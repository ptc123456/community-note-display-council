import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '../wallet/WalletContext';
import { fetchReputation } from '../genlayer/repository';
import { isValidContractAddress, formatAddress } from '../genlayer/types';

interface ReputationModalProps {
  isOpen: boolean;
  onClose: () => void;
  contractAddress: string;
}

export const ReputationModal: React.FC<ReputationModalProps> = ({
  isOpen,
  onClose,
  contractAddress,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { account, isConnected } = useWallet();

  const [connectedReputation, setConnectedReputation] = useState<bigint | null>(null);
  const [lookupAddress, setLookupAddress] = useState('');
  const [lookupReputation, setLookupReputation] = useState<bigint | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        try {
          dialog.showModal();
          dialog.querySelector<HTMLElement>('#lookup-address-input')?.focus();
        } catch {
          // Fallback
        }
      }
      // Fetch connected account reputation if connected
      if (isConnected && account && contractAddress) {
        fetchReputation(contractAddress, account)
          .then((rep) => setConnectedReputation(rep))
          .catch(() => setConnectedReputation(0n));
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen, isConnected, account, contractAddress]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = lookupAddress.trim();
    if (!isValidContractAddress(addr)) {
      setError('Please enter a valid 0x hexadecimal address (40 hex chars).');
      return;
    }

    if (!contractAddress) {
      setError('Council contract address is not configured.');
      return;
    }

    setError(null);
    setIsSearching(true);
    try {
      const rep = await fetchReputation(contractAddress, addr);
      setLookupReputation(rep);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch reputation for address.');
      setLookupReputation(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    const isInDialog =
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width;
    if (!isInDialog) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      onClick={handleDialogClick}
      onClose={onClose}
      aria-labelledby="reputation-modal-title"
    >
      <div className="modal-header">
        <h2 id="reputation-modal-title" className="modal-title">
          Author & Challenger Reputation
        </h2>
        <button
          type="button"
          className="modal-close-btn"
          onClick={onClose}
          aria-label="Close modal"
        >
          Close
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Connected Wallet Reputation */}
        {isConnected && account ? (
          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--color-paper-2)',
              borderRadius: 'var(--radius-input)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
              Connected Wallet ({formatAddress(account)})
            </div>
            <div
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 700,
                color: 'var(--color-ink)',
                fontFamily: 'var(--font-mono)',
                marginTop: 'var(--space-1)',
              }}
            >
              {connectedReputation !== null ? `${connectedReputation.toString()} pts` : 'Loading...'}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-paper-3)',
              borderRadius: 'var(--radius-input)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-ink-muted)',
            }}
          >
            Connect your wallet to view your personal council reputation points.
          </div>
        )}

        {/* Address Search Form */}
        <form onSubmit={handleLookup}>
          <div className="form-group">
            <label htmlFor="lookup-address-input" className="form-label">
              Lookup Any Wallet Address
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input
                id="lookup-address-input"
                type="text"
                className={`form-input ${error ? 'error' : ''}`}
                placeholder="0x1234567890abcdef1234567890abcdef12345678"
                value={lookupAddress}
                onChange={(e) => {
                  setLookupAddress(e.target.value);
                  setLookupReputation(null);
                  setError(null);
                }}
                aria-invalid={Boolean(error)}
                aria-describedby="lookup-address-help"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSearching}
                style={{ minHeight: '44px', padding: '0 var(--space-4)' }}
              >
                {isSearching ? '...' : 'Search'}
              </button>
            </div>
            <div id="lookup-address-help" className={`form-helper ${error ? 'error' : ''}`}>
              {error || 'Queries the authoritative on-chain reputation for any address.'}
            </div>
          </div>
        </form>

        {lookupReputation !== null && (
          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--color-paper-2)',
              borderRadius: 'var(--radius-input)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
              Reputation for {formatAddress(lookupAddress)}
            </div>
            <div
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-ink)',
                marginTop: 'var(--space-1)',
              }}
            >
              {lookupReputation.toString()} pts
            </div>
          </div>
        )}

        {/* Civic Disclosure */}
        <div
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--color-paper-3)',
            borderRadius: 'var(--radius-input)',
            border: '1px solid var(--color-border)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-ink-muted)',
            lineHeight: '1.4',
          }}
        >
          <strong>Civic and Trust Disclosure:</strong>
          <br />
          Wallet addresses are pseudonymous. Sybil resistance is not provided. Reputation is
          non-transferable, non-economic, and represents only this application's finalized evidence
          history (+2 for DISPLAY author, +1 for DISPLAY_WITH_WARNING author, +1 for impactful
          challenger).
        </div>
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
};
