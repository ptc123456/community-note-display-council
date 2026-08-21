import React from 'react';

interface CouncilDotProps {
  isConnected: boolean;
  isTxSuccess: boolean;
}

export const CouncilDot: React.FC<CouncilDotProps> = ({ isConnected, isTxSuccess }) => {
  const className = [
    'council-dot',
    isTxSuccess ? 'success' : isConnected ? 'connected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={className}
      title={
        isTxSuccess
          ? 'Council status: Transaction reconciled'
          : isConnected
            ? 'Council status: Wallet connected'
            : 'Council status: Idle'
      }
      aria-hidden="true"
    />
  );
};
