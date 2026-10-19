// The economy of the village: what each NPC sells, how many they have
// (stock, restocked every morning), prices that change with the season and
// with world events, NPCs buying from each other and NPCs buying from the
// player.

import { COINS, MAX_ITEMS_PER_GIFT, itemKey } from "./PlayerState.js";
import { isFood, seasonalPriceFactor } from "./seasons.js";
import { findWare, priceFor } from "./shop.js";

export const RESTOCK_HOUR = 6;
// Hours when villagers buy from each other
export const TRADE_HOURS = [10, 15];
const STOCK_RANGE = [3, 8];
// Price change of a market event (prices up / down) and how long it lasts
const MARKET_FACTORS = { up: 1.4, down: 0.7 };
const MARKET_EVENT_MINUTES = 24 * 60;
// Max price (per unit) an NPC pays for something it doesn't sell
const MAX_BUY_PRICE = 15;

const randomInt = ([min, max], random = Math.random) =>
  min + Math.floor(random() * (max - min + 1));

export class Commerce {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    this.stocks = new Map(); // npcId -> Map(itemKey -> quantity)
    this.market = new Map(); // npcId -> { factor, until, reason }
    this.lastRestockDay = 1;
    this.lastTrade = null; // "day:hour" of the last trading between NPCs
    // Sales of each NPC since the morning (orders piling up at work)
    this.orders = new Map();
  }

  wares(npcId) {
    return this.session.npcs.get(npcId)?.data.wares ?? [];
  }

  /** Fills the stock of a new NPC. */
  initStock(npcId, random = Math.random) {
    const stock = new Map();
    this.wares(npcId).forEach(({ item }) =>
      stock.set(itemKey(item), randomInt(STOCK_RANGE, random)),
    );
    this.stocks.set(npcId, stock);
  }

  stockOf(npcId, item) {
    return this.stocks.get(npcId)?.get(itemKey(item)) ?? 0;
  }

  changeStock(npcId, item, delta) {
    if (!this.stocks.has(npcId)) this.stocks.set(npcId, new Map());
    const stock = this.stocks.get(npcId);
    stock.set(itemKey(item), Math.max(0, this.stockOf(npcId, item) + delta));
  }

  marketFactor(npcId) {
    const event = this.market.get(npcId);

    if (!event || event.until <= this.session.clock.totalMinutes) {
      return 1;
    }

    return event.factor;
  }

  /** Season, market events and the last harvest (food). */
  priceFactor(npcId, item) {
    const harvest = isFood(item)
      ? (this.session.villageMap?.foodPriceFactor() ?? 1)
      : 1;

    return (
      seasonalPriceFactor(item, this.session.season) *
      this.marketFactor(npcId) *
      harvest
    );
  }

  /** Price of one unit of `ware` for the player. */
  priceOf(npcId, ware) {
    const base = ware.price * this.priceFactor(npcId, ware.item);

    return priceFor(base, this.session.player.getReputation(npcId));
  }

  /** What the NPC sells: price for the player, stock and price trend. */
  waresFor(npcId) {
    return this.wares(npcId).map((ware) => {
      const factor = this.priceFactor(npcId, ware.item);

      return {
        item: ware.item,
        price: this.priceOf(npcId, ware),
        stock: this.stockOf(npcId, ware.item),
        trend: factor > 1.05 ? "up" : factor < 0.95 ? "down" : null,
      };
    });
  }

  /** The NPC sells to the player (`sellItem` tool). */
  sell(npcId, action) {
    const { session } = this;
    const ware = findWare(this.wares(npcId), action.item);

    if (!ware) {
      const wares = this.wares(npcId)
        .map((w) => w.item)
        .join(", ");
      return wares
        ? `You don't sell that. You sell: ${wares}.`
        : "You don't sell anything. Use takeItem and giveItem to trade.";
    }

    const quantity = Math.min(
      Math.max(Math.round(action.quantity) || 1, 1),
      MAX_ITEMS_PER_GIFT,
    );
    const stock = this.stockOf(npcId, ware.item);

    if (stock < quantity) {
      return stock
        ? `You only have ${stock} ${ware.item} left. Tell the traveler.`
        : `You sold all your ${ware.item}; you get more tomorrow morning. Tell the traveler.`;
    }

    const price = this.priceOf(npcId, ware) * quantity;

    if (!session.player.removeItem(COINS, price)) {
      const coins = session.player.items.find((item) => item.name === COINS);
      return `The traveler doesn't have enough coins: it costs ${price} moedas and they have ${coins?.quantity ?? 0}. Tell them.`;
    }

    session.player.addItem(ware.item, quantity);
    this.changeStock(npcId, ware.item, -quantity);
    this.addOrder(npcId, quantity);
    Object.assign(action, {
      item: ware.item,
      quantity,
      price,
      result: `The traveler paid ${price} moedas and has the item now.`,
    });
    session.notify(
      `Você comprou ${quantity} ${ware.item} por ${price} moedas`,
      "item",
    );
    session.emitPlayerState();
    return null;
  }

  /** The NPC buys something the player has (`buyItem` tool). */
  buy(npcId, action) {
    const { session } = this;
    const quantity = Math.min(
      Math.max(Math.round(action.quantity) || 1, 1),
      MAX_ITEMS_PER_GIFT,
    );

    if (!action.item || !session.player.hasItem(action.item, quantity)) {
      return "The traveler doesn't have that. Tell them.";
    }

    if (itemKey(action.item) === itemKey(COINS)) {
      return "You can't buy coins.";
    }

    // An NPC doesn't pay more than its own price for what it sells
    const ware = findWare(this.wares(npcId), action.item);
    const maxPrice = ware ? ware.price : MAX_BUY_PRICE;
    const unitPrice = Math.min(
      Math.max(Math.round(action.price) || 1, 1),
      maxPrice,
    );
    const total = unitPrice * quantity;

    session.player.removeItem(action.item, quantity);
    session.player.addItem(COINS, total);

    if (ware) {
      this.changeStock(npcId, ware.item, quantity);
    }

    Object.assign(action, {
      quantity,
      price: total,
      result: `You bought it and paid ${total} moedas.`,
    });
    session.notify(
      `Você vendeu ${quantity} ${action.item} por ${total} moedas`,
      "item",
    );
    session.emitPlayerState();
    return null;
  }

  /** A world event changed the prices of a villager. */
  applyMarketEvent({ villager, change, reason = "" }) {
    const { session } = this;
    const npc = [...session.npcs.values()].find(
      (candidate) => candidate.data.name === villager,
    );

    if (!npc || !MARKET_FACTORS[change] || !npc.data.wares?.length) {
      return;
    }

    this.market.set(npc.id, {
      factor: MARKET_FACTORS[change],
      until: session.clock.totalMinutes + MARKET_EVENT_MINUTES,
      reason,
    });
    session.notify(
      `Mercado: ${npc.data.name} ${change === "up" ? "aumentou" : "baixou"} os preços${reason ? ` (${reason})` : ""}`,
      "item",
    );
  }

  /** Restock in the morning and villagers buying from each other. */
  async update(day, hour, random = Math.random) {
    if (hour >= RESTOCK_HOUR && day > this.lastRestockDay) {
      this.lastRestockDay = day;
      this.orders.clear();
      for (const npcId of this.session.npcs.keys()) {
        this.initStock(npcId, random);
      }
    }

    const tradeKey = `${day}:${hour}`;

    if (TRADE_HOURS.includes(hour) && this.lastTrade !== tradeKey) {
      this.lastTrade = tradeKey;
      await this.tradeBetweenVillagers(random);
    }
  }

  addOrder(npcId, quantity) {
    this.orders.set(npcId, (this.orders.get(npcId) ?? 0) + quantity);
  }

  async tradeBetweenVillagers(random = Math.random) {
    const { session } = this;
    const villagers = [...session.npcs.values()];
    const sellers = villagers.filter((npc) =>
      npc.data.wares?.some((ware) => this.stockOf(npc.id, ware.item) > 0),
    );

    if (sellers.length === 0) return;

    const trades = 1 + Math.floor(random() * 2);

    for (let i = 0; i < trades; i++) {
      const seller = sellers[Math.floor(random() * sellers.length)];
      const buyers = villagers.filter((npc) => npc !== seller);
      if (buyers.length === 0) return;

      const buyer = buyers[Math.floor(random() * buyers.length)];
      const ware = seller.data.wares.find(
        (candidate) => this.stockOf(seller.id, candidate.item) > 0,
      );
      if (!ware) continue;

      this.changeStock(seller.id, ware.item, -1);
      this.addOrder(seller.id, 1);
      await Promise.all([
        session.remember(
          buyer.id,
          `[village life] I bought ${ware.item} from ${seller.data.name}.`,
        ),
        session.remember(
          seller.id,
          `[village life] I sold ${ware.item} to ${buyer.data.name}.`,
        ),
      ]);
    }
  }

  toState() {
    return {
      stocks: [...this.stocks].map(([npcId, stock]) => [npcId, [...stock]]),
      market: [...this.market],
      lastRestockDay: this.lastRestockDay,
      lastTrade: this.lastTrade,
      orders: [...this.orders],
    };
  }

  restoreState(state) {
    this.stocks = new Map(
      state.stocks.map(([npcId, stock]) => [npcId, new Map(stock)]),
    );
    this.market = new Map(state.market);
    this.lastRestockDay = state.lastRestockDay;
    this.lastTrade = state.lastTrade;
    this.orders = new Map(state.orders ?? []);
  }
}
