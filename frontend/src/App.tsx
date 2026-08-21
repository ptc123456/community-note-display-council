import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from './wallet/WalletContext';
import { WalletModal } from './wallet/WalletModal';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { CaseFeed } from './components/CaseFeed';
import { CaseDetail } from './components/CaseDetail';
import { CreateCaseModal } from './components/CreateCaseModal';
import { SubmitNoteModal } from './components/SubmitNoteModal';
import { SubmitChallengeModal } from './components/SubmitChallengeModal';
import { ReputationModal } from './components/ReputationModal';
import { TransactionBanner } from './components/TransactionBanner';
import {
  CaseData,
  CandidateNote,
  ChallengeData,
  TxProgress,
  isValidContractAddress,
} from './genlayer/types';
import {
  fetchCases,
  fetchCase,
  fetchNotes,
  fetchChallenges,
} from './genlayer/repository';
import {
  createCaseAction,
  submitNoteAction,
  lockCaseAction,
  evaluateCaseAction,
  submitChallengeAction,
  resolveChallengesAction,
  finalizeCaseAction,
  getRecoveryParams,
  clearRecoveryParams,
  createRecoveryReconcileCheck,
  recoverSubmittedTransaction,
} from './genlayer/transactions';

export const App: React.FC = () => {
  const { selectedProvider, account } = useWallet();
  const provider = selectedProvider?.provider;

  const rawContractAddress = (import.meta.env.VITE_CONTRACT_ADDRESS || '').trim();
  const isAddressConfigured = isValidContractAddress(rawContractAddress);
  const contractAddress = isAddressConfigured ? rawContractAddress : '';

  const [cases, setCases] = useState<CaseData[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [selectedCaseData, setSelectedCaseData] = useState<CaseData | null>(null);
  const [notes, setNotes] = useState<CandidateNote[]>([]);
  const [challenges, setChallenges] = useState<ChallengeData[]>([]);

  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [txProgress, setTxProgress] = useState<TxProgress | null>(null);
  const [isTxSuccess, setIsTxSuccess] = useState(false);

  // Modals state
  const [isCreateCaseOpen, setIsCreateCaseOpen] = useState(false);
  const [isSubmitNoteOpen, setIsSubmitNoteOpen] = useState(false);
  const [isSubmitChallengeOpen, setIsSubmitChallengeOpen] = useState(false);
  const [isReputationOpen, setIsReputationOpen] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  // Load cases from contract
  const loadCases = useCallback(async () => {
    if (!contractAddress) return;
    setIsLoadingCases(true);
    setCasesError(null);
    try {
      const caseList = await fetchCases(contractAddress);
      setCases(caseList);

      // Deep linking: check URL search params for ?case=ID
      const urlParams = new URLSearchParams(window.location.search);
      const urlCaseId = urlParams.get('case');
      if (urlCaseId && /^\d+$/.test(urlCaseId) && Number(urlCaseId) > 0) {
        const targetId = Number(urlCaseId);
        const exists = caseList.some((c) => c.id === targetId);
        if (exists) {
          setSelectedCaseId(targetId);
        } else {
          setSelectedCaseId(null);
          setSelectedCaseData(null);
          setNotes([]);
          setChallenges([]);
          setDetailError(`Case #${targetId} is unavailable on this contract.`);
        }
      } else if (urlCaseId) {
        setSelectedCaseId(null);
        setSelectedCaseData(null);
        setDetailError('The case link is invalid. Use a positive integer case ID.');
      } else if (caseList.length > 0) {
        setSelectedCaseId((current) => current ?? caseList[0].id);
      }
    } catch (err: any) {
      setCasesError(err?.message || 'Failed to load cases from Studionet.');
    } finally {
      setIsLoadingCases(false);
    }
  }, [contractAddress]);

  // Load selected case details, notes, and challenges
  const loadCaseDetail = useCallback(
    async (caseId: number) => {
      if (!contractAddress || caseId <= 0) return;
      setIsLoadingDetail(true);
      setDetailError(null);
      setSelectedCaseData(null);
      setNotes([]);
      setChallenges([]);
      try {
        const c = await fetchCase(contractAddress, BigInt(caseId));
        setSelectedCaseData(c);

        const fetchedNotes = await fetchNotes(contractAddress, BigInt(caseId), c.note_count);
        setNotes(fetchedNotes);

        const fetchedChallenges = await fetchChallenges(
          contractAddress,
          BigInt(caseId),
          c.challenge_count
        );
        setChallenges(fetchedChallenges);
      } catch (err: any) {
        setDetailError(err?.message || `Failed to load details for Case #${caseId}`);
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [contractAddress]
  );

  const recoverFromUrl = useCallback(async () => {
    if (!contractAddress) return;
    const recovery = getRecoveryParams();
    if (!recovery.hash) return;

    try {
      const reconcileCheck = createRecoveryReconcileCheck(
        contractAddress,
        recovery.action,
        recovery.caseId,
        recovery.baseline
      );
      const result = await recoverSubmittedTransaction({
        hash: recovery.hash,
        title: recovery.action ? `Recovering ${recovery.action}` : 'Recovering Transaction',
        onProgress: setTxProgress,
        reconcileCheck,
      });
      if (result.success) {
        setIsTxSuccess(true);
        await loadCases();
        if (recovery.caseId) await loadCaseDetail(recovery.caseId);
      }
    } catch (err: any) {
      setTxProgress({
        step: 'error',
        title: 'Recovering Transaction',
        hash: recovery.hash,
        error: err?.message || 'Recovery metadata is invalid.',
      });
    }
  }, [contractAddress, loadCases, loadCaseDetail]);

  // Initial load & URL Recovery check (headless read-only reconciliation without write replay)
  useEffect(() => {
    if (isAddressConfigured) {
      loadCases();

      void recoverFromUrl();
    }
  }, [isAddressConfigured, loadCases, recoverFromUrl]);

  // Handle browser Back / Forward popstate navigation
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const urlCaseId = urlParams.get('case');
      if (urlCaseId && /^\d+$/.test(urlCaseId) && Number(urlCaseId) > 0) {
        const targetId = Number(urlCaseId);
        if (cases.some((item) => item.id === targetId)) {
          setSelectedCaseId(targetId);
        } else {
          setSelectedCaseId(null);
          setSelectedCaseData(null);
          setDetailError(`Case #${targetId} is unavailable on this contract.`);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [cases]);

  // Reload detail when selectedCaseId changes
  useEffect(() => {
    if (selectedCaseId !== null) {
      loadCaseDetail(selectedCaseId);
    }
  }, [selectedCaseId, loadCaseDetail]);

  // Select case handler (updates deep-link URL query)
  const handleSelectCase = (caseId: number) => {
    setSelectedCaseId(caseId);
    const url = new URL(window.location.href);
    url.searchParams.set('case', caseId.toString());
    window.history.pushState(null, '', url.toString());
  };

  // Transaction Wrappers
  const handleCreateCase = async (
    contentUrl: string,
    snapshotHash: string,
    submissionDeadline: bigint,
    challengeWindowSeconds: bigint
  ) => {
    if (!provider || !account || !contractAddress) return;
    setIsSubmittingForm(true);
    setIsTxSuccess(false);

    try {
      const res = await createCaseAction(
        provider,
        account,
        contractAddress,
        contentUrl,
        snapshotHash,
        submissionDeadline,
        challengeWindowSeconds,
        (p) => setTxProgress(p)
      );

      if (res.success) {
        setIsTxSuccess(true);
        setIsCreateCaseOpen(false);
        await loadCases();
      }
    } catch {
      // Error handled in transaction progress
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleSubmitNote = async (noteText: string, sourceUrls: string[]) => {
    if (!provider || !account || !contractAddress || selectedCaseId === null) return;
    setIsSubmittingForm(true);
    setIsTxSuccess(false);

    try {
      const res = await submitNoteAction(
        provider,
        account,
        contractAddress,
        BigInt(selectedCaseId),
        noteText,
        sourceUrls,
        (p) => setTxProgress(p)
      );

      if (res.success) {
        setIsTxSuccess(true);
        setIsSubmitNoteOpen(false);
        await loadCaseDetail(selectedCaseId);
        await loadCases();
      }
    } catch {
      // Error handled in txProgress
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleLockCase = async () => {
    if (!provider || !account || !contractAddress || selectedCaseId === null) return;
    setIsTxSuccess(false);

    try {
      const res = await lockCaseAction(
        provider,
        account,
        contractAddress,
        BigInt(selectedCaseId),
        (p) => setTxProgress(p)
      );

      if (res.success) {
        setIsTxSuccess(true);
        await loadCaseDetail(selectedCaseId);
        await loadCases();
      }
    } catch {
      // Handled
    }
  };

  const handleEvaluateCase = async () => {
    if (!provider || !account || !contractAddress || selectedCaseId === null) return;
    setIsTxSuccess(false);

    try {
      const res = await evaluateCaseAction(
        provider,
        account,
        contractAddress,
        BigInt(selectedCaseId),
        (p) => setTxProgress(p)
      );

      if (res.success) {
        setIsTxSuccess(true);
        await loadCaseDetail(selectedCaseId);
        await loadCases();
      }
    } catch {
      // Handled
    }
  };

  const handleSubmitChallenge = async (reason: string, sourceUrls: string[]) => {
    if (!provider || !account || !contractAddress || selectedCaseId === null) return;
    setIsSubmittingForm(true);
    setIsTxSuccess(false);

    try {
      const res = await submitChallengeAction(
        provider,
        account,
        contractAddress,
        BigInt(selectedCaseId),
        reason,
        sourceUrls,
        (p) => setTxProgress(p)
      );

      if (res.success) {
        setIsTxSuccess(true);
        setIsSubmitChallengeOpen(false);
        await loadCaseDetail(selectedCaseId);
        await loadCases();
      }
    } catch {
      // Handled
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleResolveChallenges = async () => {
    if (!provider || !account || !contractAddress || selectedCaseId === null) return;
    setIsTxSuccess(false);

    try {
      const res = await resolveChallengesAction(
        provider,
        account,
        contractAddress,
        BigInt(selectedCaseId),
        (p) => setTxProgress(p)
      );

      if (res.success) {
        setIsTxSuccess(true);
        await loadCaseDetail(selectedCaseId);
        await loadCases();
      }
    } catch {
      // Handled
    }
  };

  const handleFinalizeCase = async () => {
    if (!provider || !account || !contractAddress || selectedCaseId === null) return;
    setIsTxSuccess(false);

    try {
      const res = await finalizeCaseAction(
        provider,
        account,
        contractAddress,
        BigInt(selectedCaseId),
        (p) => setTxProgress(p)
      );

      if (res.success) {
        setIsTxSuccess(true);
        await loadCaseDetail(selectedCaseId);
        await loadCases();
      }
    } catch {
      // Handled
    }
  };

  const isActionPending =
    txProgress?.step === 'awaiting_signature' ||
    txProgress?.step === 'submitted' ||
    txProgress?.step === 'finalizing' ||
    txProgress?.step === 'finalized' ||
    txProgress?.step === 'reconciling' ||
    txProgress?.step === 'readback_pending';

  return (
    <div className="app-container">
      <Header onOpenReputation={() => setIsReputationOpen(true)} isTxSuccess={isTxSuccess} />

      {!isAddressConfigured ? (
        <div
          style={{
            maxWidth: '1440px',
            margin: 'var(--space-6) auto',
            padding: '0 var(--space-6)',
            width: '100%',
          }}
        >
          <div
            role="alert"
            style={{
              padding: 'var(--space-6)',
              backgroundColor: 'var(--color-coral-muted)',
              border: '2px solid var(--color-coral)',
              borderRadius: 'var(--radius-card)',
              color: 'var(--color-ink)',
            }}
          >
            <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>
              Council Contract Address Not Configured
            </h2>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
              <code>VITE_CONTRACT_ADDRESS</code> is missing or not a valid <code>0x</code> 40-character hexadecimal address.
              All on-chain writes and reads are disabled until a valid Studionet contract address is provided in environment configuration.
            </p>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-ink-muted)',
              }}
            >
              Expected format: <code>0x0000000000000000000000000000000000000000</code>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            padding: '0 var(--space-6)',
            width: '100%',
          }}
        >
          <TransactionBanner
            progress={txProgress}
            onClear={() => {
              clearRecoveryParams();
              setTxProgress(null);
            }}
            onRetry={
              txProgress?.step === 'readback_pending'
                ? () => void recoverFromUrl()
                : undefined
            }
          />
        </div>
      )}

      <div className="workbench-main">
        <CaseFeed
          cases={cases}
          selectedCaseId={selectedCaseId}
          onSelectCase={handleSelectCase}
          onOpenCreateCase={() => setIsCreateCaseOpen(true)}
          onRefresh={loadCases}
          isLoading={isLoadingCases}
          error={casesError}
          onRetry={loadCases}
        />

        <CaseDetail
          caseData={selectedCaseData}
          notes={notes}
          challenges={challenges}
          isLoading={isLoadingDetail}
          isContractConfigured={isAddressConfigured}
          error={detailError}
          onRetry={selectedCaseId !== null ? () => loadCaseDetail(selectedCaseId) : undefined}
          onOpenSubmitNote={() => setIsSubmitNoteOpen(true)}
          onOpenSubmitChallenge={() => setIsSubmitChallengeOpen(true)}
          onLockCase={handleLockCase}
          onEvaluateCase={handleEvaluateCase}
          onResolveChallenges={handleResolveChallenges}
          onFinalizeCase={handleFinalizeCase}
          isActionPending={isActionPending}
        />
      </div>

      <Footer contractAddress={contractAddress} />

      {/* Accessible Modals */}
      <WalletModal />

      <CreateCaseModal
        isOpen={isCreateCaseOpen}
        onClose={() => setIsCreateCaseOpen(false)}
        onSubmit={handleCreateCase}
        isSubmitting={isSubmittingForm}
      />

      {selectedCaseId !== null && (
        <>
          <SubmitNoteModal
            isOpen={isSubmitNoteOpen}
            caseId={selectedCaseId}
            onClose={() => setIsSubmitNoteOpen(false)}
            onSubmit={handleSubmitNote}
            isSubmitting={isSubmittingForm}
          />

          <SubmitChallengeModal
            isOpen={isSubmitChallengeOpen}
            caseId={selectedCaseId}
            onClose={() => setIsSubmitChallengeOpen(false)}
            onSubmit={handleSubmitChallenge}
            isSubmitting={isSubmittingForm}
          />
        </>
      )}

      <ReputationModal
        isOpen={isReputationOpen}
        onClose={() => setIsReputationOpen(false)}
        contractAddress={contractAddress}
      />
    </div>
  );
};
