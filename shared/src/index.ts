/**
 * @mobileshop/shared — contracts shared by the backend API and the frontend.
 *
 * Scope rules (13_ §1.4): this package holds DTO contracts, Zod schemas, enums,
 * permission keys, money/date helpers, error codes and safe constants ONLY.
 * It must never import from `backend/`, `frontend/` or `database/`, and must
 * never contain business logic that belongs in a backend domain service or any
 * value that is a secret.
 */

export * from "./money";
export * from "./imei";
export * from "./phone";
export * from "./enums";
export * from "./permissions";
export * from "./errors";
export * from "./datetime";
export * from "./fee-rules";
export * from "./constants";
export * from "./auth";
export * from "./catalog";
export * from "./inventory";
export * from "./purchasing";
export * from "./dashboard";
export * from "./pricing";
export * from "./customers";
export * from "./sales";
export * from "./demand";
export * from "./returns";
