import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

export type { Database } from "./database.types";
export type { Json } from "./database.types";

/** Always user-scoped so row-level security is the authorization; there is no service-role path. */
export type MomentumClient = SupabaseClient<Database>;

export type Tables = Database["public"]["Tables"];
export type Row<T extends keyof Tables> = Tables[T]["Row"];
export type InsertRow<T extends keyof Tables> = Tables[T]["Insert"];
export type UpdateRow<T extends keyof Tables> = Tables[T]["Update"];
export type Enums = Database["public"]["Enums"];
