export * from './schemas.js';

export interface FileProvider {
  readonly mode: 'demo' | 'drive';
  listCandidates(): Promise<import('./schemas.js').FileMeta[]>;
  trash(ids: string[]): Promise<import('./schemas.js').TrashResult[]>;
  restore(ids: string[]): Promise<import('./schemas.js').RestoreResult[]>;
}
