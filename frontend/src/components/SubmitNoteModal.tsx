import React, { useState, useEffect, useRef } from 'react';

interface SubmitNoteModalProps {
  isOpen: boolean;
  caseId: number;
  onClose: () => void;
  onSubmit: (noteText: string, sourceUrls: string[]) => Promise<void>;
  isSubmitting: boolean;
}

export const SubmitNoteModal: React.FC<SubmitNoteModalProps> = ({
  isOpen,
  caseId,
  onClose,
  onSubmit,
  isSubmitting,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [noteText, setNoteText] = useState('');
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
          dialog.querySelector<HTMLElement>('#note-text-input')?.focus();
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

  const validateNoteText = (text: string): string => {
    const trimmed = text.trim();
    if (!trimmed) return 'Note text is required.';
    if (trimmed.length < 1 || trimmed.length > 600) {
      return 'Note text must be between 1 and 600 characters.';
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

  const handleNoteBlur = () => {
    setTouched((prev) => ({ ...prev, noteText: true }));
    const err = validateNoteText(noteText);
    setErrors((prev) => ({ ...prev, noteText: err }));
  };

  const handleNoteChange = (val: string) => {
    setNoteText(val);
    if (touched.noteText) {
      const err = validateNoteText(val);
      setErrors((prev) => ({ ...prev, noteText: err }));
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
    const nErr = validateNoteText(noteText);
    const sErr = validateSources(sources);
    const newErrors: Record<string, string> = {};
    if (nErr) newErrors.noteText = nErr;
    if (sErr) newErrors.sources = sErr;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ noteText: true, sources: true });
    if (!validateAll()) return;

    const cleanSources = sources.map((s) => s.trim()).filter(Boolean);
    await onSubmit(noteText.trim(), cleanSources);
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
      aria-labelledby="submit-note-modal-title"
    >
      <div className="modal-header">
        <h2 id="submit-note-modal-title" className="modal-title">
          Submit Note (Case #{caseId})
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
              <label htmlFor="note-text-input" className="form-label">
                Candidate Note Text
              </label>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: noteText.length > 600 ? 'var(--color-coral)' : 'var(--color-ink-muted)',
                }}
              >
                {noteText.length}/600 chars
              </span>
            </div>
            <textarea
              id="note-text-input"
              className={`form-textarea ${errors.noteText ? 'error' : ''}`}
              placeholder="Provide clear, factual context directly relevant to the content snapshot..."
              value={noteText}
              onChange={(e) => handleNoteChange(e.target.value)}
              onBlur={handleNoteBlur}
              aria-invalid={Boolean(errors.noteText)}
              aria-describedby="note-text-help"
              disabled={isSubmitting}
              maxLength={600}
              required
            />
            <div id="note-text-help" className={`form-helper ${errors.noteText ? 'error' : ''}`}>
              {errors.noteText || 'Concise explanation addressing missing or misleading context.'}
            </div>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">Source References (1–3 HTTPS URLs)</label>
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
                    placeholder={`https://source-${idx + 1}.org/evidence`}
                    value={src}
                    onChange={(e) => handleSourceChange(idx, e.target.value)}
                    onBlur={handleSourceBlur}
                    aria-label={`Source URL ${idx + 1}`}
                    aria-invalid={Boolean(errors.sources)}
                    aria-describedby="note-sources-help"
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
            <div id="note-sources-help" className={`form-helper ${errors.sources ? 'error' : ''}`}>
              {errors.sources || 'Public HTTPS sources supporting your candidate note.'}
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
            {isSubmitting ? 'Submitting...' : 'Submit Note'}
          </button>
        </div>
      </form>
    </dialog>
  );
};
