export interface IFetcher {
  fetchUsers: (lastId?: string) => Promise<{
    hasMore: boolean;
    users: string[];
    lastId: string;
  }>;

  fetchMarkets?: () => Promise<{
    markets: string[];
  }>;
}

export interface IAaveFetcher {
  fetchUsers: (lastId?: string) => Promise<{
    hasMore: boolean;
    users: string[];
    lastId: string;
  }>;
  fetchMarkets: () => Promise<{
    markets: string[];
  }>;
}
