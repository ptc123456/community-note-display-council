import React, { useState, useEffect, useRef } from 'react';

interface SubmitChallengeModalProps {
  isOpen: boolean;
  caseId: number;
  onClose: () => void;
  onSubmit: (reason: string, sourceUrls: string[]) => Promise<void>;
  isSubmitting: boolean;
}

export const SubmitChallengeModal: React.FC<SubmitChallengeModalProps> = ({
  isOpen,
  caseId,
  onClose,
  onSubmit,
  isSubmitting,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [reason, setReason] = useState('');
  const [sources, setSources] = useState<string[]>(['']);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        try {
          dialog.showModal();
          dialog.querySelector<HTMLElement>('#challenge-reason-input')?.focus();
        } catch {
          // Fallback
        }
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleAddSource = () => {
    if (sources.length < 3) {
      setSources([...sources, '']);
    }
  };

  const handleRemoveSource = (index: number) => {
    if (sources.length > 1) {
      const updated = sources.filter((_, i) => i !== index);
      setSources(updated);
      if (touched.sources) {
        validateSources(updated);
      }
    }
  };

  const validateReason = (text: string): string => {
    const trimmed = text.trim();
    if (!trimmed) return 'Challenge reason is required.';
    if (trimmed.length < 1 || trimmed.length > 300) {
      return 'Reason must be between 1 and 300 characters.';
    }
    return '';
  };

  const validateSources = (srcList: string[]): string => {
    const cleanSources = srcList.map((s) => s.trim()).filter(Boolean);
    if (cleanSources.length === 0) {
      return 'At least one source URL is required (maximum 3).';
    }
    for (const s of cleanSources) {
      if (!s.startsWith('https://')) {
        return 'All source URLs must use HTTPS.';
      }
    }
    return '';
  };

  const handleReasonBlur = () => {
    setTouched((prev) => ({ ...prev, reason: true }));
    const err = validateReason(reason);
    setErrors((prev) => ({ ...prev, reason: err }));
  };

  const handleReasonChange = (val: string) => {
    setReason(val);
    if (touched.reason) {
      const err = validateReason(val);
      setErrors((prev) => ({ ...prev, reason: err }));
    }
  };

  const handleSourceBlur = () => {
    setTouched((prev) => ({ ...prev, sources: true }));
    const err = validateSources(sources);
    setErrors((prev) => ({ ...prev, sources: err }));
  };

  const handleSourceChange = (index: number, val: string) => {
    const updated = [...sources];
    updated[index] = val;
    setSources(updated);
    if (touched.sources) {
      const err = validateSources(updated);
      setErrors((prev) => ({ ...prev, sources: err }));
    }
  };

  const validateAll = (): boolean => {
    const rErr = validateReason(reason);
    const sErr = validateSources(sources);
    const newErrors: Record<string, string> = {};
    if (rErr) newErrors.reason = rErr;
    if (sErr) newErrors.sources = sErr;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ reason: true, sources: true });
    if (!validateAll()) return;

    const cleanSources = sources.map((s) => s.trim()).filter(Boolean);
    await onSubmit(reason.trim(), cleanSources);
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
    if (!isInDialog && !isSubmitting) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      onClick={handleDialogClick}
      onClose={onClose}
      aria-labelledby="submit-challenge-modal-title"
    >
      <div className="modal-header">
        <h2 id="submit-challenge-modal-title" className="modal-title">
          Submit Challenge (Case #{caseId})
        </h2>
        <button
          type="button"
          className="modal-close-btn"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Close modal"
        >
          Close
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="challenge-reason-input" className="form-label">
                Challenge Reason / Counter-Evidence
              </label>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: reason.length > 300 ? 'var(--color-coral)' : 'var(--color-ink-muted)',
                }}
              >
                {reason.length}/300 chars
              </span>
            </div>
            <textarea
              id="challenge-reason-input"
              className={`form-textarea ${errors.reason ? 'error' : ''}`}
              placeholder="State why the provisional note or consequence is contradicted or flawed..."
              value={reason}
              onChange={(e) => handleReasonChange(e.target.value)}
              onBlur={handleReasonBlur}
              aria-invalid={Boolean(errors.reason)}
              aria-describedby="challenge-reason-help"
              disabled={isSubmitting}
              maxLength={300}
              required
            />
            <div id="challenge-reason-help" className={`form-helper ${errors.reason ? 'error' : ''}`}>
              {errors.reason || 'Clear factual grounds challenging the provisional council outcome.'}
            </div>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">Counter-Evidence URLs (1–3 HTTPS)</label>
              {sources.length < 3 && (
                <button
                  type="button"
                  onClick={handleAddSource}
                  className="btn btn-secondary"
                  style={{ minHeight: '44px', padding: '0 var(--space-3)', fontSize: 'var(--text-xs)' }}
                  disabled={isSubmitting}
                >
                  + Add Source
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {sources.map((src, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <input
                    type="url"
                    className="form-input"
                    placeholder={`https://counter-evidence-${idx + 1}.org/fact`}
                    value={src}
                    onChange={(e) => handleSourceChange(idx, e.target.value)}
                    onBlur={handleSourceBlur}
                    aria-label={`Counter-evidence URL ${idx + 1}`}
                    aria-invalid={Boolean(errors.sources)}
                    aria-describedby="challenge-sources-help"
                    disabled={isSubmitting}
                    required
                  />
                  {sources.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSource(idx)}
                      className="btn btn-outline"
                      style={{ minHeight: '44px', padding: '0 var(--space-3)' }}
                      disabled={isSubmitting}
                      title="Remove source"
                      aria-label="Remove source"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div id="challenge-sources-help" className={`form-helper ${errors.sources ? 'error' : ''}`}>
              {errors.sources || 'Public sources corroborating your challenge evidence.'}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting Challenge...' : 'Submit Challenge'}
          </button>
        </div>
      </form>
    </dialog>
  );
};
