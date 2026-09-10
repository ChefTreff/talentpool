"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Session-Inhalte und Präsentationen. Die Datei selbst geht direkt aus dem
 * Browser in den Bucket (die Storage-Policy prüft den Pfad); hier wird sie nur
 * noch angemeldet — so läuft kein 100-MB-Upload durch den Server.
 */
const PATH = "/speaker/session";

export type SessionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[speaker/session] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireArea("speaker", PATH);
  return createSupabaseServerClient();
}

function refresh() {
  revalidatePath(PATH);
  revalidatePath("/speaker");
}

export async function submitSessionContent(
  sessionId: string,
  data: { title: string; description: string; topics: string[]; language: string; notes: string },
): Promise<SessionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("submit_session_content", {
    p_session_id: sessionId,
    p_data: {
      title: data.title,
      description: data.description,
      topics: data.topics,
      language: data.language || null,
      notes: data.notes,
    },
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

/** Nach dem Upload: Version, Verspätung und Technik-Check kommen aus der RPC. */
export async function registerAsset(input: {
  profileId: string;
  kind: string;
  storagePath: string;
  filename: string;
  mime: string | null;
  sizeBytes: number | null;
  sessionId: string | null;
}): Promise<SessionResult<{ id: string; version: number; late: boolean }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("register_speaker_asset", {
    p_profile_id: input.profileId,
    p_kind: input.kind,
    p_storage_path: input.storagePath,
    p_filename: input.filename,
    p_mime: input.mime,
    p_size_bytes: input.sizeBytes,
    p_session_id: input.sessionId,
  });
  if (error) return fail(error);
  refresh();
  const result = (data ?? {}) as { id?: string; version?: number; late?: boolean };
  return {
    ok: true,
    data: { id: result.id ?? "", version: result.version ?? 1, late: result.late === true },
  };
}

/** Slid@Home. Die RPC lässt nur den Speaker selbst und nur mit Consent durch. */
export async function setSlidesRelease(
  assetId: string,
  release: boolean,
): Promise<SessionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_slides_release", {
    p_asset_id: assetId,
    p_release: release,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}
