export type Cell = string | number | boolean | null;
export type Mode = 'guided' | 'open' | 'discovery';
export type Station = 'desk' | 'board' | 'archive';
export type QueryOperation = 'profile' | 'group_count' | 'find_duplicates' | 'trace_links';
export type AiStatus = 'available' | 'offline' | 'disabled';

export interface Column {
  id: string;
  name: string;
  kind: 'text' | 'number' | 'boolean' | 'date' | 'mixed';
}
export interface DataRow {
  id: string;
  original: Record<string, Cell>;
  values: Record<string, Cell>;
  excluded: boolean;
}
export interface DataTable {
  id: string;
  name: string;
  columns: Column[];
  rows: DataRow[];
}
export interface IdentityMapping {
  tableId: string;
  columnId: string;
}
export interface JoinMapping {
  parentTableId: string;
  parentColumnId: string;
  childTableId: string;
  childColumnId: string;
}
export interface EvidenceRef {
  tableId: string;
  rowIds: string[];
  columnIds: string[];
  explanation: string;
}

export type DataAction =
  | { type: 'excludeRows'; tableId: string; rowIds: string[] }
  | {
      type: 'canonicalizeAliases';
      tableId: string;
      columnId: string;
      rowIds: string[];
      value: string;
    }
  | { type: 'repairLinks'; tableId: string; columnId: string; rowIds: string[]; value: Cell }
  | { type: 'reviewCase'; caseId: string; outcome: 'keep' | 'defer' };

export interface CaseFile {
  id: string;
  kind: 'duplicate' | 'alias' | 'relationship';
  title: string;
  description: string;
  evidence: EvidenceRef[];
  action?: DataAction;
  alternatives?: DataAction[];
  status: 'open' | 'resolved' | 'kept' | 'deferred';
  basedOnRevision: number;
}
export interface Change {
  tableId: string;
  rowId: string;
  columnId?: string;
  kind: 'cell' | 'excluded';
  before: Cell;
  after: Cell;
}
export interface Finding {
  id: string;
  title: string;
  description: string;
  evidence: EvidenceRef[];
  createdAt: string;
}
export interface HistoryEntry {
  id: string;
  label: string;
  createdAt: string;
  changes: Change[];
  revision: number;
  undone: boolean;
  kind: 'resolve' | 'undo';
}
export interface InvestigationStats {
  totalRows: number;
  activeRows: number;
  changedRows: number;
  openCases: number;
  resolvedCases: number;
  savedFindings: number;
}
export interface Investigation {
  id: string;
  title: string;
  revision: number;
  tables: DataTable[];
  identity?: IdentityMapping;
  join?: JoinMapping;
  cases: CaseFile[];
  findings: Finding[];
  history: HistoryEntry[];
  stats: InvestigationStats;
  aiStatus: AiStatus;
}
export interface ImportResult {
  id: string;
  tables: DataTable[];
  warnings: string[];
}
export interface CreateInvestigationRequest {
  importId: string;
  tableIds: string[];
  title?: string;
  identity?: IdentityMapping;
  join?: JoinMapping;
}
export interface PreviewRequest {
  expectedRevision: number;
  action: DataAction;
}
export interface PreviewResponse {
  revision: number;
  action: DataAction;
  effectHash: string;
  changes: Change[];
  summary: string;
  warnings: string[];
}
export interface ResolveRequest extends PreviewRequest {
  actionId: string;
  effectHash: string;
  caseId?: string;
}
export interface ResolveResponse {
  investigation: Investigation;
  actionId: string;
}
export interface UndoRequest {
  expectedRevision: number;
  actionId: string;
  latestActionId: string;
}
export interface QueryRequest {
  mode: 'open' | 'discovery';
  prompt?: string;
  operation?: QueryOperation;
  tableId?: string;
  columnId?: string;
}
export interface QueryResult {
  answer: string;
  evidence: EvidenceRef[];
  groups?: { label: string; count: number }[];
  finding?: Finding;
  aiStatus: AiStatus;
}
export interface AppConfig {
  authMode: 'local' | 'session' | 'firebase';
  persistence: 'file' | 'postgres' | 'firestore';
  aiEnabled: boolean;
  firebaseConfig?: { apiKey: string; authDomain: string; projectId: string; appId: string };
}
export interface ApiError {
  error: { code: string; message: string };
}

export const LIMITS = {
  maxFiles: 2,
  maxTables: 2,
  maxRows: 500,
  maxColumns: 20,
  maxFileBytes: 2 * 1024 * 1024,
  maxParsedBytes: 4 * 1024 * 1024,
  maxCellLength: 2000,
} as const;

// Routes: GET /api/config; POST /api/imports (multipart field files) or POST /api/demo {name:'market'|'club'} -> ImportResult.
// POST /api/investigations -> Investigation; GET /api/investigations/:id -> Investigation.
// POST /api/investigations/:id/preview -> PreviewResponse; POST .../resolve -> ResolveResponse.
// POST .../undo -> ResolveResponse; POST .../query -> QueryResult; POST .../findings {findingId} -> Investigation.
// GET .../export?format=csv|xlsx|report&tableId=... -> file; GET /api/health -> {ok:true}.
