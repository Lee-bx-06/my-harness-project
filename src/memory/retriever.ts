import type { MemoryRecord, MemoryStore, MemoryType } from './store';

export interface MemoryRetrievalOptions {
  limit?: number;
  type?: MemoryType;
}

export type RetrievedMemory = MemoryRecord & {
  relevance: number;
};

const UNIQUE_KEYWORD_WEIGHT = 10;

export class MemoryRetriever {
  constructor(private readonly store: MemoryStore) {}

  async retrieve(query: string, options: MemoryRetrievalOptions = {}): Promise<RetrievedMemory[]> {
    return this.search(query, options);
  }

  async search(query: string, options: MemoryRetrievalOptions = {}): Promise<RetrievedMemory[]> {
    const keywords = tokenize(query);
    if (keywords.length === 0) {
      return [];
    }

    const memories = await this.loadCandidates(options);
    const ranked = rankMemories(memories, keywords);

    return applyLimit(ranked, options.limit);
  }

  private loadCandidates(options: MemoryRetrievalOptions): Promise<MemoryRecord[]> {
    return this.store.list(options.type ? { type: options.type } : {});
  }
}

function rankMemories(memories: MemoryRecord[], keywords: string[]): RetrievedMemory[] {
  return memories
    .map((memory) => ({
      ...memory,
      relevance: scoreMemory(memory, keywords),
    }))
    .filter((memory) => memory.relevance > 0)
    .sort((left, right) => right.relevance - left.relevance);
}

function scoreMemory(memory: MemoryRecord, keywords: string[]): number {
  const contentTokens = tokenize(memory.content);
  const uniqueMatches = keywords.filter((keyword) => contentTokens.includes(keyword)).length;

  const occurrenceScore = keywords.reduce((score, keyword) => {
    const occurrences = contentTokens.filter((token) => token === keyword).length;
    return score + occurrences;
  }, 0);

  return uniqueMatches * UNIQUE_KEYWORD_WEIGHT + occurrenceScore;
}

function applyLimit(memories: RetrievedMemory[], limit?: number): RetrievedMemory[] {
  return typeof limit === 'number' ? memories.slice(0, limit) : memories;
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9:_-]+/i)
    .map((token) => token.trim())
    .map(stemToken)
    .filter((token) => token.length > 0);
}

function stemToken(token: string): string {
  if (token.endsWith('ence')) {
    return `${token.slice(0, -4)}ent`;
  }

  if (token.endsWith('s') && token.length > 3) {
    return token.slice(0, -1);
  }

  return token;
}
