import React from 'react';
import { TxProgress, getExplorerTxUrl } from '../genlayer/types';

interface TransactionBannerProps {
  progress: TxProgress | null;
  onClear: () => void;
  onRetry?: () => void;
}

export const TransactionBanner: React.FC<TransactionBannerProps> = ({
  progress,
  onClear,
  onRetry,
}) => {
  if (!progress || progress.step === 'idle') return null;

  const isFinalized = progress.step === 'reconciled';
  const isReadbackPending = progress.step === 'readback_pending';
  const isError = progress.step === 'error' || progress.step === 'execution_error';

  return (
    <aside
      aria-label="Transaction Status"
      className={`tx-banner ${isFinalized ? 'finalized' : isError ? 'error' : isReadbackPending ? 'pending' : ''}`}
      style={{ margin: 'var(--space-4) 0' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {progress.step === 'awaiting_signature' && 'Awaiting Wallet Signature...'}
          {progress.step === 'submitted' && 'Transaction Submitted to Mempool'}
          {progress.step === 'finalizing' && 'Validators Reaching Consensus (Finalizing)...'}
          {progress.step === 'finalized' && 'Finalized on Studionet'}
          {progress.step === 'reconciling' &&
            `Reconciling On-Chain State (Attempt ${progress.reconcileAttempts || 1})...`}
          {progress.step === 'readback_pending' && 'State Readback Pending (Finalized On-Chain)'}
          {progress.step === 'reconciled' && 'Complete and Reconciled'}
          {progress.step === 'execution_error' && 'Execution Error (FINISHED_WITH_ERROR)'}
          {progress.step === 'error' && 'Transaction Failed'}
          <span style={{ fontWeight: 400, color: 'var(--color-ink-muted)' }}>· {progress.title}</span>
        </strong>

        <button
          type="button"
          onClick={onClear}
          className="btn btn-outline"
          style={{ padding: '0 var(--space-3)', fontSize: 'var(--text-xs)' }}
          aria-label="Dismiss banner"
        >
          Dismiss
        </button>
      </div>

      {progress.hash && (
        <div style={{ fontSize: 'var(--text-xs)', wordBreak: 'break-all' }}>
          <span>Transaction Hash: </span>
          <a
            href={getExplorerTxUrl(progress.hash)}
            target="_blank"
            rel="noreferrer"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {progress.hash}
          </a>
        </div>
      )}

      {progress.error && (
        <div
          role="alert"
          style={{ fontSize: 'var(--text-xs)', color: 'var(--color-coral)', fontWeight: 600 }}
        >
          {progress.error}
        </div>
      )}

      {(isError || isReadbackPending) && onRetry && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRetry}
            style={{ minHeight: '44px', fontSize: 'var(--text-xs)', padding: '0 var(--space-4)' }}
          >
            {isReadbackPending ? 'Retry Readback Verification' : 'Retry Action'}
          </button>
        </div>
      )}
    </aside>
  );
};
