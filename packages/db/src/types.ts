import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

export type { Database } from "./database.types";
export type { Json } from "./database.types";

/**
 * The client every repository takes. It is always user-scoped: built from the
 * request's session cookies in `apps/web/src/lib/supabase/server.ts`, so the
 * user's JWT reaches Postgres and row-level security is the authorization
 * (docs/ARCHITECTURE.md §4). There is no service-role path in the app.
 */
export type MomentumClient = SupabaseClient<Database>;

export type Tables = Database["public"]["Tables"];
export type Row<T extends keyof Tables> = Tables[T]["Row"];
export type InsertRow<T extends keyof Tables> = Tables[T]["Insert"];
export type UpdateRow<T extends keyof Tables> = Tables[T]["Update"];
export type Enums = Database["public"]["Enums"];
