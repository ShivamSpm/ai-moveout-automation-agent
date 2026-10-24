// Demo move used until Supabase is wired up. "Today" is pinned so the demo
// looks the same on every run.

import { buildPlan, utcDate, type LeaseRules } from "./schedule";

export const TODAY = utcDate(2026, 10, 24);

export const move = {
  id: "demo",
  tenant: "Vincent",
  address: "1847 Guerrero St, Apt 3",
  neighborhood: "Mission",
  moveOut: utcDate(2026, 11, 30),
  deposit: 3200,
  landlord: {
    name: "Dana Ruiz",
    company: "Bayline Property Management",
    email: "dana@bayline-pm.example",
  },
  agentEmail: "agent+demo@vacate.example",
};

export const leaseRules: LeaseRules = {
  noticeDays: 30,
  noticeClause: "Lease §4.2",
  carpetCleaning: { clause: "Lease §12.3", riskUsd: 350 },
  wallRepair: { clause: "Lease §12.1", riskUsd: 240 },
  generalCleaning: { clause: "Move-out Guide p.2", riskUsd: 450 },
  keyReturn: { clause: "Lease §15.1", riskUsd: 150 },
};

export const plan = buildPlan(move.moveOut, leaseRules);

export const doneAtStart = ["mover-quotes"];

export interface Approval {
  id: string;
  lane: "landlord" | "cleaning" | "moving" | "selling";
  title: string;
  to: string;
  preview: string;
  cost?: string;
}

export const approvals: Approval[] = [
  {
    id: "a1",
    lane: "landlord",
    title: "Send notice to vacate + request inspection",
    to: "dana@bayline-pm.example",
    preview:
      "Hi Dana, this is written notice that I'll be vacating 1847 Guerrero St, Apt 3 on November 30, 2026 (per §4.2). I'd also like to request a pre-move-out inspection under Civil Code §1950.5(f). Could we do Monday, Nov 16 at 10am? A calendar invite is attached.",
  },
  {
    id: "a2",
    lane: "cleaning",
    title: "Book Fogline Cleaning, Nov 27, 9am",
    to: "bookings@fogline.example",
    preview:
      "Best of 3 quotes: move-out deep clean + professional carpet cleaning, one visit. Receipt will be saved for §12.3.",
    cost: "$420",
  },
  {
    id: "a3",
    lane: "selling",
    title: "Accept $190 for the Kivik sofa",
    to: "Buyer: Sam K.",
    preview:
      "Asked $240, your minimum is $160. Sam offered $170, the agent countered at $205, Sam came back at $190. Pickup Sat 11am, buyer brings 2 people.",
    cost: "+$190",
  },
];

export interface ActivityEntry {
  at: string;
  lane: "landlord" | "cleaning" | "moving" | "selling";
  text: string;
}

export const activity: ActivityEntry[] = [
  { at: "9:42 AM", lane: "selling", text: "Sam K. countered $190 on the Kivik sofa. Waiting on your OK." },
  { at: "9:15 AM", lane: "cleaning", text: "3 cleaning quotes in: $420, $465, $510. Picked Fogline." },
  { at: "8:58 AM", lane: "landlord", text: "Read “Bayline Move-out Guide.pdf”: 9 requirements, 2 new." },
  { at: "8:57 AM", lane: "landlord", text: "Dana replied with the move-out guide." },
  { at: "Yesterday", lane: "moving", text: "Mover quotes back. 2-person crew, 4 hrs, $640." },
  { at: "Yesterday", lane: "landlord", text: "Read your lease: 30-day notice, carpet clause, key fee." },
];

export interface Item {
  id: string;
  name: string;
  category: string;
  condition: string;
  ask: number;
  floor: number;
  status: "listed" | "pending" | "sold" | "giveaway";
  blurb: string;
  hue: string;
  image?: string; // generated with Nano Banana into public/art
  where: string[];
}

export const items: Item[] = [
  {
    id: "kivik-sofa",
    name: "IKEA Kivik 3-seat sofa",
    category: "Furniture",
    condition: "Good, washable covers",
    ask: 240,
    floor: 160,
    status: "pending",
    blurb:
      "Gray Kivik with chaise. Covers just washed, no pets, no smoke. Fits through a standard SF doorway when the chaise is detached.",
    hue: "#ff8fb1",
    image: "/art/item-kivik-sofa.jpg",
    where: ["Vacate page", "Marketplace", "Craigslist"],
  },
  {
    id: "standing-desk",
    name: "Electric standing desk, 55\"",
    category: "Furniture",
    condition: "Like new",
    ask: 280,
    floor: 210,
    status: "listed",
    blurb: "Dual motor, memory presets, walnut-look top. Takes 10 minutes to break down.",
    hue: "#ffc83d",
    image: "/art/item-standing-desk.jpg",
    where: ["Vacate page", "Marketplace"],
  },
  {
    id: "monitor",
    name: "27\" 4K monitor",
    category: "Electronics",
    condition: "Excellent",
    ask: 190,
    floor: 150,
    status: "listed",
    blurb: "USB-C with 65W charging. Original box and cable.",
    hue: "#7590ff",
    image: "/art/item-monitor.jpg",
    where: ["Vacate page", "eBay"],
  },
  {
    id: "stand-mixer",
    name: "KitchenAid stand mixer",
    category: "Kitchen",
    condition: "Good",
    ask: 160,
    floor: 120,
    status: "sold",
    blurb: "Empire red, 5 qt, with dough hook, whisk and paddle.",
    hue: "#ff7a59",
    image: "/art/item-stand-mixer.jpg",
    where: ["Vacate page", "Marketplace"],
  },
  {
    id: "bike",
    name: "City bike, medium frame",
    category: "Sports",
    condition: "Fair, new tubes",
    ask: 150,
    floor: 90,
    status: "listed",
    blurb: "7-speed, fenders and rack. Handles the Valencia bike lane fine, less so 20th St hill.",
    hue: "#c8f53c",
    image: "/art/item-bike.jpg",
    where: ["Vacate page", "Craigslist"],
  },
  {
    id: "plants",
    name: "Pothos + snake plant",
    category: "Home",
    condition: "Thriving",
    ask: 0,
    floor: 0,
    status: "giveaway",
    blurb: "Free to a good home. Pots included.",
    hue: "#5fd39a",
    image: "/art/item-plants.jpg",
    where: ["Buy Nothing"],
  },
];

export function getItem(id: string): Item | undefined {
  return items.find((item) => item.id === id);
}
