import React from 'react';
import { ScoreRecord } from '../genlayer/types';

interface ScoreBreakdownProps {
  score: ScoreRecord;
  isWinner: boolean;
}

export const ScoreBreakdown: React.FC<ScoreBreakdownProps> = ({ score, isWinner }) => {
  return (
    <div
      style={{
        marginTop: 'var(--space-3)',
        padding: 'var(--space-3)',
        backgroundColor: 'var(--color-paper-2)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)',
        fontSize: 'var(--text-xs)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-2)',
          fontWeight: 700,
        }}
      >
        <span>Council Rubric Score</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: isWinner ? 'var(--color-cyan)' : 'var(--color-ink)',
          }}
        >
          {score.total.toLocaleString()} / 10,000 bps ({((score.total / 10000) * 100).toFixed(2)}%)
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'var(--space-2)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div>
          <span style={{ color: 'var(--color-ink-muted)' }}>Relevance (35%): </span>
          <strong>{score.relevance}/100</strong>
        </div>
        <div>
          <span style={{ color: 'var(--color-ink-muted)' }}>Source Quality (35%): </span>
          <strong>{score.source_quality}/100</strong>
        </div>
        <div>
          <span style={{ color: 'var(--color-ink-muted)' }}>Clarity (20%): </span>
          <strong>{score.clarity}/100</strong>
        </div>
        <div>
          <span style={{ color: 'var(--color-ink-muted)' }}>Contradiction Risk (10%): </span>
          <strong>{score.contradiction_risk}/100</strong>
        </div>
      </div>
    </div>
  );
};
