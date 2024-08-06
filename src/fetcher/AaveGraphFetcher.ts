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

  static MARKET_QUERY = `query NewQuery {
    markets(where: {isActive: true}) {
      id
      isActive
      name
    }
  }`;

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
      markets: result.accounts.map((u) => u.id),
      lastId: newLastId,
    };
  }

  async fetchMarkets(): Promise<{
    markets: string[];
  }> {
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
  }
}
