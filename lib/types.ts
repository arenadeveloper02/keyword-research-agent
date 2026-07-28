export type Intent = 'commercial' | 'informational';

export type Stage =
  | 'variants'
  | 'search'
  | 'url_scoring'
  | 'semrush'
  | 'analysis'
  | 'scoring'
  | 'validation';

export type StageStatus = 'pending' | 'active' | 'done';

export interface PrimaryKeyword {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  rationale: string | null;
}

export interface SecondaryKeyword {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
}

export interface SourceKeyword {
  keyword: string;
  urlFrequency: number;
  volume: number | null;
  difficulty: number | null;
  compositeScore: number;
}

export interface CompetitorUrl {
  url: string;
  domain: string;
  score: number;
  keywordsFound?: SourceKeyword[];
  status: 'pending' | 'fetching' | 'done' | 'error';
  title?: string | null;
  matchedQueries?: number | null;
  totalQueries?: number | null;
}

export interface SerpResult {
  rank: number | null;
  title: string | null;
  url: string;
  domain: string;
}

export interface ExaResult {
  title: string | null;
  url: string;
  snippet: string | null;
}

export interface NormalizedKeyword {
  keyword: string;
  volume: number | null;
}

export interface ScoredKeyword {
  keyword: string;
  score: number | null;
}

export interface ResultPayload {
  primary: PrimaryKeyword[];
  secondary: SecondaryKeyword[];
  warning?: string | null;
  warningType?: string | null;
}

export interface RunInputs {
  keyword: string;
  intent: Intent;
  client?: string;
}

export interface SavedRunOutput {
  primary: PrimaryKeyword[];
  secondary: SecondaryKeyword[];
  warning?: string | null;
  warningType?: string | null;
  allKeywords?: SourceKeyword[];
  variants?: string[];
  urls?: CompetitorUrl[];
  serpResults?: SerpResult[];
  exaResults?: ExaResult[];
  normalizedKeywords?: NormalizedKeyword[];
  compositeScores?: ScoredKeyword[];
  alignmentScores?: ScoredKeyword[];
}

export interface PdfExportData {
  keyword: string;
  intent: string;
  client: string;
  warning: string | null;
  warningType?: string | null;
  primary: PrimaryKeyword[];
  secondary: SecondaryKeyword[];
  allKeywords: SourceKeyword[];
  variants?: string[];
  urls?: CompetitorUrl[];
  serpResults?: SerpResult[];
  exaResults?: ExaResult[];
  normalizedKeywords?: NormalizedKeyword[];
  compositeScores?: ScoredKeyword[];
  alignmentScores?: ScoredKeyword[];
}
