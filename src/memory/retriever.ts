import type { MemoryRecord, MemoryStore, MemoryType } from './store';

export interface MemoryRetrievalOptions {
  limit?: number;
  type?: MemoryType;
}

export type RetrievedMemory = MemoryRecord & {
  relevance: number;
};

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

    const memories = await this.store.list(options.type ? { type: options.type } : {});
    const ranked = memories
      .map((memory) => ({
        ...memory,
        relevance: scoreMemory(memory, keywords),
      }))
      .filter((memory) => memory.relevance > 0)
      .sort((left, right) => right.relevance - left.relevance);

    return typeof options.limit === 'number' ? ranked.slice(0, options.limit) : ranked;
  }
}

function scoreMemory(memory: MemoryRecord, keywords: string[]): number {
  const contentTokens = tokenize(memory.content);
  const uniqueMatches = keywords.filter((keyword) => contentTokens.includes(keyword)).length;

  const occurrenceScore = keywords.reduce((score, keyword) => {
    const occurrences = contentTokens.filter((token) => token === keyword).length;
    return score + occurrences;
  }, 0);

  return uniqueMatches * 10 + occurrenceScore;
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
