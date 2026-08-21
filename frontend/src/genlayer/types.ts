export type CaseState = 'OPEN' | 'LOCKED' | 'CHALLENGE' | 'EVALUATED' | 'FINALIZED';

export type DisplayConsequence = 'DISPLAY' | 'DISPLAY_WITH_WARNING' | 'NO_NOTE' | '';

export interface ScoreRecord {
  note_id: number;
  relevance: number;
  source_quality: number;
  clarity: number;
  contradiction_risk: number;
  total: number;
}

export interface CaseData {
  id: number;
  creator: string;
  content_url: string;
  snapshot_hash: string;
  submission_deadline: number;
  challenge_window_seconds: number;
  challenge_deadline: number;
  state: CaseState;
  note_count: number;
  challenge_count: number;
  provisional_selected_note_id: number;
  provisional_display_consequence: DisplayConsequence;
  provisional_rationale_digest: string;
  provisional_scores: ScoreRecord[];
  final_selected_note_id: number;
  final_display_consequence: DisplayConsequence;
  final_rationale_digest: string;
  final_scores: ScoreRecord[];
  impactful_challenge_ids: number[];
  created_at: number;
  locked_at: number;
  evaluated_at: number;
  resolved_at: number;
  finalized_at: number;
}

export interface CandidateNote {
  id: number;
  case_id: number;
  author: string;
  note_text: string;
  source_urls: string[];
  submitted_at: number;
}

export interface ChallengeData {
  id: number;
  case_id: number;
  challenger: string;
  reason: string;
  source_urls: string[];
  submitted_at: number;
}

export type TxStep =
  | 'idle'
  | 'awaiting_signature'
  | 'submitted'
  | 'finalizing'
  | 'finalized'
  | 'reconciling'
  | 'readback_pending'
  | 'reconciled'
  | 'execution_error'
  | 'error';

export interface TxProgress {
  step: TxStep;
  title: string;
  hash: string | null;
  error: string | null;
  reconcileAttempts?: number;
}

export const STUDIONET_CHAIN_ID = 61999;
export const STUDIONET_RPC = 'https://studio.genlayer.com/api';
export const STUDIONET_EXPLORER = 'https://explorer-studio.genlayer.com';

export function isValidContractAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

export function getExplorerTxUrl(hash: string): string {
  return `${STUDIONET_EXPLORER}/tx/${hash}`;
}

export function getExplorerAddressUrl(address: string): string {
  return `${STUDIONET_EXPLORER}/address/${address}`;
}

export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address || '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatTimestamp(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  return new Date(seconds * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
