import assert from "node:assert/strict";
import { test } from "node:test";
import { currentAsk, parseOffer, rankBuyers, respondToOffer, type Listing } from "./negotiation.ts";

const sofa: Listing = { ask: 240, floor: 160, deadline: "2026-11-25" };

test("asking price holds until the drop window, then falls toward the floor", () => {
  assert.equal(currentAsk(sofa, "2026-11-01"), 240);
  assert.equal(currentAsk(sofa, "2026-11-18"), 200);
  assert.equal(currentAsk(sofa, "2026-11-25"), 160);
  assert.equal(currentAsk(sofa, "2026-11-30"), 160);
});

test("never accepts or counters below the floor", () => {
  const low = respondToOffer(sofa, 100, null, "2026-11-01");
  assert.equal(low.kind, "counter");
  assert.ok(low.price >= sofa.floor);
  assert.doesNotMatch(low.reply, /160/); // the minimum stays private
});

test("accepts at or above the current ask, and closes small gaps", () => {
  assert.equal(respondToOffer(sofa, 240, null, "2026-11-01").kind, "accept");
  assert.deepEqual(respondToOffer(sofa, 195, 205, "2026-11-01"), {
    kind: "accept",
    price: 195,
    reply: "You've got it at $195. Sending it to the seller for a final OK.",
  });
});

test("ranks by eligibility, then price, then earlier pickup", () => {
  const ranked = rankBuyers(sofa, [
    { buyer: "late", price: 230, pickupDate: "2026-11-28" },
    { buyer: "low", price: 120, pickupDate: "2026-11-10" },
    { buyer: "b", price: 190, pickupDate: "2026-11-20" },
    { buyer: "a", price: 190, pickupDate: "2026-11-12" },
  ]);
  assert.deepEqual(ranked.map((r) => r.buyer), ["a", "b", "late", "low"]);
  assert.equal(ranked[2].reason, "pickup is after your deadline");
});

test("reads dollar amounts out of messages", () => {
  assert.equal(parseOffer("would you take $1,200?"), 1200);
  assert.equal(parseOffer("how about 180"), 180);
  assert.equal(parseOffer("is it still available?"), null);
});
