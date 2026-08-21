import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isValidContractAddress,
  formatAddress,
  formatTimestamp,
} from '../genlayer/types';
import {
  classifyExecutionResult,
  isExecutionSuccess,
  executeWriteTransaction,
  recoverSubmittedTransaction,
  setRecoveryParams,
  getRecoveryParams,
  clearRecoveryParams,
  createRecoveryReconcileCheck,
  createCaseAction,
  submitNoteAction,
  lockCaseAction,
  evaluateCaseAction,
  submitChallengeAction,
  resolveChallengesAction,
  finalizeCaseAction,
} from '../genlayer/transactions';
import * as clientModule from '../genlayer/client';
import * as repoModule from '../genlayer/repository';

describe('Repository and Transaction Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('6. Missing/invalid contract address blocks actions', () => {
    expect(isValidContractAddress('')).toBe(false);
    expect(isValidContractAddress(null as any)).toBe(false);
    expect(isValidContractAddress(undefined as any)).toBe(false);
    expect(isValidContractAddress('0x123')).toBe(false); // too short
    expect(isValidContractAddress('123456789012345678901234567890123456789012')).toBe(false); // missing 0x
    expect(isValidContractAddress('0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ')).toBe(false); // invalid hex
    expect(
      isValidContractAddress('0x1234567890abcdef1234567890abcdef12345678')
    ).toBe(true);
  });

  it('7. Strict consensus truth: FINISHED_WITH_RETURN vs FINISHED_WITH_ERROR vs fail-closed unknown', () => {
    // 7a. Finished with return (Success)
    const successReceipt1 = {
      status: 'FINALIZED',
      txExecutionResultName: 'FINISHED_WITH_RETURN',
      execution_result: 1,
    };
    expect(classifyExecutionResult(successReceipt1).classification).toBe('SUCCESS');
    expect(isExecutionSuccess(successReceipt1)).toBe(true);

    const successReceipt2 = {
      status: 'FINALIZED',
      consensus_data: {
        leader_receipt: {
          execution_result: 1,
        },
      },
    };
    expect(classifyExecutionResult(successReceipt2).classification).toBe('SUCCESS');
    expect(isExecutionSuccess(successReceipt2)).toBe(true);

    // 7b. Finished with error (Terminal Execution Failure)
    const errorReceipt1 = {
      status: 'FINALIZED',
      txExecutionResultName: 'FINISHED_WITH_ERROR',
      execution_result: 2,
    };
    expect(classifyExecutionResult(errorReceipt1).classification).toBe('ERROR');
    expect(isExecutionSuccess(errorReceipt1)).toBe(false);

    const errorReceipt2 = {
      status: 'FINALIZED',
      consensus_data: {
        leader_receipt: {
          execution_result: 2,
        },
      },
    };
    expect(classifyExecutionResult(errorReceipt2).classification).toBe('ERROR');
    expect(isExecutionSuccess(errorReceipt2)).toBe(false);

    // 7c. Receipt with status FINALIZED but missing or conflicting indicators fails closed to UNKNOWN
    const plainFinalizedReceipt = {
      status: 'FINALIZED',
    };
    expect(classifyExecutionResult(plainFinalizedReceipt).classification).toBe('UNKNOWN');
    expect(isExecutionSuccess(plainFinalizedReceipt)).toBe(false);

    const conflictingReceipt = {
      status: 'FINALIZED',
      txExecutionResultName: 'FINISHED_WITH_RETURN',
      consensus_data: {
        leader_receipt: {
          txExecutionResultName: 'FINISHED_WITH_ERROR',
        },
      },
    };
    expect(classifyExecutionResult(conflictingReceipt).classification).toBe('UNKNOWN');
    expect(isExecutionSuccess(conflictingReceipt)).toBe(false);
  });

  it('8. Two-phase transaction completion & readback timeout transitions to readback_pending', async () => {
    const mockWriteContract = vi.fn().mockResolvedValue('0xtxhash_pending');
    const mockWaitForReceipt = vi.fn().mockResolvedValue({
      status: 'FINALIZED',
      txExecutionResultName: 'FINISHED_WITH_RETURN',
      execution_result: 1,
    });

    vi.spyOn(clientModule, 'getWriteClient').mockResolvedValue({
      writeContract: mockWriteContract,
      waitForTransactionReceipt: mockWaitForReceipt,
    } as any);

    const progressHistory: string[] = [];

    // Reconcile check that never resolves (times out)
    const result = await executeWriteTransaction({
      provider: { request: vi.fn() },
      account: '0x123',
      contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      functionName: 'lock_case',
      args: [1n],
      title: 'Lock Case',
      onProgress: (p) => progressHistory.push(p.step),
      reconcileCheck: async () => false,
      reconcileRetries: 2,
      reconcileInterval: 10,
    });

    // When readback times out, success MUST be false (not claiming unverified success)
    expect(result.success).toBe(false);
    expect(result.reconciled).toBe(false);
    expect(progressHistory).toContain('awaiting_signature');
    expect(progressHistory).toContain('submitted');
    expect(progressHistory).toContain('finalizing');
    expect(progressHistory).toContain('finalized');
    expect(progressHistory).toContain('reconciling');
    expect(progressHistory).toContain('readback_pending');
    expect(progressHistory).not.toContain('reconciled');
  });

  it('9. Delayed authoritative readback reaches reconciled without replaying write', async () => {
    let writeCalls = 0;
    const mockWriteContract = vi.fn().mockImplementation(async () => {
      writeCalls++;
      return '0xtxhash123456';
    });

    const mockWaitForReceipt = vi.fn().mockResolvedValue({
      status: 'FINALIZED',
      txExecutionResultName: 'FINISHED_WITH_RETURN',
      execution_result: 1,
    });

    const fakeWriteClient = {
      writeContract: mockWriteContract,
      waitForTransactionReceipt: mockWaitForReceipt,
    };

    vi.spyOn(clientModule, 'getWriteClient').mockResolvedValue(fakeWriteClient as any);

    let readAttempts = 0;
    const progressHistory: string[] = [];

    const result = await executeWriteTransaction({
      provider: { request: vi.fn() },
      account: '0x123',
      contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      functionName: 'lock_case',
      args: [1n],
      title: 'Lock Case',
      onProgress: (p) => progressHistory.push(p.step),
      reconcileCheck: async () => {
        readAttempts++;
        // Simulate observable update on attempt 2
        return readAttempts >= 2;
      },
    });

    expect(result.success).toBe(true);
    expect(result.reconciled).toBe(true);
    expect(result.hash).toBe('0xtxhash123456');
    expect(writeCalls).toBe(1); // Write was called EXACTLY once (never replayed!)
    expect(readAttempts).toBe(2);
    expect(progressHistory).toContain('awaiting_signature');
    expect(progressHistory).toContain('submitted');
    expect(progressHistory).toContain('finalizing');
    expect(progressHistory).toContain('reconciling');
    expect(progressHistory).toContain('reconciled');
  });

  it('10. Execution error fails terminally without calling reconcile', async () => {
    const mockWriteContract = vi.fn().mockResolvedValue('0xtxhash_err');
    const mockWaitForReceipt = vi.fn().mockResolvedValue({
      status: 'FINALIZED',
      txExecutionResultName: 'FINISHED_WITH_ERROR',
      execution_result: 2,
    });

    vi.spyOn(clientModule, 'getWriteClient').mockResolvedValue({
      writeContract: mockWriteContract,
      waitForTransactionReceipt: mockWaitForReceipt,
    } as any);

    const reconcileCheck = vi.fn();
    const progressHistory: string[] = [];

    const result = await executeWriteTransaction({
      provider: { request: vi.fn() },
      account: '0x123',
      contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      functionName: 'evaluate_case',
      args: [1n],
      title: 'Evaluate Case',
      onProgress: (p) => progressHistory.push(p.step),
      reconcileCheck,
    });

    expect(result.success).toBe(false);
    expect(reconcileCheck).not.toHaveBeenCalled();
    expect(progressHistory).toContain('execution_error');
    expect(progressHistory).not.toContain('reconciled');
  });

  it('11. URL Recovery parameter management and headless read recovery with ZERO writes', async () => {
    // 11a. Test URL params helpers
    setRecoveryParams('0xrecovery123', 'lock_case', 5, 2);
    const params = getRecoveryParams();
    expect(params.hash).toBe('0xrecovery123');
    expect(params.action).toBe('lock_case');
    expect(params.caseId).toBe(5);
    expect(params.baseline).toBe(2);

    clearRecoveryParams();
    const clearedParams = getRecoveryParams();
    expect(clearedParams.hash).toBeNull();
    expect(clearedParams.action).toBeNull();

    // 11b. Headless recovery using read client
    const mockWaitForReceipt = vi.fn().mockResolvedValue({
      status: 'FINALIZED',
      txExecutionResultName: 'FINISHED_WITH_RETURN',
      execution_result: 1,
    });

    vi.spyOn(clientModule, 'getReadClient').mockReturnValue({
      waitForTransactionReceipt: mockWaitForReceipt,
    } as any);

    const mockWriteSpy = vi.spyOn(clientModule, 'getWriteClient');

    const progressHistory: string[] = [];
    vi.spyOn(repoModule, 'fetchCase').mockResolvedValue({ state: 'LOCKED' } as any);
    const reconcileCheck = createRecoveryReconcileCheck(
      '0x1234567890abcdef1234567890abcdef12345678',
      'lock_case',
      5,
      2
    );

    const recoveryResult = await recoverSubmittedTransaction({
      hash: '0xrecovery123',
      title: 'Recovering lock_case',
      onProgress: (p) => progressHistory.push(p.step),
      reconcileCheck,
    });

    expect(recoveryResult.success).toBe(true);
    expect(recoveryResult.reconciled).toBe(true);
    expect(mockWaitForReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ hash: '0xrecovery123' })
    );
    expect(repoModule.fetchCase).toHaveBeenCalledWith(
      '0x1234567890abcdef1234567890abcdef12345678',
      5n
    );
    // Assert ZERO write clients or write operations were invoked during recovery
    expect(mockWriteSpy).not.toHaveBeenCalled();
  });

  it('12. State/deadline action eligibility and exact function name & arguments mapping', async () => {
    const fakeClient = {
      writeContract: vi.fn().mockResolvedValue('0xhash_journey'),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: 'FINALIZED',
        txExecutionResultName: 'FINISHED_WITH_RETURN',
        execution_result: 1,
      }),
    };
    vi.spyOn(clientModule, 'getWriteClient').mockResolvedValue(fakeClient as any);

    // Mock initial & updated responses so reconcileCheck resolves immediately on attempt 1
    vi.spyOn(repoModule, 'fetchCaseCount')
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(1n);
    vi.spyOn(repoModule, 'fetchNoteCount')
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(1n);
    vi.spyOn(repoModule, 'fetchChallengeCount')
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(1n);

    vi.spyOn(repoModule, 'fetchCase').mockResolvedValue({
      id: 1,
      state: 'LOCKED',
    } as any);

    const provider = { request: vi.fn() };
    const account = '0x1111111111111111111111111111111111111111';
    const contract = '0x2222222222222222222222222222222222222222';
    const noop = () => {};

    // 12a. create_case
    await createCaseAction(
      provider,
      account,
      contract,
      'https://example.com/item',
      'a'.repeat(64),
      1700000000n,
      86400n,
      noop
    );
    expect(fakeClient.writeContract).toHaveBeenLastCalledWith({
      address: contract,
      functionName: 'create_case',
      args: ['https://example.com/item', 'a'.repeat(64), 1700000000n, 86400n],
      value: 0n,
    });

    // 12b. submit_note
    await submitNoteAction(
      provider,
      account,
      contract,
      1n,
      'Context note text',
      ['https://source1.org'],
      noop
    );
    expect(fakeClient.writeContract).toHaveBeenLastCalledWith({
      address: contract,
      functionName: 'submit_note',
      args: [1n, 'Context note text', ['https://source1.org']],
      value: 0n,
    });

    // 12c. lock_case
    await lockCaseAction(provider, account, contract, 1n, noop);
    expect(fakeClient.writeContract).toHaveBeenLastCalledWith({
      address: contract,
      functionName: 'lock_case',
      args: [1n],
      value: 0n,
    });

    // 12d. evaluate_case
    vi.spyOn(repoModule, 'fetchCase').mockResolvedValueOnce({
      id: 1,
      state: 'CHALLENGE',
    } as any);
    await evaluateCaseAction(provider, account, contract, 1n, noop);
    expect(fakeClient.writeContract).toHaveBeenLastCalledWith({
      address: contract,
      functionName: 'evaluate_case',
      args: [1n],
      value: 0n,
    });

    // 12e. submit_challenge
    await submitChallengeAction(
      provider,
      account,
      contract,
      1n,
      'Challenge reason',
      ['https://counter.org'],
      noop
    );
    expect(fakeClient.writeContract).toHaveBeenLastCalledWith({
      address: contract,
      functionName: 'submit_challenge',
      args: [1n, 'Challenge reason', ['https://counter.org']],
      value: 0n,
    });

    // 12f. resolve_challenges
    vi.spyOn(repoModule, 'fetchCase').mockResolvedValueOnce({
      id: 1,
      state: 'EVALUATED',
    } as any);
    await resolveChallengesAction(provider, account, contract, 1n, noop);
    expect(fakeClient.writeContract).toHaveBeenLastCalledWith({
      address: contract,
      functionName: 'resolve_challenges',
      args: [1n],
      value: 0n,
    });

    // 12g. finalize_case
    vi.spyOn(repoModule, 'fetchCase').mockResolvedValueOnce({
      id: 1,
      state: 'FINALIZED',
    } as any);
    await finalizeCaseAction(provider, account, contract, 1n, noop);
    expect(fakeClient.writeContract).toHaveBeenLastCalledWith({
      address: contract,
      functionName: 'finalize_case',
      args: [1n],
      value: 0n,
    });
  });

  it('13. Real contract schema parsing: note_id -> CandidateNote.id and challenge_id -> ChallengeData.id', async () => {
    const rawCaseJson = JSON.stringify({
      id: 1,
      creator: '0x1234567890abcdef1234567890abcdef12345678',
      content_url: 'https://example.com/doc',
      snapshot_hash: 'b'.repeat(64),
      submission_deadline: 1700000000,
      challenge_window_seconds: 86400,
      challenge_deadline: 1700086400,
      state: 'FINALIZED',
      note_count: 1,
      challenge_count: 1,
      provisional_selected_note_id: 0,
      provisional_display_consequence: 'DISPLAY',
      provisional_rationale_digest: 'c'.repeat(64),
      provisional_scores: [
        {
          note_id: 0,
          relevance: 90,
          source_quality: 90,
          clarity: 80,
          contradiction_risk: 10,
          total: 8800,
        },
      ],
      final_selected_note_id: 0,
      final_display_consequence: 'DISPLAY',
      final_rationale_digest: 'd'.repeat(64),
      final_scores: [
        {
          note_id: 0,
          relevance: 90,
          source_quality: 90,
          clarity: 80,
          contradiction_risk: 10,
          total: 8800,
        },
      ],
      impactful_challenge_ids: [0],
      created_at: 1699900000,
      locked_at: 1700000000,
      evaluated_at: 1700000100,
      resolved_at: 1700086500,
      finalized_at: 1700086600,
    });

    // Contract payloads use on-chain storage keys: note_id and challenge_id
    const rawNoteJson = JSON.stringify({
      note_id: 0,
      case_id: 1,
      author: '0xauthor',
      note_text: 'Sample Note',
      source_urls: ['https://source.org'],
      submitted_at: 1699900500,
    });

    const rawChallengeJson = JSON.stringify({
      challenge_id: 0,
      case_id: 1,
      challenger: '0xchallenger',
      reason: 'Sample Reason',
      source_urls: ['https://challenge.org'],
      submitted_at: 1700000500,
    });

    const mockReadContract = vi.fn().mockImplementation(async ({ functionName }) => {
      if (functionName === 'get_case_count') return 1n;
      if (functionName === 'get_case') return rawCaseJson;
      if (functionName === 'get_note_count') return 1n;
      if (functionName === 'get_note') return rawNoteJson;
      if (functionName === 'get_challenge_count') return 1n;
      if (functionName === 'get_challenge') return rawChallengeJson;
      if (functionName === 'get_reputation') return 2n;
      return null;
    });

    vi.spyOn(clientModule, 'getReadClient').mockReturnValue({
      readContract: mockReadContract,
    } as any);

    const singleCase = await repoModule.fetchCase('0xcontract', 1n);
    expect(singleCase.id).toBe(1);
    expect(singleCase.state).toBe('FINALIZED');
    expect(singleCase.final_display_consequence).toBe('DISPLAY');
    expect(singleCase.final_scores[0].total).toBe(8800);

    const notes = await repoModule.fetchNotes('0xcontract', 1n, 1);
    expect(notes.length).toBe(1);
    expect(notes[0].id).toBe(0);
    expect(notes[0].note_text).toBe('Sample Note');

    const challenges = await repoModule.fetchChallenges('0xcontract', 1n, 1);
    expect(challenges.length).toBe(1);
    expect(challenges[0].id).toBe(0);
    expect(challenges[0].reason).toBe('Sample Reason');

    const reputation = await repoModule.fetchReputation('0xcontract', '0xauthor');
    expect(reputation).toBe(2n);

    expect(formatAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234...5678');
    expect(formatTimestamp(1700000000)).toContain('2023');
  });

  it('14. Malformed RPC payloads throw strict errors instead of silent coercions', async () => {
    // Malformed state
    const malformedStateJson = JSON.stringify({
      id: 1,
      creator: '0x123',
      content_url: 'https://example.com',
      snapshot_hash: 'a'.repeat(64),
      submission_deadline: 100,
      challenge_window_seconds: 100,
      state: 'INVALID_STATE_NAME',
    });

    vi.spyOn(clientModule, 'getReadClient').mockReturnValue({
      readContract: vi.fn().mockResolvedValue(malformedStateJson),
    } as any);

    await expect(repoModule.fetchCase('0xcontract', 1n)).rejects.toThrow(
      /Malformed RPC case state/
    );

    // Malformed consequence
    const malformedConsequenceJson = JSON.stringify({
      id: 1,
      creator: '0x123',
      content_url: 'https://example.com',
      snapshot_hash: 'a'.repeat(64),
      submission_deadline: 100,
      challenge_window_seconds: 100,
      state: 'EVALUATED',
      final_display_consequence: 'INVALID_CONSEQUENCE',
    });

    vi.spyOn(clientModule, 'getReadClient').mockReturnValue({
      readContract: vi.fn().mockResolvedValue(malformedConsequenceJson),
    } as any);

    await expect(repoModule.fetchCase('0xcontract', 1n)).rejects.toThrow(
      /Malformed RPC display consequence/
    );
  });
});
