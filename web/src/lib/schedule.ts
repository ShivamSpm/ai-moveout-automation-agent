// Turns the move-out date plus the rules pulled from the lease into a dated
// plan, worked backward from the day you hand back the keys. Dates are
// computed here in code, never by the model.

export type Lane = "landlord" | "cleaning" | "moving" | "selling" | "admin";

export interface LeaseRules {
  noticeDays: number;
  noticeClause: string;
  carpetCleaning?: { clause: string; riskUsd: number };
  wallRepair?: { clause: string; riskUsd: number };
  generalCleaning: { clause: string; riskUsd: number };
  keyReturn: { clause: string; riskUsd: number };
}

export interface Task {
  id: string;
  lane: Lane;
  title: string;
  detail: string;
  due: Date;
  source: string; // lease clause or statute the task comes from
  riskUsd?: number; // what the landlord could deduct if this is skipped
  riskLabel?: string; // short name for the deposit breakdown
  agent?: string; // what the agent does for you
}

const DAY = 86_400_000;

export function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY);
}

export function subtractBusinessDays(date: Date, days: number): Date {
  let result = date;
  let left = days;
  while (left > 0) {
    result = addDays(result, -1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) left--;
  }
  return result;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY);
}

export function buildPlan(moveOut: Date, rules: LeaseRules): Task[] {
  const d = (offset: number) => addDays(moveOut, offset);

  const tasks: Task[] = [
    {
      id: "notice",
      lane: "landlord",
      title: "Send written notice to vacate",
      detail: `Your lease requires ${rules.noticeDays} days' written notice.`,
      due: d(-rules.noticeDays),
      source: rules.noticeClause,
      agent: "Drafts the notice and emails it to your landlord",
    },
    {
      id: "request-inspection",
      lane: "landlord",
      title: "Request the pre-move-out inspection",
      detail:
        "The landlord must list in writing what they'd deduct for, so you can fix it first.",
      due: d(-21),
      source: "CA Civil Code §1950.5(f)",
      agent: "Emails the request and sends a calendar invite",
    },
    {
      id: "inspection",
      lane: "landlord",
      title: "Pre-move-out inspection",
      detail: "No earlier than two weeks before move-out. Leaves time to fix the list.",
      due: d(-14),
      source: "CA Civil Code §1950.5(f)",
    },
    {
      id: "forwarding",
      lane: "landlord",
      title: "Give landlord your forwarding address",
      detail: "Where the deposit and itemized statement get mailed.",
      due: d(-7),
      source: "CA Civil Code §1950.5(g)",
      agent: "Includes it in the next landlord email",
    },
    {
      id: "walkthrough",
      lane: "landlord",
      title: "Final walkthrough + return keys and fobs",
      detail: "Take timestamped photos of every room before you leave.",
      due: d(0),
      source: rules.keyReturn.clause,
      riskUsd: rules.keyReturn.riskUsd,
      riskLabel: "Keys + fobs",
    },
    {
      id: "deposit-due",
      lane: "landlord",
      title: "Deposit back, or itemized deductions",
      detail: "If it's late, the agent drafts a demand letter.",
      due: d(21),
      source: "CA Civil Code §1950.5(g)",
    },
    {
      id: "book-cleaners",
      lane: "cleaning",
      title: "Book move-out cleaners",
      detail: "Scheduled after packing, before the walkthrough.",
      due: d(-10),
      source: rules.generalCleaning.clause,
      agent: "Requests 3 quotes and books the best one",
    },
    {
      id: "deep-clean",
      lane: "cleaning",
      title: "Deep clean: kitchen, bath, inside appliances",
      detail: "Return the unit in move-in condition, less normal wear and tear.",
      due: d(-2),
      source: rules.generalCleaning.clause,
      riskUsd: rules.generalCleaning.riskUsd,
      riskLabel: "Deep clean",
    },
    {
      id: "mover-quotes",
      lane: "moving",
      title: "Get mover or truck quotes",
      detail: "Sized from the items you're keeping.",
      due: d(-28),
      source: "Agent plan",
      agent: "Emails 3 movers with your inventory",
    },
    {
      id: "book-movers",
      lane: "moving",
      title: "Book movers + building elevator",
      detail: "Many SF buildings require the movers' certificate of insurance.",
      due: d(-21),
      source: "Building rules",
    },
    {
      id: "sfmta-sign",
      lane: "moving",
      title: "Apply for SFMTA temporary no-parking signs",
      detail: "Apply 5+ business days ahead; signs go up 72 hours before.",
      due: subtractBusinessDays(moveOut, 7),
      source: "SFMTA temporary signage rules",
      agent: "Prefills the application for you to submit",
    },
    {
      id: "list-items",
      lane: "selling",
      title: "List everything you're not keeping",
      detail: "Furniture sells for less every day closer to move-out.",
      due: d(-30),
      source: "Agent plan",
      agent: "Writes listings from your photos and negotiates with buyers",
    },
    {
      id: "price-drop",
      lane: "selling",
      title: "Price drop on unsold items",
      detail: "Never below the minimum you set.",
      due: d(-14),
      source: "Agent plan",
    },
    {
      id: "giveaway",
      lane: "selling",
      title: "Give away what's left",
      detail: "Free posts for Buy Nothing and Nextdoor.",
      due: d(-5),
      source: "Agent plan",
    },
    {
      id: "usps",
      lane: "admin",
      title: "USPS change of address",
      detail: "Takes about a week to kick in.",
      due: d(-7),
      source: "Checklist",
    },
    {
      id: "utilities",
      lane: "admin",
      title: "Stop PG&E and internet; return the router",
      detail: "Schedule the stop for move-out day.",
      due: d(0),
      source: "Checklist",
    },
    {
      id: "dmv",
      lane: "admin",
      title: "Update your address with the DMV",
      detail: "California requires it within 10 days of moving.",
      due: d(10),
      source: "CA Vehicle Code §14600",
    },
  ];

  if (rules.wallRepair) {
    tasks.push({
      id: "wall-repair",
      lane: "cleaning",
      title: "Patch nail holes + touch-up paint",
      detail: "Do it after the inspection so you only fix what's on the list.",
      due: d(-10),
      source: rules.wallRepair.clause,
      riskUsd: rules.wallRepair.riskUsd,
      riskLabel: "Wall repair",
      agent: "Gets a handyman quote vs. the landlord's likely charge",
    });
  }

  if (rules.carpetCleaning) {
    tasks.push({
      id: "carpet",
      lane: "cleaning",
      title: "Professional carpet cleaning (keep the receipt)",
      detail: "Your lease requires a professional service, not DIY.",
      due: d(-2),
      source: rules.carpetCleaning.clause,
      riskUsd: rules.carpetCleaning.riskUsd,
      riskLabel: "Carpets",
      agent: "Books it with the cleaners as one visit",
    });
  }

  return tasks.sort((a, b) => a.due.getTime() - b.due.getTime());
}

export type Urgency = "overdue" | "this-week" | "upcoming" | "after";

export function urgency(task: Task, today: Date, moveOut: Date): Urgency {
  const days = daysBetween(today, task.due);
  if (days < 0) return "overdue";
  if (task.due.getTime() > moveOut.getTime()) return "after";
  if (days <= 7) return "this-week";
  return "upcoming";
}
