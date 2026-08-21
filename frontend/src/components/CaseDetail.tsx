import React from 'react';
import {
  CaseData,
  CandidateNote,
  ChallengeData,
  formatAddress,
  formatTimestamp,
  DisplayConsequence,
} from '../genlayer/types';
import { ScoreBreakdown } from './ScoreBreakdown';
import { useWallet } from '../wallet/WalletContext';

interface CaseDetailProps {
  caseData: CaseData | null;
  notes: CandidateNote[];
  challenges: ChallengeData[];
  isLoading: boolean;
  isContractConfigured?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onOpenSubmitNote: () => void;
  onOpenSubmitChallenge: () => void;
  onLockCase: () => void;
  onEvaluateCase: () => void;
  onResolveChallenges: () => void;
  onFinalizeCase: () => void;
  isActionPending: boolean;
}

export const CaseDetail: React.FC<CaseDetailProps> = ({
  caseData,
  notes,
  challenges,
  isLoading,
  isContractConfigured = true,
  error,
  onRetry,
  onOpenSubmitNote,
  onOpenSubmitChallenge,
  onLockCase,
  onEvaluateCase,
  onResolveChallenges,
  onFinalizeCase,
  isActionPending,
}) => {
  const { isConnected, account } = useWallet();

  if (error) {
    return (
      <main className="evidence-workspace" aria-label="Evidence Workspace Error">
        <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
          <div
            role="alert"
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--color-coral-muted)',
              border: '1.5px solid var(--color-coral)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--color-coral)',
              marginBottom: 'var(--space-4)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <strong>Error loading case details:</strong> {error}
          </div>
          {onRetry && (
            <button type="button" className="btn btn-secondary" onClick={onRetry}>
              Retry Loading Case
            </button>
          )}
        </div>
      </main>
    );
  }

  if (!caseData) {
    return (
      <main className="evidence-workspace" aria-label="Evidence Workspace">
        <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
          <h3 style={{ marginBottom: 'var(--space-2)' }}>No Case Selected</h3>
          <p style={{ fontSize: 'var(--text-sm)' }}>
            Select a case from the council rail or create a new case to inspect evidence, notes, and validator decisions.
          </p>
        </div>
      </main>
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const isSubmissionOpen = caseData.state === 'OPEN' && nowSeconds < caseData.submission_deadline;
  const canLock = caseData.state === 'OPEN' && nowSeconds >= caseData.submission_deadline;
  const canEvaluate = caseData.state === 'LOCKED';
  const isChallengeOpen =
    caseData.state === 'CHALLENGE' &&
    caseData.challenge_deadline > 0 &&
    nowSeconds < caseData.challenge_deadline;
  const canResolve =
    caseData.state === 'CHALLENGE' &&
    caseData.challenge_deadline > 0 &&
    nowSeconds >= caseData.challenge_deadline;
  const canFinalize = caseData.state === 'EVALUATED';

  // Check if current user already authored note or challenge
  const userHasAuthoredNote = notes.some(
    (n) => n.author.toLowerCase() === (account || '').toLowerCase()
  );
  const userHasAuthoredChallenge = challenges.some(
    (ch) => ch.challenger.toLowerCase() === (account || '').toLowerCase()
  );

  const getConsequenceBadge = (consequence: DisplayConsequence) => {
    switch (consequence) {
      case 'DISPLAY':
        return <span className="badge consequence-display">DISPLAY NOTE</span>;
      case 'DISPLAY_WITH_WARNING':
        return <span className="badge consequence-warning">DISPLAY WITH WARNING</span>;
      case 'NO_NOTE':
        return <span className="badge consequence-none">NO NOTE</span>;
      default:
        return <span className="badge">PENDING EVALUATION</span>;
    }
  };

  // Both EVALUATED and FINALIZED states display the final decision
  const isFinalResolutionState =
    caseData.state === 'EVALUATED' || caseData.state === 'FINALIZED';

  const winningNoteId = isFinalResolutionState
    ? caseData.final_selected_note_id
    : caseData.state === 'CHALLENGE'
      ? caseData.provisional_selected_note_id
      : -1;

  const activeScores = isFinalResolutionState
    ? caseData.final_scores
    : caseData.state === 'CHALLENGE'
      ? caseData.provisional_scores
      : [];

  const activeRationaleDigest = isFinalResolutionState
    ? caseData.final_rationale_digest
    : caseData.provisional_rationale_digest;

  const getActionDisabledReason = (actionType: string): string => {
    if (!isContractConfigured) return 'Council contract address is not configured.';
    if (!isConnected) return 'Connect wallet to perform this action.';
    if (isActionPending) return 'A transaction is currently processing or reconciling on-chain.';

    switch (actionType) {
      case 'submit_note':
        if (caseData.state !== 'OPEN') return 'Notes can only be submitted in OPEN state.';
        if (nowSeconds >= caseData.submission_deadline) return 'Submission deadline has passed.';
        if (caseData.note_count >= 5) return 'Maximum note capacity reached (5 notes).';
        if (userHasAuthoredNote) return 'You have already submitted a note for this case.';
        return '';
      case 'lock_case':
        if (caseData.state !== 'OPEN') return 'Case must be in OPEN state to lock.';
        if (!canLock) return 'Case can only be locked after the submission deadline.';
        return '';
      case 'evaluate_case':
        if (caseData.state !== 'LOCKED') return 'Case must be in LOCKED state to evaluate.';
        return '';
      case 'submit_challenge':
        if (caseData.state !== 'CHALLENGE') return 'Challenges can only be submitted during the CHALLENGE phase.';
        if (nowSeconds >= caseData.challenge_deadline) return 'Challenge deadline has passed.';
        if (caseData.challenge_count >= 3) return 'Maximum challenge capacity reached (3 challenges).';
        if (userHasAuthoredChallenge) return 'You have already submitted a challenge for this case.';
        return '';
      case 'resolve_challenges':
        if (caseData.state !== 'CHALLENGE') return 'Case must be in CHALLENGE state to resolve.';
        if (!canResolve) return 'Resolution requires the challenge deadline to pass.';
        return '';
      case 'finalize_case':
        if (caseData.state !== 'EVALUATED') return 'Case must be in EVALUATED state to finalize.';
        return '';
      default:
        return '';
    }
  };

  return (
    <main className="evidence-workspace" aria-label={`Evidence Workspace for Case #${caseData.id}`}>
      {/* Header & Status Card */}
      <section className="detail-card">
        <div className="card-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Case #{caseData.id}</span>
            <span className={`badge badge-${caseData.state.toLowerCase()}`}>{caseData.state}</span>
          </div>
          {isFinalResolutionState ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {caseData.state === 'EVALUATED' && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                  Final Resolution:
                </span>
              )}
              {getConsequenceBadge(caseData.final_display_consequence)}
            </div>
          ) : caseData.state === 'CHALLENGE' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                Provisional:
              </span>
              {getConsequenceBadge(caseData.provisional_display_consequence)}
            </div>
          ) : null}
        </div>

        <div className="info-grid">
          <div className="info-row">
            <span className="info-label">Content URL</span>
            <a
              href={caseData.content_url}
              target="_blank"
              rel="noreferrer"
              className="info-value"
              style={{ fontWeight: 600 }}
            >
              {caseData.content_url} ↗
            </a>
          </div>

          <div className="info-row">
            <span className="info-label">SHA-256 Snapshot Hash</span>
            <span className="info-value mono" title={caseData.snapshot_hash}>
              {caseData.snapshot_hash}
            </span>
          </div>

          <div className="info-row">
            <span className="info-label">Creator Address</span>
            <span className="info-value mono" title={caseData.creator}>
              {formatAddress(caseData.creator)}
            </span>
          </div>

          <div className="info-row">
            <span className="info-label">Timeline & Deadlines</span>
            <span className="info-value" style={{ fontSize: 'var(--text-xs)' }}>
              Created: {formatTimestamp(caseData.created_at)}
              <br />
              Submission Deadline: {formatTimestamp(caseData.submission_deadline)}{' '}
              {nowSeconds >= caseData.submission_deadline ? '(Expired)' : '(Active)'}
              <br />
              Challenge Window: {caseData.challenge_window_seconds}s ({caseData.challenge_window_seconds / 3600}h)
              {caseData.challenge_deadline > 0 && (
                <>
                  <br />
                  Challenge Deadline: {formatTimestamp(caseData.challenge_deadline)}{' '}
                  {nowSeconds >= caseData.challenge_deadline ? '(Expired)' : '(Active)'}
                </>
              )}
            </span>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="action-toolbar">
          {/* Submit Note */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenSubmitNote}
            disabled={
              !isContractConfigured ||
              !isConnected ||
              !isSubmissionOpen ||
              caseData.note_count >= 5 ||
              userHasAuthoredNote ||
              isActionPending
            }
            title={
              getActionDisabledReason('submit_note') ||
              `Submit candidate note (${caseData.note_count}/5)`
            }
          >
            Submit Note ({caseData.note_count}/5)
          </button>

          {/* Lock Case */}
          {caseData.state === 'OPEN' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onLockCase}
              disabled={!isContractConfigured || !isConnected || !canLock || isActionPending}
              title={
                getActionDisabledReason('lock_case') ||
                'Lock case to freeze notes for council evaluation'
              }
            >
              Lock Case
            </button>
          )}

          {/* Evaluate Case */}
          {caseData.state === 'LOCKED' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onEvaluateCase}
              disabled={!isContractConfigured || !isConnected || !canEvaluate || isActionPending}
              title={
                getActionDisabledReason('evaluate_case') ||
                'Trigger GenLayer consensus evaluation against rubric'
              }
            >
              Evaluate Case
            </button>
          )}

          {/* Submit Challenge */}
          {caseData.state === 'CHALLENGE' && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={onOpenSubmitChallenge}
              disabled={
                !isContractConfigured ||
                !isConnected ||
                !isChallengeOpen ||
                caseData.challenge_count >= 3 ||
                userHasAuthoredChallenge ||
                isActionPending
              }
              title={
                getActionDisabledReason('submit_challenge') ||
                `Submit challenge to provisional result (${caseData.challenge_count}/3)`
              }
            >
              Submit Challenge ({caseData.challenge_count}/3)
            </button>
          )}

          {/* Resolve Challenges */}
          {caseData.state === 'CHALLENGE' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onResolveChallenges}
              disabled={!isContractConfigured || !isConnected || !canResolve || isActionPending}
              title={
                getActionDisabledReason('resolve_challenges') ||
                'Re-evaluate frozen notes with submitted challenges'
              }
            >
              Resolve Challenges
            </button>
          )}

          {/* Finalize Case */}
          {caseData.state === 'EVALUATED' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onFinalizeCase}
              disabled={!isContractConfigured || !isConnected || !canFinalize || isActionPending}
              title={
                getActionDisabledReason('finalize_case') ||
                'Lock final consequence and credit author/challenger reputation'
              }
            >
              Finalize Case & Distribute Reputation
            </button>
          )}
        </div>
      </section>

      {/* Rationale Digest & Impact Summary */}
      {activeRationaleDigest && (
        <section className="detail-card">
          <h3 className="card-title">Consensus Rationale & Evidence Audit</h3>
          <div className="info-grid">
            <div className="info-row">
              <span className="info-label">
                {isFinalResolutionState ? 'Final' : 'Provisional'} Rationale Digest (SHA-256)
              </span>
              <span className="info-value mono">
                {activeRationaleDigest}
              </span>
            </div>

            {caseData.impactful_challenge_ids.length > 0 && (
              <div className="info-row">
                <span className="info-label">Impactful Challenge IDs (Credited +1 Reputation)</span>
                <span className="info-value" style={{ fontWeight: 600, color: 'var(--color-coral)' }}>
                  Challenge #{caseData.impactful_challenge_ids.join(', #')}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Candidate Notes Comparison */}
      <section className="detail-card">
        <div className="card-title">
          <span>Candidate Notes ({notes.length}/5)</span>
          {isLoading && <span style={{ fontSize: 'var(--text-xs)' }}>Loading notes...</span>}
        </div>

        {notes.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
            No candidate notes submitted yet.
          </div>
        ) : (
          <div className="notes-grid">
            {notes.map((n) => {
              const isWinner = winningNoteId === n.id;
              const noteScore = activeScores.find((s) => s.note_id === n.id);

              return (
                <div key={n.id} className={`note-card ${isWinner ? 'winner' : ''}`}>
                  <div className="note-header">
                    <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                      Note #{n.id}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--color-ink-muted)',
                      }}
                      title={n.author}
                    >
                      Author: {formatAddress(n.author)}
                    </span>
                  </div>

                  <p className="note-text-body">{n.note_text}</p>

                  <div>
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        textTransform: 'uppercase',
                        color: 'var(--color-ink-muted)',
                        fontWeight: 600,
                      }}
                    >
                      Source References:
                    </span>
                    <div className="sources-list">
                      {n.source_urls.map((url, i) => (
                        <div key={i} className="source-item">
                          <span className="badge badge-untrusted">Untrusted source</span>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={url}
                          >
                            {url}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>

                  {noteScore && <ScoreBreakdown score={noteScore} isWinner={isWinner} />}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Challenges Section */}
      <section className="detail-card">
        <div className="card-title">
          <span>Submitted Challenges ({challenges.length}/3)</span>
          {isLoading && <span style={{ fontSize: 'var(--text-xs)' }}>Loading challenges...</span>}
        </div>

        {challenges.length === 0 ? (
          <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 'var(--text-sm)' }}>
            No challenges submitted during the challenge window.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {challenges.map((ch) => {
              const isImpactful = caseData.impactful_challenge_ids.includes(ch.id);

              return (
                <div
                  key={ch.id}
                  style={{
                    padding: 'var(--space-4)',
                    backgroundColor: isImpactful ? 'var(--color-coral-muted)' : 'var(--color-paper)',
                    border: isImpactful ? '1.5px solid var(--color-coral)' : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-input)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <strong>Challenge #{ch.id}</strong>
                      {isImpactful && (
                        <span className="badge badge-challenge" style={{ fontWeight: 700 }}>
                          Impactful (+1 Rep)
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
                      Challenger: {formatAddress(ch.challenger)}
                    </span>
                  </div>

                  <p style={{ fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap' }}>{ch.reason}</p>

                  <div className="sources-list">
                    {ch.source_urls.map((url, i) => (
                      <div key={i} className="source-item">
                        <span className="badge badge-untrusted">Untrusted source</span>
                        <a href={url} target="_blank" rel="noreferrer" title={url}>
                          {url}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};
