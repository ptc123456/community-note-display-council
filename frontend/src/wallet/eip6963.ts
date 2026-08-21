export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

export interface EIP6963AnnounceProviderEvent extends CustomEvent {
  type: 'eip6963:announceProvider';
  detail: EIP6963ProviderDetail;
}

// Strictly allow only verified known RDNS identifiers
export const ALLOWED_RDNS = new Set<string>([
  'io.metamask',
  'io.rabby',
  'com.okex.wallet',
]);

export function isSupportedProvider(detail: EIP6963ProviderDetail): boolean {
  if (!detail || !detail.info || !detail.provider) return false;
  const rdns = (detail.info.rdns || '').trim().toLowerCase();
  return ALLOWED_RDNS.has(rdns);
}

export class EIP6963Store {
  private providers: Map<string, EIP6963ProviderDetail> = new Map();
  private listeners: Set<(providers: EIP6963ProviderDetail[]) => void> = new Set();
  private cleanupHandler: (() => void) | null = null;

  public init(): () => void {
    if (typeof window === 'undefined') return () => {};

    const handleAnnounce = (event: Event) => {
      const customEvent = event as EIP6963AnnounceProviderEvent;
      if (!customEvent.detail || !customEvent.detail.info || !customEvent.detail.provider) return;

      const detail = customEvent.detail;
      if (isSupportedProvider(detail)) {
        // De-duplicate by UUID or RDNS
        this.providers.set(detail.info.uuid || detail.info.rdns, detail);
        this.notify();
      }
    };

    window.addEventListener('eip6963:announceProvider', handleAnnounce);

    // Request provider announcement
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    this.cleanupHandler = () => {
      window.removeEventListener('eip6963:announceProvider', handleAnnounce);
    };

    return this.cleanupHandler;
  }

  public subscribe(listener: (providers: EIP6963ProviderDetail[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getProviders());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getProviders(): EIP6963ProviderDetail[] {
    return Array.from(this.providers.values());
  }

  public clear(): void {
    this.providers.clear();
    this.notify();
  }

  private notify(): void {
    const list = this.getProviders();
    this.listeners.forEach((l) => l(list));
  }
}

export const globalEIP6963Store = new EIP6963Store();
