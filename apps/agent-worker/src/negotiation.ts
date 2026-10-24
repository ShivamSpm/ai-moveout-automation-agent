// Selling rules for one item: the price drops as the sell-by deadline gets close,
// offers are answered without ever going below the seller's minimum, and when
// several buyers are interested they're ranked by price and by whether they can
// pick up before the deadline. Pure functions: no I/O, no model calls.

export interface Listing {
  ask: number; // the seller's asking price
  floor: number; // the seller's minimum; never revealed to buyers
  deadline: string; // sell-by date, YYYY-MM-DD
}

export interface BuyerOffer {
  buyer: string;
  price: number;
  pickupDate: string; // YYYY-MM-DD
}

const DAY = 86_400_000;
const DROP_WINDOW_DAYS = 14; // start lowering the price this many days before the deadline

const round5 = (n: number) => Math.round(n / 5) * 5;
const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** Asking price today: full price until the drop window, then linear toward the floor. */
export function currentAsk(listing: Listing, today: string): number {
  const left = days(today, listing.deadline);
  if (left >= DROP_WINDOW_DAYS) return listing.ask;
  if (left <= 0) return listing.floor;
  const share = left / DROP_WINDOW_DAYS;
  return Math.max(listing.floor, round5(listing.floor + (listing.ask - listing.floor) * share));
}

export type OfferOutcome =
  | { kind: "accept"; price: number; reply: string }
  | { kind: "counter"; price: number; reply: string };

/**
 * Answer one buyer offer. `lastCounter` is the agent's previous counter in this
 * conversation, if any. Accepted deals still need the seller's approval.
 */
export function respondToOffer(
  listing: Listing,
  offer: number,
  lastCounter: number | null,
  today: string,
): OfferOutcome {
  const target = lastCounter ?? currentAsk(listing, today);

  if (offer >= target) {
    return { kind: "accept", price: offer, reply: `$${offer} works. I'll confirm with the seller and send pickup details.` };
  }
  if (offer < listing.floor) {
    const counter = Math.min(target, round5(listing.floor + (target - listing.floor) * 0.5));
    return { kind: "counter", price: counter, reply: `That's lower than the seller can go. Could you do $${counter}?` };
  }
  const counter = round5((offer + target) / 2);
  if (counter - offer <= 10) {
    return { kind: "accept", price: offer, reply: `You've got it at $${offer}. Sending it to the seller for a final OK.` };
  }
  return { kind: "counter", price: counter, reply: `Thanks for the offer. Can you meet me at $${counter}?` };
}

export interface RankedOffer extends BuyerOffer {
  eligible: boolean;
  reason: string;
}

/**
 * Rank offers: ones below the minimum or picking up after the deadline are not
 * eligible; the rest sort by price, then by earlier pickup.
 */
export function rankBuyers(listing: Listing, offers: BuyerOffer[]): RankedOffer[] {
  const ranked = offers.map((o): RankedOffer => {
    if (o.price < listing.floor) return { ...o, eligible: false, reason: "below your minimum" };
    if (days(o.pickupDate, listing.deadline) < 0) return { ...o, eligible: false, reason: "pickup is after your deadline" };
    return { ...o, eligible: true, reason: `$${o.price}, picks up ${days(o.pickupDate, listing.deadline)} days before the deadline` };
  });
  return ranked.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      b.price - a.price ||
      Date.parse(a.pickupDate) - Date.parse(b.pickupDate),
  );
}

/** Pull a dollar amount out of a buyer's message, e.g. "would you take $120?". */
export function parseOffer(message: string): number | null {
  const match = message.replace(/,/g, "").match(/\$?\s*(\d{1,5})(?:\.\d{2})?/);
  return match ? Number(match[1]) : null;
}
