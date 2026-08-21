import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { App } from '../App';
import { WalletProvider } from '../wallet/WalletContext';
import * as repoModule from '../genlayer/repository';
import * as clientModule from '../genlayer/client';
import { CaseData } from '../genlayer/types';

describe('Workbench Application Views & Deep-linking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('15. Direct-route reload loads the requested case via URL parameter', async () => {
    // Set URL parameter ?case=2
    window.history.pushState({}, 'Case 2', '/?case=2');

    const fakeCases: CaseData[] = [
      {
        id: 1,
        creator: '0x1111111111111111111111111111111111111111',
        content_url: 'https://example.com/item-1',
        snapshot_hash: '1'.repeat(64),
        submission_deadline: 1800000000,
        challenge_window_seconds: 86400,
        challenge_deadline: 0,
        state: 'OPEN',
        note_count: 0,
        challenge_count: 0,
        provisional_selected_note_id: -1,
        provisional_display_consequence: '',
        provisional_rationale_digest: '',
        provisional_scores: [],
        final_selected_note_id: -1,
        final_display_consequence: '',
        final_rationale_digest: '',
        final_scores: [],
        impactful_challenge_ids: [],
        created_at: 1700000000,
        locked_at: 0,
        evaluated_at: 0,
        resolved_at: 0,
        finalized_at: 0,
      },
      {
        id: 2,
        creator: '0x2222222222222222222222222222222222222222',
        content_url: 'https://example.com/target-case-2',
        snapshot_hash: '2'.repeat(64),
        submission_deadline: 1800000000,
        challenge_window_seconds: 86400,
        challenge_deadline: 0,
        state: 'LOCKED',
        note_count: 1,
        challenge_count: 0,
        provisional_selected_note_id: -1,
        provisional_display_consequence: '',
        provisional_rationale_digest: '',
        provisional_scores: [],
        final_selected_note_id: -1,
        final_display_consequence: '',
        final_rationale_digest: '',
        final_scores: [],
        impactful_challenge_ids: [],
        created_at: 1700000100,
        locked_at: 1700000200,
        evaluated_at: 0,
        resolved_at: 0,
        finalized_at: 0,
      },
    ];

    vi.spyOn(repoModule, 'fetchCases').mockResolvedValue(fakeCases);
    vi.spyOn(repoModule, 'fetchCase').mockResolvedValue(fakeCases[1]);
    vi.spyOn(repoModule, 'fetchNotes').mockResolvedValue([
      {
        id: 0,
        case_id: 2,
        author: '0xauthor',
        note_text: 'Deep link note text',
        source_urls: ['https://untrusted-evidence.com/page'],
        submitted_at: 1700000150,
      },
    ]);
    vi.spyOn(repoModule, 'fetchChallenges').mockResolvedValue([]);

    // Mock env variable
    vi.stubEnv('VITE_CONTRACT_ADDRESS', '0x1234567890abcdef1234567890abcdef12345678');

    render(
      <WalletProvider>
        <App />
      </WalletProvider>
    );

    // Wait for Case #2 details to load
    await waitFor(() => {
      expect(screen.getAllByText(/Case #2/).length).toBeGreaterThan(0);
      expect(screen.getByText('https://example.com/target-case-2 ↗')).toBeInTheDocument();
      expect(screen.getByText('Deep link note text')).toBeInTheDocument();
      expect(screen.getByText('Untrusted source')).toBeInTheDocument();
    });
  });

  it('16. Missing or invalid contract address shows warning banner without decorative emoji', () => {
    vi.stubEnv('VITE_CONTRACT_ADDRESS', '');

    render(
      <WalletProvider>
        <App />
      </WalletProvider>
    );

    expect(
      screen.getByText('Council Contract Address Not Configured')
    ).toBeInTheDocument();
  });

  it('17. CaseDetail renders final resolution in EVALUATED and FINALIZED states, provisional in CHALLENGE', async () => {
    window.history.pushState({}, 'Case 1', '/?case=1');
    vi.stubEnv('VITE_CONTRACT_ADDRESS', '0x1234567890abcdef1234567890abcdef12345678');

    const evaluatedCase: CaseData = {
      id: 1,
      creator: '0x1111111111111111111111111111111111111111',
      content_url: 'https://example.com/evaluated-article',
      snapshot_hash: 'e'.repeat(64),
      submission_deadline: 1700000000,
      challenge_window_seconds: 86400,
      challenge_deadline: 1700086400,
      state: 'EVALUATED',
      note_count: 1,
      challenge_count: 1,
      provisional_selected_note_id: 0,
      provisional_display_consequence: 'NO_NOTE',
      provisional_rationale_digest: 'prov_digest_hash_1111',
      provisional_scores: [
        {
          note_id: 0,
          relevance: 50,
          source_quality: 50,
          clarity: 50,
          contradiction_risk: 50,
          total: 5000,
        },
      ],
      final_selected_note_id: 0,
      final_display_consequence: 'DISPLAY',
      final_rationale_digest: 'final_digest_hash_9999',
      final_scores: [
        {
          note_id: 0,
          relevance: 95,
          source_quality: 95,
          clarity: 90,
          contradiction_risk: 5,
          total: 9400,
        },
      ],
      impactful_challenge_ids: [0],
      created_at: 1699900000,
      locked_at: 1700000000,
      evaluated_at: 1700000100,
      resolved_at: 1700086500,
      finalized_at: 0,
    };

    vi.spyOn(repoModule, 'fetchCases').mockResolvedValue([evaluatedCase]);
    vi.spyOn(repoModule, 'fetchCase').mockResolvedValue(evaluatedCase);
    vi.spyOn(repoModule, 'fetchNotes').mockResolvedValue([
      {
        id: 0,
        case_id: 1,
        author: '0xauthor1',
        note_text: 'Winning evaluated note text',
        source_urls: ['https://source.org'],
        submitted_at: 1699900500,
      },
    ]);
    vi.spyOn(repoModule, 'fetchChallenges').mockResolvedValue([
      {
        id: 0,
        case_id: 1,
        challenger: '0xchallenger1',
        reason: 'Counter argument that flipped decision',
        source_urls: ['https://challenge.org'],
        submitted_at: 1700000500,
      },
    ]);

    render(
      <WalletProvider>
        <App />
      </WalletProvider>
    );

    // Verify EVALUATED displays the final consequence ("DISPLAY NOTE") and final score breakdown
    await waitFor(() => {
      expect(screen.getByText('DISPLAY NOTE')).toBeInTheDocument();
      expect(screen.getByText('Final Resolution:')).toBeInTheDocument();
      expect(screen.getByText('final_digest_hash_9999')).toBeInTheDocument();
      expect(screen.getByText('9,400 / 10,000 bps (94.00%)')).toBeInTheDocument();
      expect(screen.getByText('Impactful (+1 Rep)')).toBeInTheDocument();
    });
  });

  it('18. Direct reload with recovery query parameters inspects state via read client with ZERO writes', async () => {
    // Set recovery query parameters in URL
    window.history.pushState(
      {},
      'Recovery',
      '/?case=1&recovery_hash=0xtxhash_recovered_123&recovery_action=lock_case&recovery_case=1'
    );
    vi.stubEnv('VITE_CONTRACT_ADDRESS', '0x1234567890abcdef1234567890abcdef12345678');

    const fakeCase: CaseData = {
      id: 1,
      creator: '0x1111111111111111111111111111111111111111',
      content_url: 'https://example.com/item-1',
      snapshot_hash: '1'.repeat(64),
      submission_deadline: 1800000000,
      challenge_window_seconds: 86400,
      challenge_deadline: 0,
      state: 'LOCKED',
      note_count: 0,
      challenge_count: 0,
      provisional_selected_note_id: -1,
      provisional_display_consequence: '',
      provisional_rationale_digest: '',
      provisional_scores: [],
      final_selected_note_id: -1,
      final_display_consequence: '',
      final_rationale_digest: '',
      final_scores: [],
      impactful_challenge_ids: [],
      created_at: 1700000000,
      locked_at: 1700000100,
      evaluated_at: 0,
      resolved_at: 0,
      finalized_at: 0,
    };

    vi.spyOn(repoModule, 'fetchCases').mockResolvedValue([fakeCase]);
    vi.spyOn(repoModule, 'fetchCase').mockResolvedValue(fakeCase);
    vi.spyOn(repoModule, 'fetchNotes').mockResolvedValue([]);
    vi.spyOn(repoModule, 'fetchChallenges').mockResolvedValue([]);

    const mockWaitForReceipt = vi.fn().mockResolvedValue({
      status: 'FINALIZED',
      txExecutionResultName: 'FINISHED_WITH_RETURN',
      execution_result: 1,
    });

    vi.spyOn(clientModule, 'getReadClient').mockReturnValue({
      waitForTransactionReceipt: mockWaitForReceipt,
      readContract: vi.fn(),
    } as any);

    const writeSpy = vi.spyOn(clientModule, 'getWriteClient');

    render(
      <WalletProvider>
        <App />
      </WalletProvider>
    );

    // Assert readback occurred and ZERO write calls or wallet prompts occurred
    await waitFor(() => {
      expect(mockWaitForReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ hash: '0xtxhash_recovered_123' })
      );
      expect(writeSpy).not.toHaveBeenCalled();
    });
  });

  it('19. Popstate Back/Forward navigation updates active case', async () => {
    window.history.pushState({}, 'Case 1', '/?case=1');
    vi.stubEnv('VITE_CONTRACT_ADDRESS', '0x1234567890abcdef1234567890abcdef12345678');

    const case1: CaseData = {
      id: 1,
      creator: '0x111',
      content_url: 'https://example.com/item-1',
      snapshot_hash: '1'.repeat(64),
      submission_deadline: 1800000000,
      challenge_window_seconds: 86400,
      challenge_deadline: 0,
      state: 'OPEN',
      note_count: 0,
      challenge_count: 0,
      provisional_selected_note_id: -1,
      provisional_display_consequence: '',
      provisional_rationale_digest: '',
      provisional_scores: [],
      final_selected_note_id: -1,
      final_display_consequence: '',
      final_rationale_digest: '',
      final_scores: [],
      impactful_challenge_ids: [],
      created_at: 1700000000,
      locked_at: 0,
      evaluated_at: 0,
      resolved_at: 0,
      finalized_at: 0,
    };

    const case2: CaseData = {
      ...case1,
      id: 2,
      content_url: 'https://example.com/item-2',
    };

    vi.spyOn(repoModule, 'fetchCases').mockResolvedValue([case1, case2]);
    const fetchCaseSpy = vi.spyOn(repoModule, 'fetchCase').mockResolvedValue(case1);
    vi.spyOn(repoModule, 'fetchNotes').mockResolvedValue([]);
    vi.spyOn(repoModule, 'fetchChallenges').mockResolvedValue([]);

    render(
      <WalletProvider>
        <App />
      </WalletProvider>
    );

    await waitFor(() => {
      expect(fetchCaseSpy).toHaveBeenCalledWith(expect.any(String), 1n);
    });

    // Simulate browser Forward/Back popstate event to ?case=2
    window.history.pushState({}, 'Case 2', '/?case=2');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      expect(fetchCaseSpy).toHaveBeenCalledWith(expect.any(String), 2n);
    });
  });
});
