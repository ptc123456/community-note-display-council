import React, { useState, useMemo } from 'react';
import { CaseData, CaseState, formatTimestamp } from '../genlayer/types';

interface CaseFeedProps {
  cases: CaseData[];
  selectedCaseId: number | null;
  onSelectCase: (caseId: number) => void;
  onOpenCreateCase: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const CaseFeed: React.FC<CaseFeedProps> = ({
  cases,
  selectedCaseId,
  onSelectCase,
  onOpenCreateCase,
  onRefresh,
  isLoading,
  error,
  onRetry,
}) => {
  const [filterState, setFilterState] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const matchesState = filterState === 'ALL' || c.state === filterState;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        c.id.toString().includes(query) ||
        c.content_url.toLowerCase().includes(query) ||
        c.creator.toLowerCase().includes(query);
      return matchesState && matchesSearch;
    });
  }, [cases, filterState, searchQuery]);

  const getStateBadgeClass = (state: CaseState) => {
    switch (state) {
      case 'OPEN':
        return 'badge badge-open';
      case 'LOCKED':
        return 'badge badge-locked';
      case 'CHALLENGE':
        return 'badge badge-challenge';
      case 'EVALUATED':
        return 'badge badge-evaluated';
      case 'FINALIZED':
        return 'badge badge-finalized';
      default:
        return 'badge';
    }
  };

  return (
    <aside className="case-rail" aria-label="Case Browser">
      <div className="rail-header">
        <h2 className="rail-title">Council Cases</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onOpenCreateCase}
          style={{ minHeight: '44px', padding: '0 var(--space-3)', fontSize: 'var(--text-xs)' }}
        >
          + New Case
        </button>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <input
          type="search"
          placeholder="Search by ID or URL..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="form-input"
          style={{ minHeight: '44px', fontSize: 'var(--text-xs)' }}
          aria-label="Search cases"
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onRefresh}
          disabled={isLoading}
          style={{ minHeight: '44px', padding: '0 var(--space-3)', fontSize: 'var(--text-xs)' }}
          title="Refresh cases from Studionet"
        >
          {isLoading ? '...' : 'Refresh'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
        {['ALL', 'OPEN', 'LOCKED', 'CHALLENGE', 'EVALUATED', 'FINALIZED'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterState(s)}
            className={`badge filter-button ${filterState === s ? 'active' : ''}`}
          >
            {s}
          </button>
        ))}
      </div>

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
          }}
        >
          <div>{error}</div>
          {onRetry && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRetry}
              style={{ marginTop: 'var(--space-2)', minHeight: '36px', fontSize: 'var(--text-xs)' }}
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div className="case-list" role="list">
        {isLoading && cases.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
            Loading cases from Studionet...
          </div>
        ) : filteredCases.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-6)',
              textAlign: 'center',
              color: 'var(--color-ink-muted)',
              fontSize: 'var(--text-xs)',
            }}
          >
            No cases found matching filter.
          </div>
        ) : (
          filteredCases.map((c) => (
            <div
              key={c.id}
              role="listitem"
              className={`case-item ${selectedCaseId === c.id ? 'active' : ''}`}
              onClick={() => onSelectCase(c.id)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectCase(c.id);
                }
              }}
              aria-label={`Case #${c.id} - ${c.state}`}
            >
              <div className="case-item-header">
                <span className="case-id-tag">Case #{c.id}</span>
                <span className={getStateBadgeClass(c.state)}>{c.state}</span>
              </div>
              <div className="case-url-preview" title={c.content_url}>
                {c.content_url}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-ink-muted)',
                }}
              >
                <span>
                  {c.note_count}/5 notes · {c.challenge_count}/3 chg
                </span>
                <span>{formatTimestamp(c.created_at)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
};
