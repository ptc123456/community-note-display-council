import { getReadClient } from './client';
import {
  CaseData,
  CandidateNote,
  ChallengeData,
  CaseState,
  DisplayConsequence,
  ScoreRecord,
} from './types';

const VALID_STATES = new Set<CaseState>([
  'OPEN',
  'LOCKED',
  'CHALLENGE',
  'EVALUATED',
  'FINALIZED',
]);

const VALID_CONSEQUENCES = new Set<DisplayConsequence>([
  'DISPLAY',
  'DISPLAY_WITH_WARNING',
  'NO_NOTE',
  '',
]);

function parseAndValidateCaseState(state: any): CaseState {
  if (typeof state !== 'string' || !VALID_STATES.has(state as CaseState)) {
    throw new Error(`Malformed RPC case state: ${String(state)}`);
  }
  return state as CaseState;
}

function parseAndValidateConsequence(consequence: any): DisplayConsequence {
  if (consequence === undefined || consequence === null || consequence === '') {
    return '';
  }
  if (typeof consequence !== 'string' || !VALID_CONSEQUENCES.has(consequence as DisplayConsequence)) {
    throw new Error(`Malformed RPC display consequence: ${String(consequence)}`);
  }
  return consequence as DisplayConsequence;
}

function parseAndValidateScoreRecord(s: any): ScoreRecord {
  if (!s || typeof s !== 'object') {
    throw new Error('Malformed score record in RPC payload.');
  }
  const note_id = Number(s.note_id);
  const relevance = Number(s.relevance);
  const source_quality = Number(s.source_quality);
  const clarity = Number(s.clarity);
  const contradiction_risk = Number(s.contradiction_risk);
  const total = Number(s.total);

  if (
    !Number.isInteger(note_id) || note_id < 0 ||
    !Number.isInteger(relevance) || relevance < 0 || relevance > 100 ||
    !Number.isInteger(source_quality) || source_quality < 0 || source_quality > 100 ||
    !Number.isInteger(clarity) || clarity < 0 || clarity > 100 ||
    !Number.isInteger(contradiction_risk) || contradiction_risk < 0 || contradiction_risk > 100 ||
    !Number.isInteger(total) || total < 0 || total > 10000
  ) {
    throw new Error('Malformed numeric values in score record.');
  }

  return {
    note_id,
    relevance,
    source_quality,
    clarity,
    contradiction_risk,
    total,
  };
}

export async function fetchCaseCount(contractAddress: string): Promise<bigint> {
  const client = getReadClient();
  const raw = await client.readContract({
    address: contractAddress as any,
    functionName: 'get_case_count',
    args: [],
  });
  return BigInt(raw as any);
}

export async function fetchCase(contractAddress: string, caseId: bigint): Promise<CaseData> {
  const client = getReadClient();
  const raw = await client.readContract({
    address: contractAddress as any,
    functionName: 'get_case',
    args: [caseId],
  });

  if (!raw) {
    throw new Error(`Case #${caseId} does not exist on-chain.`);
  }

  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid JSON payload for Case #${caseId}`);
  }

  const id = Number(parsed.id);
  if (isNaN(id) || id <= 0) {
    throw new Error(`Malformed case ID in RPC payload: ${parsed.id}`);
  }

  const creator = String(parsed.creator || '').trim();
  if (!creator) {
    throw new Error(`Missing case creator in RPC payload for Case #${id}`);
  }

  const content_url = String(parsed.content_url || '').trim();
  if (!content_url) {
    throw new Error(`Missing content URL in RPC payload for Case #${id}`);
  }

  const snapshot_hash = String(parsed.snapshot_hash || '').trim();
  if (!/^[0-9a-f]{64}$/.test(snapshot_hash)) {
    throw new Error(`Malformed snapshot hash in RPC payload for Case #${id}`);
  }

  const state = parseAndValidateCaseState(parsed.state);
  const provisional_display_consequence = parseAndValidateConsequence(
    parsed.provisional_display_consequence
  );
  const final_display_consequence = parseAndValidateConsequence(
    parsed.final_display_consequence
  );

  const submission_deadline = Number(parsed.submission_deadline);
  const challenge_window_seconds = Number(parsed.challenge_window_seconds);
  const challenge_deadline = Number(parsed.challenge_deadline || 0);
  const note_count = Number(parsed.note_count || 0);
  const challenge_count = Number(parsed.challenge_count || 0);

  if (
    !Number.isSafeInteger(submission_deadline) || submission_deadline <= 0 ||
    !Number.isSafeInteger(challenge_window_seconds) || challenge_window_seconds < 3600 ||
    challenge_window_seconds > 604800 ||
    !Number.isSafeInteger(challenge_deadline) || challenge_deadline < 0 ||
    !Number.isInteger(note_count) || note_count < 0 || note_count > 5 ||
    !Number.isInteger(challenge_count) || challenge_count < 0 || challenge_count > 3
  ) {
    throw new Error(`Malformed deadline fields in RPC payload for Case #${id}`);
  }

  const provisional_scores: ScoreRecord[] = Array.isArray(parsed.provisional_scores)
    ? parsed.provisional_scores.map(parseAndValidateScoreRecord)
    : [];

  const final_scores: ScoreRecord[] = Array.isArray(parsed.final_scores)
    ? parsed.final_scores.map(parseAndValidateScoreRecord)
    : [];

  const impactful_challenge_ids: number[] = Array.isArray(parsed.impactful_challenge_ids)
    ? parsed.impactful_challenge_ids.map((cid: any) => {
        const num = Number(cid);
        if (isNaN(num)) throw new Error('Malformed impactful challenge ID.');
        return num;
      })
    : [];

  return {
    id,
    creator,
    content_url,
    snapshot_hash,
    submission_deadline,
    challenge_window_seconds,
    challenge_deadline,
    state,
    note_count,
    challenge_count,
    provisional_selected_note_id: Number(parsed.provisional_selected_note_id ?? -1),
    provisional_display_consequence,
    provisional_rationale_digest: String(parsed.provisional_rationale_digest || ''),
    provisional_scores,
    final_selected_note_id: Number(parsed.final_selected_note_id ?? -1),
    final_display_consequence,
    final_rationale_digest: String(parsed.final_rationale_digest || ''),
    final_scores,
    impactful_challenge_ids,
    created_at: Number(parsed.created_at || 0),
    locked_at: Number(parsed.locked_at || 0),
    evaluated_at: Number(parsed.evaluated_at || 0),
    resolved_at: Number(parsed.resolved_at || 0),
    finalized_at: Number(parsed.finalized_at || 0),
  };
}

export async function fetchCases(contractAddress: string): Promise<CaseData[]> {
  const count = await fetchCaseCount(contractAddress);
  const total = Number(count);
  if (total <= 0) return [];

  const promises: Promise<CaseData>[] = [];
  for (let i = 1; i <= total; i++) {
    promises.push(fetchCase(contractAddress, BigInt(i)));
  }

  const cases = await Promise.all(promises);
  // Sort descending by case ID
  return cases.sort((a, b) => b.id - a.id);
}

export async function fetchNoteCount(contractAddress: string, caseId: bigint): Promise<bigint> {
  const client = getReadClient();
  const raw = await client.readContract({
    address: contractAddress as any,
    functionName: 'get_note_count',
    args: [caseId],
  });
  return BigInt(raw as any);
}

export async function fetchNote(
  contractAddress: string,
  caseId: bigint,
  noteId: bigint
): Promise<CandidateNote> {
  const client = getReadClient();
  const raw = await client.readContract({
    address: contractAddress as any,
    functionName: 'get_note',
    args: [caseId, noteId],
  });

  if (!raw) {
    throw new Error(`Note #${noteId} for Case #${caseId} does not exist.`);
  }

  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Malformed JSON for Note #${noteId}`);
  }

  const rawId = parsed.note_id;
  const id = Number(rawId);
  if (isNaN(id) || id < 0) {
    throw new Error(`Malformed note_id in RPC payload: ${String(rawId)}`);
  }

  const parsedCaseId = Number(parsed.case_id);
  const author = String(parsed.author || '').trim();
  if (!Number.isInteger(parsedCaseId) || parsedCaseId !== Number(caseId) || !author) {
    throw new Error(`Missing author in RPC payload for Note #${id}`);
  }
  if (typeof parsed.note_text !== 'string' || !Array.isArray(parsed.source_urls)) {
    throw new Error(`Malformed content in RPC payload for Note #${id}`);
  }

  return {
    id,
    case_id: parsedCaseId,
    author,
    note_text: String(parsed.note_text || ''),
    source_urls: Array.isArray(parsed.source_urls) ? parsed.source_urls.map(String) : [],
    submitted_at: Number(parsed.submitted_at || 0),
  };
}

export async function fetchNotes(
  contractAddress: string,
  caseId: bigint,
  count?: number
): Promise<CandidateNote[]> {
  const totalCount = count !== undefined ? count : Number(await fetchNoteCount(contractAddress, caseId));
  if (totalCount <= 0) return [];

  const promises: Promise<CandidateNote>[] = [];
  for (let i = 0; i < totalCount; i++) {
    promises.push(fetchNote(contractAddress, caseId, BigInt(i)));
  }

  return Promise.all(promises);
}

export async function fetchChallengeCount(
  contractAddress: string,
  caseId: bigint
): Promise<bigint> {
  const client = getReadClient();
  const raw = await client.readContract({
    address: contractAddress as any,
    functionName: 'get_challenge_count',
    args: [caseId],
  });
  return BigInt(raw as any);
}

export async function fetchChallenge(
  contractAddress: string,
  caseId: bigint,
  challengeId: bigint
): Promise<ChallengeData> {
  const client = getReadClient();
  const raw = await client.readContract({
    address: contractAddress as any,
    functionName: 'get_challenge',
    args: [caseId, challengeId],
  });

  if (!raw) {
    throw new Error(`Challenge #${challengeId} for Case #${caseId} does not exist.`);
  }

  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Malformed JSON for Challenge #${challengeId}`);
  }

  const rawId = parsed.challenge_id;
  const id = Number(rawId);
  if (isNaN(id) || id < 0) {
    throw new Error(`Malformed challenge_id in RPC payload: ${String(rawId)}`);
  }

  const parsedCaseId = Number(parsed.case_id);
  const challenger = String(parsed.challenger || '').trim();
  if (!Number.isInteger(parsedCaseId) || parsedCaseId !== Number(caseId) || !challenger) {
    throw new Error(`Missing challenger in RPC payload for Challenge #${id}`);
  }
  if (typeof parsed.reason !== 'string' || !Array.isArray(parsed.source_urls)) {
    throw new Error(`Malformed content in RPC payload for Challenge #${id}`);
  }

  return {
    id,
    case_id: parsedCaseId,
    challenger,
    reason: String(parsed.reason || ''),
    source_urls: Array.isArray(parsed.source_urls) ? parsed.source_urls.map(String) : [],
    submitted_at: Number(parsed.submitted_at || 0),
  };
}

export async function fetchChallenges(
  contractAddress: string,
  caseId: bigint,
  count?: number
): Promise<ChallengeData[]> {
  const totalCount =
    count !== undefined ? count : Number(await fetchChallengeCount(contractAddress, caseId));
  if (totalCount <= 0) return [];

  const promises: Promise<ChallengeData>[] = [];
  for (let i = 0; i < totalCount; i++) {
    promises.push(fetchChallenge(contractAddress, caseId, BigInt(i)));
  }

  return Promise.all(promises);
}

export async function fetchReputation(
  contractAddress: string,
  authorAddress: string
): Promise<bigint> {
  const client = getReadClient();
  const raw = await client.readContract({
    address: contractAddress as any,
    functionName: 'get_reputation',
    args: [authorAddress],
  });
  return BigInt(raw as any);
}
