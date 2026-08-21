import React, { useEffect, useRef } from 'react';
import { useWallet } from './WalletContext';

export const WalletModal: React.FC = () => {
  const { providers, isModalOpen, closeModal, connect, isConnecting, error } = useWallet();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isModalOpen) {
      if (!dialog.open) {
        try {
          dialog.showModal();
          dialog
            .querySelector<HTMLElement>('.wallet-option-btn:not(:disabled), .modal-actions button:not(:disabled)')
            ?.focus();
        } catch {
          // Fallback if already open
        }
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isModalOpen]);

  // Handle native backdrop clicks
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
      closeModal();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      onClick={handleDialogClick}
      onClose={closeModal}
      aria-labelledby="wallet-modal-title"
    >
      <div className="modal-header">
        <h2 id="wallet-modal-title" className="modal-title">
          Connect Wallet
        </h2>
        <button
          type="button"
          className="modal-close-btn"
          onClick={closeModal}
          aria-label="Close modal"
          disabled={isConnecting}
        >
          Close
        </button>
      </div>

      <div className="modal-body">
        <p style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)' }}>
          Select a detected EIP-6963 wallet to connect to Studionet. No auto-connection or background RPC requests will be made without explicit user selection.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-coral-muted)',
              border: '1px solid var(--color-coral)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--color-coral)',
              fontSize: 'var(--text-xs)',
              marginBottom: 'var(--space-4)',
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        {providers.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-6)',
              textAlign: 'center',
              backgroundColor: 'var(--color-paper-2)',
              borderRadius: 'var(--radius-input)',
              border: '1px dashed var(--color-border)',
            }}
          >
            <p style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>No Supported Wallet Detected</p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
              Please install and enable MetaMask, OKX Wallet, or Rabby browser extension.
            </p>
          </div>
        ) : (
          <ul className="wallet-option-list" role="list">
            {providers.map((p) => (
              <li key={p.info.uuid || p.info.rdns}>
                <button
                  type="button"
                  className="wallet-option-btn"
                  onClick={() => connect(p)}
                  disabled={isConnecting}
                  aria-label={`Connect ${p.info.name}`}
                >
                  {p.info.icon ? (
                    <img src={p.info.icon} alt="" className="wallet-icon" aria-hidden="true" />
                  ) : (
                    <div
                      className="wallet-icon"
                      style={{
                        backgroundColor: 'var(--color-paper-3)',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 700,
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      W
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div className="wallet-name">{p.info.name}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                      RDNS: {p.info.rdns}
                    </div>
                  </div>
                  {isConnecting && <span style={{ fontSize: 'var(--text-xs)' }}>Connecting...</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="modal-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={closeModal}
          disabled={isConnecting}
        >
          Cancel
        </button>
      </div>
    </dialog>
  );
};
