import { TransactionStatus, ExecutionResult } from 'genlayer-js/types';
import { getWriteClient, getReadClient } from './client';
import { EIP1193Provider } from '../wallet/eip6963';
import { TxProgress } from './types';
import {
  fetchCase,
  fetchCaseCount,
  fetchNoteCount,
  fetchChallengeCount,
} from './repository';

export interface SendTransactionOptions {
  provider: EIP1193Provider;
  account: string;
  contractAddress: string;
  functionName: string;
  args: any[];
  title: string;
  caseId?: number;
  recoveryBaseline?: number;
  onProgress: (progress: TxProgress) => void;
  reconcileCheck?: () => Promise<boolean>;
  reconcileRetries?: number;
  reconcileInterval?: number;
}

export type ExecutionClassification = 'SUCCESS' | 'ERROR' | 'UNKNOWN';

export interface ExecutionClassificationResult {
  classification: ExecutionClassification;
  error?: string;
}

export function classifyExecutionResult(receipt: any): ExecutionClassificationResult {
  if (!receipt || typeof receipt !== 'object') {
    return { classification: 'UNKNOWN', error: 'Receipt is missing or invalid.' };
  }

  const indicators: ('RETURN' | 'ERROR' | 'UNKNOWN')[] = [];

  const checkValue = (val: any) => {
    if (val === undefined || val === null) return;
    if (
      val === 'FINISHED_WITH_RETURN' ||
      val === 'SUCCESS' ||
      val === ExecutionResult.FINISHED_WITH_RETURN ||
      val === 1
    ) {
      indicators.push('RETURN');
    } else if (
      val === 'FINISHED_WITH_ERROR' ||
      val === 'ERROR' ||
      val === ExecutionResult.FINISHED_WITH_ERROR ||
      val === 2
    ) {
      indicators.push('ERROR');
    } else {
      indicators.push('UNKNOWN');
    }
  };

  checkValue(receipt.txExecutionResultName);
  checkValue(receipt.txExecutionResult);
  checkValue(receipt.tx_execution_result_name);
  checkValue(receipt.execution_result);
  checkValue(receipt.executionResult);

  if (receipt.consensus_data?.leader_receipt) {
    const lr = Array.isArray(receipt.consensus_data.leader_receipt)
      ? receipt.consensus_data.leader_receipt[0]
      : receipt.consensus_data.leader_receipt;
    if (lr) {
      checkValue(lr.execution_result);
      checkValue(lr.executionResult);
      checkValue(lr.txExecutionResultName);
      checkValue(lr.tx_execution_result_name);
    }
  }

  if (indicators.length === 0) {
    return {
      classification: 'UNKNOWN',
      error: 'Missing execution result indicators in receipt.',
    };
  }

  const hasReturn = indicators.includes('RETURN');
  const hasError = indicators.includes('ERROR');
  const hasUnknown = indicators.includes('UNKNOWN');

  // If there are conflicting signals or unknown values, fail closed
  if ((hasReturn && hasError) || hasUnknown) {
    return {
      classification: 'UNKNOWN',
      error: 'Conflicting or unknown execution result indicators in receipt.',
    };
  }

  if (hasReturn && !hasError) {
    return { classification: 'SUCCESS' };
  }

  if (hasError && !hasReturn) {
    return {
      classification: 'ERROR',
      error: 'Transaction finalized with contract execution error (FINISHED_WITH_ERROR).',
    };
  }

  return {
    classification: 'UNKNOWN',
    error: 'Unrecognized execution result status.',
  };
}

export function isExecutionSuccess(receipt: any): boolean {
  return classifyExecutionResult(receipt).classification === 'SUCCESS';
}

// URL-based Recovery Helpers
export function setRecoveryParams(
  hash: string,
  action: string,
  caseId?: number,
  baseline?: number
): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('recovery_hash', hash);
  url.searchParams.set('recovery_action', action);
  if (caseId !== undefined) {
    url.searchParams.set('recovery_case', caseId.toString());
  }
  if (baseline !== undefined) {
    url.searchParams.set('recovery_baseline', baseline.toString());
  }
  window.history.replaceState(null, '', url.toString());
}

export function clearRecoveryParams(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('recovery_hash');
  url.searchParams.delete('recovery_action');
  url.searchParams.delete('recovery_case');
  url.searchParams.delete('recovery_baseline');
  window.history.replaceState(null, '', url.toString());
}

export function getRecoveryParams(): {
  hash: string | null;
  action: string | null;
  caseId: number | null;
  baseline: number | null;
} {
  if (typeof window === 'undefined') {
    return { hash: null, action: null, caseId: null, baseline: null };
  }
  const urlParams = new URLSearchParams(window.location.search);
  const hash = urlParams.get('recovery_hash');
  const action = urlParams.get('recovery_action');
  const rawCase = urlParams.get('recovery_case');
  const rawBaseline = urlParams.get('recovery_baseline');
  const caseId = rawCase && /^\d+$/.test(rawCase) && Number(rawCase) > 0 ? Number(rawCase) : null;
  const baseline =
    rawBaseline && /^\d+$/.test(rawBaseline) ? Number(rawBaseline) : null;
  return { hash, action, caseId, baseline };
}

export function createRecoveryReconcileCheck(
  contractAddress: string,
  action: string | null,
  caseId: number | null,
  baseline: number | null
): () => Promise<boolean> {
  switch (action) {
    case 'create_case':
      if (baseline === null) break;
      return async () => Number(await fetchCaseCount(contractAddress)) > baseline;
    case 'submit_note':
      if (caseId === null || baseline === null) break;
      return async () => Number(await fetchNoteCount(contractAddress, BigInt(caseId))) > baseline;
    case 'submit_challenge':
      if (caseId === null || baseline === null) break;
      return async () =>
        Number(await fetchChallengeCount(contractAddress, BigInt(caseId))) > baseline;
    case 'lock_case':
    case 'evaluate_case':
    case 'resolve_challenges':
    case 'finalize_case': {
      if (caseId === null) break;
      const expectedState = {
        lock_case: 'LOCKED',
        evaluate_case: 'CHALLENGE',
        resolve_challenges: 'EVALUATED',
        finalize_case: 'FINALIZED',
      }[action];
      return async () => (await fetchCase(contractAddress, BigInt(caseId))).state === expectedState;
    }
  }
  throw new Error('Recovery metadata is incomplete or unsupported.');
}

export interface ExecuteTransactionResult {
  hash: string;
  success: boolean;
  reconciled: boolean;
  receipt: any;
  error?: string | null;
}

export async function executeWriteTransaction(
  options: SendTransactionOptions
): Promise<ExecuteTransactionResult> {
  const {
    provider,
    account,
    contractAddress,
    functionName,
    args,
    title,
    caseId,
    recoveryBaseline,
    onProgress,
    reconcileCheck,
    reconcileRetries = 10,
    reconcileInterval = 1500,
  } = options;

  onProgress({
    step: 'awaiting_signature',
    title,
    hash: null,
    error: null,
  });

  let hash = '';
  let writeClient: any = null;

  try {
    writeClient = await getWriteClient(provider, account);

    const txHash = await writeClient.writeContract({
      address: contractAddress as any,
      functionName,
      args,
      value: 0n,
    });

    hash = typeof txHash === 'string' ? txHash : String(txHash);

    // Save recovery metadata in URL for safe reload recovery
    setRecoveryParams(hash, functionName, caseId, recoveryBaseline);

    onProgress({
      step: 'submitted',
      title,
      hash,
      error: null,
    });

    onProgress({
      step: 'finalizing',
      title,
      hash,
      error: null,
    });

    // Wait for FINALIZED status
    const receipt = await writeClient.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      retries: 50,
      interval: 2000,
    });

    const classification = classifyExecutionResult(receipt);

    if (classification.classification !== 'SUCCESS') {
      const isTerminalError = classification.classification === 'ERROR';
      const errorMsg =
        classification.error ||
        (isTerminalError
          ? 'Transaction finalized with execution error (FINISHED_WITH_ERROR).'
          : 'Transaction finalized with unknown execution result.');

      onProgress({
        step: isTerminalError ? 'execution_error' : 'error',
        title,
        hash,
        error: errorMsg,
      });

      return {
        hash,
        success: false,
        reconciled: false,
        receipt,
        error: errorMsg,
      };
    }

    onProgress({
      step: 'finalized',
      title,
      hash,
      error: null,
    });

    // Perform authoritative readback polling if reconcile check is provided
    if (reconcileCheck) {
      let reconciled = false;
      for (let attempt = 1; attempt <= reconcileRetries; attempt++) {
        onProgress({
          step: 'reconciling',
          title,
          hash,
          error: null,
          reconcileAttempts: attempt,
        });

        try {
          reconciled = await reconcileCheck();
          if (reconciled) break;
        } catch {
          // Retry on read error
        }

        if (attempt < reconcileRetries) {
          await new Promise((r) => setTimeout(r, reconcileInterval));
        }
      }

      if (reconciled) {
        clearRecoveryParams();
        onProgress({
          step: 'reconciled',
          title,
          hash,
          error: null,
        });
        return { hash, success: true, reconciled: true, receipt };
      } else {
        // Readback timed out: keep visibly readback_pending, do NOT claim success or failure
        onProgress({
          step: 'readback_pending',
          title,
          hash,
          error: 'Transaction finalized on-chain, but state readback is taking longer to reflect.',
        });
        return {
          hash,
          success: false,
          reconciled: false,
          receipt,
          error: 'Readback pending',
        };
      }
    } else {
      clearRecoveryParams();
      onProgress({
        step: 'reconciled',
        title,
        hash,
        error: null,
      });
      return { hash, success: true, reconciled: true, receipt };
    }
  } catch (err: any) {
    const errorMsg =
      err?.code === 4001 || err?.message?.includes('User rejected')
        ? 'Transaction signature rejected by user.'
        : err?.message || 'Transaction submission failed.';

    onProgress({
      step: 'error',
      title,
      hash: hash || null,
      error: errorMsg,
    });

    throw new Error(errorMsg);
  }
}

// Read-only recovery of an existing transaction hash without write or wallet requests
export async function recoverSubmittedTransaction(options: {
  hash: string;
  title: string;
  onProgress: (p: TxProgress) => void;
  reconcileCheck: () => Promise<boolean>;
  reconcileRetries?: number;
  reconcileInterval?: number;
}): Promise<{ success: boolean; reconciled: boolean; receipt: any }> {
  const {
    hash,
    title,
    onProgress,
    reconcileCheck,
    reconcileRetries = 10,
    reconcileInterval = 1500,
  } = options;
  const readClient = getReadClient();

  onProgress({
    step: 'finalizing',
    title,
    hash,
    error: null,
  });

  try {
    const receipt = await readClient.waitForTransactionReceipt({
      hash: hash as any,
      status: TransactionStatus.FINALIZED,
      retries: 30,
      interval: 2000,
    });

    const classification = classifyExecutionResult(receipt);
    if (classification.classification !== 'SUCCESS') {
      const isTerminalError = classification.classification === 'ERROR';
      const errorMsg =
        classification.error ||
        (isTerminalError
          ? 'Transaction finalized with execution error (FINISHED_WITH_ERROR).'
          : 'Transaction finalized with unknown execution result.');

      onProgress({
        step: isTerminalError ? 'execution_error' : 'error',
        title,
        hash,
        error: errorMsg,
      });

      return { success: false, reconciled: false, receipt };
    }

    let reconciled = false;
    for (let attempt = 1; attempt <= reconcileRetries; attempt++) {
      onProgress({
        step: 'reconciling',
        title,
        hash,
        error: null,
        reconcileAttempts: attempt,
      });

      try {
        reconciled = await reconcileCheck();
        if (reconciled) break;
      } catch {
        // Retry
      }

      if (attempt < reconcileRetries) {
        await new Promise((r) => setTimeout(r, reconcileInterval));
      }
    }

    if (reconciled) {
      clearRecoveryParams();
      onProgress({
        step: 'reconciled',
        title,
        hash,
        error: null,
      });
      return { success: true, reconciled: true, receipt };
    } else {
      onProgress({
        step: 'readback_pending',
        title,
        hash,
        error: 'Transaction finalized on-chain, but state readback is taking longer to reflect.',
      });
      return { success: false, reconciled: false, receipt };
    }
  } catch (err: any) {
    onProgress({
      step: 'error',
      title,
      hash,
      error: err?.message || 'Failed to inspect transaction on-chain.',
    });
    return { success: false, reconciled: false, receipt: null };
  }
}

// Concrete write journeys
export async function createCaseAction(
  provider: EIP1193Provider,
  account: string,
  contractAddress: string,
  contentUrl: string,
  snapshotHash: string,
  submissionDeadline: bigint,
  challengeWindowSeconds: bigint,
  onProgress: (p: TxProgress) => void
) {
  const initialCount = Number(await fetchCaseCount(contractAddress));

  return executeWriteTransaction({
    provider,
    account,
    contractAddress,
    functionName: 'create_case',
    args: [contentUrl, snapshotHash, submissionDeadline, challengeWindowSeconds],
    title: 'Create Content Case',
    recoveryBaseline: initialCount,
    onProgress,
    reconcileCheck: async () => {
      return Number(await fetchCaseCount(contractAddress)) > initialCount;
    },
  });
}

export async function submitNoteAction(
  provider: EIP1193Provider,
  account: string,
  contractAddress: string,
  caseId: bigint,
  noteText: string,
  sourceUrls: string[],
  onProgress: (p: TxProgress) => void
) {
  const initialCount = Number(await fetchNoteCount(contractAddress, caseId));

  return executeWriteTransaction({
    provider,
    account,
    contractAddress,
    functionName: 'submit_note',
    args: [caseId, noteText, sourceUrls],
    title: `Submit Candidate Note (Case #${caseId})`,
    caseId: Number(caseId),
    recoveryBaseline: initialCount,
    onProgress,
    reconcileCheck: async () => {
      return Number(await fetchNoteCount(contractAddress, caseId)) > initialCount;
    },
  });
}

export async function lockCaseAction(
  provider: EIP1193Provider,
  account: string,
  contractAddress: string,
  caseId: bigint,
  onProgress: (p: TxProgress) => void
) {
  return executeWriteTransaction({
    provider,
    account,
    contractAddress,
    functionName: 'lock_case',
    args: [caseId],
    title: `Lock Case #${caseId}`,
    caseId: Number(caseId),
    onProgress,
    reconcileCheck: async () => {
      const c = await fetchCase(contractAddress, caseId);
      return c.state === 'LOCKED';
    },
  });
}

export async function evaluateCaseAction(
  provider: EIP1193Provider,
  account: string,
  contractAddress: string,
  caseId: bigint,
  onProgress: (p: TxProgress) => void
) {
  return executeWriteTransaction({
    provider,
    account,
    contractAddress,
    functionName: 'evaluate_case',
    args: [caseId],
    title: `Evaluate Case #${caseId}`,
    caseId: Number(caseId),
    onProgress,
    reconcileCheck: async () => {
      const c = await fetchCase(contractAddress, caseId);
      return c.state === 'CHALLENGE';
    },
  });
}

export async function submitChallengeAction(
  provider: EIP1193Provider,
  account: string,
  contractAddress: string,
  caseId: bigint,
  reason: string,
  sourceUrls: string[],
  onProgress: (p: TxProgress) => void
) {
  const initialCount = Number(await fetchChallengeCount(contractAddress, caseId));

  return executeWriteTransaction({
    provider,
    account,
    contractAddress,
    functionName: 'submit_challenge',
    args: [caseId, reason, sourceUrls],
    title: `Submit Challenge (Case #${caseId})`,
    caseId: Number(caseId),
    recoveryBaseline: initialCount,
    onProgress,
    reconcileCheck: async () => {
      return Number(await fetchChallengeCount(contractAddress, caseId)) > initialCount;
    },
  });
}

export async function resolveChallengesAction(
  provider: EIP1193Provider,
  account: string,
  contractAddress: string,
  caseId: bigint,
  onProgress: (p: TxProgress) => void
) {
  return executeWriteTransaction({
    provider,
    account,
    contractAddress,
    functionName: 'resolve_challenges',
    args: [caseId],
    title: `Resolve Challenges (Case #${caseId})`,
    caseId: Number(caseId),
    onProgress,
    reconcileCheck: async () => {
      const c = await fetchCase(contractAddress, caseId);
      return c.state === 'EVALUATED';
    },
  });
}

export async function finalizeCaseAction(
  provider: EIP1193Provider,
  account: string,
  contractAddress: string,
  caseId: bigint,
  onProgress: (p: TxProgress) => void
) {
  return executeWriteTransaction({
    provider,
    account,
    contractAddress,
    functionName: 'finalize_case',
    args: [caseId],
    title: `Finalize Case #${caseId}`,
    caseId: Number(caseId),
    onProgress,
    reconcileCheck: async () => {
      const c = await fetchCase(contractAddress, caseId);
      return c.state === 'FINALIZED';
    },
  });
}
