import { IAaveFetcher, IFetcher } from "../interfaces/IFetcher";
import axios from "axios";
import { GraphParams, GraphReturnType, User } from "./CompoundGraphFetcher";

export default class AaveGraphFetcher implements IFetcher {
  static QUERY = `query MyQuery($first: Int, $skip: Int, $lastId: String) {
    accounts(
      where: {positionCount_gt: 0, openPositionCount_gt: 0, id_gt: $lastId}
      orderBy: id
      orderDirection: asc
      skip: $skip
      first: $first
    ) {
      _eMode
      id
      borrowCount
      depositCount
      openPositionCount
      positionCount
      positions(where: {balance_gt: "0"}) {
        balance
        isCollateral
        isIsolated
        side
        principal
        id
        type
        borrowCount
        depositCount
        market {
          name
          id
          isActive
          maximumLTV
          relation
        }
      }
    }
  }`;

  static ALT_QUERY = `query MyQuery ($first: Int, $skip: Int, $lastId: String) {
    users(
      orderBy: id
      orderDirection: asc
      skip: $skip
      first: $first
      where: { id_gt: $lastId, borrowHistory_: {amount_gt: "0"}}
    ) {
      id
      borrowedReservesCount
      lifetimeRewards
      unclaimedRewards
      borrowHistory {
        amount
        id
        borrowRate
        txHash
      }
    }
  }`;

  static MARKET_QUERY = `query NewQuery {
    markets(where: {isActive: true}) {
      id
      isActive
      name
    }
  }`;

  static MARKET_QUERY_ALT = `query MyQuery {
    pools {
      id
      pool
      poolConfigurator
    }
  }
  `;

  public batchSize: number;

  constructor(public graphUrl: string, batchSize?: number) {
    if (!batchSize) {
      const fromEnv = process.env.BATCH_SIZE;
      if (fromEnv && !isNaN(parseInt(fromEnv))) {
        batchSize = parseInt(fromEnv);
      }
      batchSize = 1000;
    }
    this.batchSize = batchSize;
  }

  async fetchUsers(lastId: string = ""): Promise<{
    hasMore: boolean;
    users: any[];
    lastId: string;
    markets: string[];
  }> {
    try {
      const result = await axios
        .post<
          GraphParams,
          GraphReturnType<{ accounts: Omit<User, "isBorrower">[] }>
        >(this.graphUrl, {
          query: AaveGraphFetcher.QUERY,
          variables: { lastId, first: this.batchSize },
        })
        .then((r) => {
          if (r.data.errors) throw Error(JSON.stringify(r.data.errors));
          if (!r.data.data) throw Error("Unknown graph error");
          return r.data.data;
        });
      const newLastId =
        result.accounts.length === 0
          ? ""
          : result.accounts[result.accounts.length - 1].id;

      // console.log(result.accounts[0]);
      return {
        hasMore: result.accounts.length === this.batchSize,
        users: result.accounts.map((u) => u.id),
        markets: [],
        lastId: newLastId,
      };
    } catch {
      return this.fetchUsersAlt(lastId);
    }
  }

  async fetchUsersAlt(lastId: string = ""): Promise<{
    hasMore: boolean;
    users: any[];
    lastId: string;
    markets: string[];
  }> {
    const result = await axios
      .post<
        GraphParams,
        GraphReturnType<{ users: Omit<User, "isBorrower">[] }>
      >(this.graphUrl, {
        query: AaveGraphFetcher.ALT_QUERY,
        variables: { lastId, first: this.batchSize },
      })
      .then((r) => {
        if (r.data.errors) throw Error(JSON.stringify(r.data.errors));
        if (!r.data.data) throw Error("Unknown graph error");
        return r.data.data;
      });
    const newLastId =
      result.users.length === 0 ? "" : result.users[result.users.length - 1].id;

    return {
      hasMore: result.users.length === this.batchSize,
      users: result.users.map((u) => u.id),
      markets: [],
      lastId: newLastId,
    };
  }

  async fetchMarkets(): Promise<{
    markets: string[];
  }> {
    try {
      const result = await axios
        .post<GraphParams, GraphReturnType<{ markets: any[] }>>(this.graphUrl, {
          query: AaveGraphFetcher.MARKET_QUERY,
        })
        .then((r) => {
          if (r.data.errors) throw Error(JSON.stringify(r.data.errors));
          if (!r.data.data) throw Error("Unknown graph error");
          return r.data.data;
        });

      // console.log(result.accounts[0]);
      return {
        markets: result.markets.map((u) => u.id),
      };
    } catch {
      return this.fetchMarketsAlt();
    }
  }

  async fetchMarketsAlt(): Promise<{
    markets: string[];
  }> {
    const result = await axios
      .post<GraphParams, GraphReturnType<{ pools: any[] }>>(this.graphUrl, {
        query: AaveGraphFetcher.MARKET_QUERY_ALT,
      })
      .then((r) => {
        if (r.data.errors) throw Error(JSON.stringify(r.data.errors));
        if (!r.data.data) throw Error("Unknown graph error");
        return r.data.data;
      });

    return {
      markets: result.pools.map((u) => u.id),
    };
  }
}
