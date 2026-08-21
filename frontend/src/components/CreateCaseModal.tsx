import React, { useState, useEffect, useRef } from 'react';

interface CreateCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    contentUrl: string,
    snapshotHash: string,
    submissionDeadline: bigint,
    challengeWindowSeconds: bigint
  ) => Promise<void>;
  isSubmitting: boolean;
}

export const CreateCaseModal: React.FC<CreateCaseModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [contentUrl, setContentUrl] = useState('');
  const [snapshotHash, setSnapshotHash] = useState('');
  const [deadlineHours, setDeadlineHours] = useState('24');
  const [challengeWindowHours, setChallengeWindowHours] = useState('24');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        try {
          dialog.showModal();
          dialog.querySelector<HTMLElement>('#create-content-url')?.focus();
        } catch {
          // Fallback if already open
        }
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const validateField = (field: string, val: string): string => {
    if (field === 'contentUrl') {
      const url = val.trim();
      if (!url) return 'Content URL is required.';
      if (!url.startsWith('https://')) return 'Content URL must use HTTPS.';
      return '';
    }

    if (field === 'snapshotHash') {
      let hash = val.trim();
      if (hash.startsWith('0x') || hash.startsWith('0X')) {
        hash = hash.slice(2);
      }
      if (!hash) return 'Snapshot hash is required.';
      if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
        return 'Snapshot hash must be exactly 64 hexadecimal characters.';
      }
      return '';
    }

    if (field === 'deadlineHours') {
      const hours = Number(val);
      if (isNaN(hours) || hours <= 0 || hours > 720) {
        return 'Submission duration must be between 1 and 720 hours (30 days).';
      }
      return '';
    }

    if (field === 'challengeWindowHours') {
      const windowHours = Number(val);
      if (isNaN(windowHours) || windowHours < 1 || windowHours > 168) {
        return 'Challenge window must be between 1 hour and 168 hours (7 days).';
      }
      return '';
    }

    return '';
  };

  const validateAll = (): boolean => {
    const newErrors: Record<string, string> = {};
    const uErr = validateField('contentUrl', contentUrl);
    if (uErr) newErrors.contentUrl = uErr;

    const sErr = validateField('snapshotHash', snapshotHash);
    if (sErr) newErrors.snapshotHash = sErr;

    const dErr = validateField('deadlineHours', deadlineHours);
    if (dErr) newErrors.deadlineHours = dErr;

    const cErr = validateField('challengeWindowHours', challengeWindowHours);
    if (cErr) newErrors.challengeWindowHours = cErr;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleBlur = (field: string, val: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const err = validateField(field, val);
    setErrors((prev) => ({ ...prev, [field]: err }));
  };

  const handleChange = (field: string, val: string) => {
    if (field === 'contentUrl') setContentUrl(val);
    if (field === 'snapshotHash') setSnapshotHash(val);
    if (field === 'deadlineHours') setDeadlineHours(val);
    if (field === 'challengeWindowHours') setChallengeWindowHours(val);

    if (touched[field]) {
      const err = validateField(field, val);
      setErrors((prev) => ({ ...prev, [field]: err }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({
      contentUrl: true,
      snapshotHash: true,
      deadlineHours: true,
      challengeWindowHours: true,
    });
    if (!validateAll()) return;

    let hash = snapshotHash.trim();
    if (hash.startsWith('0x') || hash.startsWith('0X')) {
      hash = hash.slice(2);
    }
    hash = hash.toLowerCase();

    const nowSeconds = Math.floor(Date.now() / 1000);
    const subDeadlineSec = BigInt(nowSeconds + Math.floor(Number(deadlineHours) * 3600));
    const challengeWindowSec = BigInt(Math.floor(Number(challengeWindowHours) * 3600));

    await onSubmit(contentUrl.trim(), hash, subDeadlineSec, challengeWindowSec);
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
      aria-labelledby="create-case-modal-title"
    >
      <div className="modal-header">
        <h2 id="create-case-modal-title" className="modal-title">
          Create Council Case
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
            <label htmlFor="create-content-url" className="form-label">
              Canonical Content URL (HTTPS)
            </label>
            <input
              id="create-content-url"
              type="url"
              className={`form-input ${errors.contentUrl ? 'error' : ''}`}
              placeholder="https://example.com/snapshot/article-123"
              value={contentUrl}
              onChange={(e) => handleChange('contentUrl', e.target.value)}
              onBlur={(e) => handleBlur('contentUrl', e.target.value)}
              aria-invalid={Boolean(errors.contentUrl)}
              aria-describedby="create-content-url-help"
              disabled={isSubmitting}
              required
            />
            <div id="create-content-url-help" className={`form-helper ${errors.contentUrl ? 'error' : ''}`}>
              {errors.contentUrl || 'Exact HTTPS URL of the public content under evaluation.'}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="create-snapshot-hash" className="form-label">
              SHA-256 Snapshot Hash (64 hex characters)
            </label>
            <input
              id="create-snapshot-hash"
              type="text"
              className={`form-input ${errors.snapshotHash ? 'error' : ''}`}
              placeholder="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
              value={snapshotHash}
              onChange={(e) => handleChange('snapshotHash', e.target.value)}
              onBlur={(e) => handleBlur('snapshotHash', e.target.value)}
              aria-invalid={Boolean(errors.snapshotHash)}
              aria-describedby="create-snapshot-hash-help"
              disabled={isSubmitting}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
              required
            />
            <div id="create-snapshot-hash-help" className={`form-helper ${errors.snapshotHash ? 'error' : ''}`}>
              {errors.snapshotHash || 'SHA-256 hash of the content snapshot at creation.'}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="create-submission-hours" className="form-label">
              Submission Duration (Hours from now)
            </label>
            <input
              id="create-submission-hours"
              type="number"
              min="1"
              max="720"
              className={`form-input ${errors.deadlineHours ? 'error' : ''}`}
              value={deadlineHours}
              onChange={(e) => handleChange('deadlineHours', e.target.value)}
              onBlur={(e) => handleBlur('deadlineHours', e.target.value)}
              aria-invalid={Boolean(errors.deadlineHours)}
              aria-describedby="create-submission-hours-help"
              disabled={isSubmitting}
              required
            />
            <div id="create-submission-hours-help" className={`form-helper ${errors.deadlineHours ? 'error' : ''}`}>
              {errors.deadlineHours || 'How long note authors have to submit competing notes.'}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="create-challenge-window" className="form-label">
              Challenge Window Duration (Hours after evaluation)
            </label>
            <input
              id="create-challenge-window"
              type="number"
              min="1"
              max="168"
              className={`form-input ${errors.challengeWindowHours ? 'error' : ''}`}
              value={challengeWindowHours}
              onChange={(e) => handleChange('challengeWindowHours', e.target.value)}
              onBlur={(e) => handleBlur('challengeWindowHours', e.target.value)}
              aria-invalid={Boolean(errors.challengeWindowHours)}
              aria-describedby="create-challenge-window-help"
              disabled={isSubmitting}
              required
            />
            <div id="create-challenge-window-help" className={`form-helper ${errors.challengeWindowHours ? 'error' : ''}`}>
              {errors.challengeWindowHours ||
                'Guaranteed challenge window (1 hr to 7 days, 3600s–604800s).'}
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
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating Case...' : 'Create Case'}
          </button>
        </div>
      </form>
    </dialog>
  );
};
