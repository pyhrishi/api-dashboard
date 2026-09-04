/**
 * Shared JSON/value types — use these instead of `any` for dynamic payloads
 * (API bodies, log request/response data, mock responses, redaction inputs).
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** A loosely-shaped object whose values we haven't narrowed yet. Prefer this over `any`. */
export type UnknownRecord = Record<string, unknown>;

export const isJsonObject = (v: unknown): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
