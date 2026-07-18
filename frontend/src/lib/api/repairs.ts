export type RepairApiSurface =
  "authorization" | "queue" | "booking" | "workflow" | "notification";

export interface RepairApiGap {
  readonly surface: RepairApiSurface;
  readonly label: string;
  readonly requiredContract: string;
  readonly status: "deferred" | "not_implemented";
  readonly safeBehaviour: string;
}

/**
 * Repairs are deliberately deferred in the backend module map. This registry
 * is the frontend's no-network API boundary until real shared contracts exist.
 */
export const REPAIR_API_GAPS: readonly RepairApiGap[] = [
  {
    surface: "authorization",
    label: "Feature & authorization",
    requiredContract: "Repair feature flag · repair-specific permissions",
    status: "deferred",
    safeBehaviour:
      "The authenticated workflow layout is visible, but no private repair data is requested and no write is authorized.",
  },
  {
    surface: "queue",
    label: "Board, KPIs & detail",
    requiredContract: "GET /repairs · GET /repairs/:id",
    status: "deferred",
    safeBehaviour:
      "No job, customer, IMEI, technician, due date, count or revenue value is inferred.",
  },
  {
    surface: "booking",
    label: "Repair booking",
    requiredContract: "POST /repairs",
    status: "deferred",
    safeBehaviour:
      "Booking fields remain an unsaved layout; no job number or Received card is generated in the browser.",
  },
  {
    surface: "workflow",
    label: "Parts, assignment & stages",
    requiredContract: "Repair parts / technician / transition endpoints",
    status: "not_implemented",
    safeBehaviour:
      "The five-stage timeline is visible, but assignment and stage progression stay disabled and unaudited state is never mutated.",
  },
  {
    surface: "notification",
    label: "Pickup, Finance & notification",
    requiredContract:
      "Repair completion · Finance posting · Notifications adapter",
    status: "not_implemented",
    safeBehaviour:
      "No customer message, charge, revenue posting, warranty link or pickup completion is claimed.",
  },
] as const;

export function repairApiGap(surface: RepairApiSurface): RepairApiGap {
  const gap = REPAIR_API_GAPS.find((entry) => entry.surface === surface);
  if (gap === undefined)
    throw new Error(`Unknown repair API surface: ${surface}`);
  return gap;
}
