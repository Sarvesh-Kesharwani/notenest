import { auth } from "@/auth";

export const runtime = "nodejs";

type SupabaseProjectRow = {
  id: string;
  owner_key: string;
  project_key: string;
  name: string | null;
};

type SupabaseConfigRow = {
  project_id: string;
  config: unknown;
  updated_at: string;
};

function getSupabaseEnv() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function headers(key: string, extra?: HeadersInit): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function restUrl(baseUrl: string, table: string, query = "") {
  return `${baseUrl}/rest/v1/${table}${query ? `?${query}` : ""}`;
}

function eq(value: string) {
  return `eq.${value}`;
}

async function getOwnerKey() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  return email ? `google:${email}` : null;
}

async function findProject(
  env: { url: string; key: string },
  ownerKey: string,
  projectKey: string
) {
  const query = new URLSearchParams({
    select: "id,owner_key,project_key,name",
    owner_key: eq(ownerKey),
    project_key: eq(projectKey),
    limit: "1",
  });

  const response = await fetch(restUrl(env.url, "nodenest_projects", query.toString()), {
    headers: headers(env.key),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Supabase project lookup failed (${response.status})`);
  }

  const rows = (await response.json()) as SupabaseProjectRow[];
  return rows[0] ?? null;
}

async function readProjectConfig(env: { url: string; key: string }, projectId: string) {
  const query = new URLSearchParams({
    select: "project_id,config,updated_at",
    project_id: eq(projectId),
    limit: "1",
  });
  const response = await fetch(
    restUrl(env.url, "nodenest_revision_configs", query.toString()),
    {
      headers: headers(env.key),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase config lookup failed (${response.status})`);
  }

  const rows = (await response.json()) as SupabaseConfigRow[];
  return rows[0]?.config ?? null;
}

async function upsertProject(
  env: { url: string; key: string },
  ownerKey: string,
  projectKey: string,
  name: string
) {
  const query = new URLSearchParams({ on_conflict: "owner_key,project_key" });
  const response = await fetch(restUrl(env.url, "nodenest_projects", query.toString()), {
    method: "POST",
    headers: headers(env.key, {
      Prefer: "resolution=merge-duplicates,return=representation",
    }),
    body: JSON.stringify({
      owner_key: ownerKey,
      project_key: projectKey,
      name,
    }),
  });

  if (!response.ok) {
    throw new Error(`Supabase project upsert failed (${response.status})`);
  }

  const rows = (await response.json()) as SupabaseProjectRow[];
  const row = rows[0];
  if (!row?.id) throw new Error("Supabase project upsert returned no id");
  return row;
}

export async function GET(req: Request) {
  const ownerKey = await getOwnerKey();
  if (!ownerKey) {
    return Response.json({ ok: false, skipped: true, reason: "signed-out" }, { status: 401 });
  }

  const env = getSupabaseEnv();
  if (!env) {
    return Response.json({ ok: false, skipped: true, reason: "missing-supabase-env" });
  }

  const { searchParams } = new URL(req.url);
  const projectKey = searchParams.get("projectKey")?.trim();
  if (!projectKey) {
    return Response.json({ error: "Missing projectKey" }, { status: 400 });
  }

  try {
    const project = await findProject(env, ownerKey, projectKey);
    if (!project) return Response.json({ ok: true, config: null });
    return Response.json({ ok: true, project, config: await readProjectConfig(env, project.id) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}

export async function PUT(req: Request) {
  const ownerKey = await getOwnerKey();
  if (!ownerKey) {
    return Response.json({ ok: false, skipped: true, reason: "signed-out" }, { status: 401 });
  }

  const env = getSupabaseEnv();
  if (!env) {
    return Response.json({ ok: false, skipped: true, reason: "missing-supabase-env" });
  }

  const body = (await req.json()) as {
    projectKey?: string;
    projectName?: string;
    config?: unknown;
  };

  const projectKey = body.projectKey?.trim();
  if (!projectKey || !body.config) {
    return Response.json({ error: "Missing projectKey or config" }, { status: 400 });
  }

  try {
    const project = await upsertProject(
      env,
      ownerKey,
      projectKey,
      body.projectName?.trim() || projectKey
    );
    const existingConfig = await readProjectConfig(env, project.id);
    const nextConfig = mergeConfig(existingConfig, body.config);
    const query = new URLSearchParams({ on_conflict: "project_id" });
    const response = await fetch(
      restUrl(env.url, "nodenest_revision_configs", query.toString()),
      {
        method: "POST",
        headers: headers(env.key, {
          Prefer: "resolution=merge-duplicates,return=representation",
        }),
        body: JSON.stringify({
          project_id: project.id,
          config: nextConfig,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Supabase config upsert failed (${response.status})`);
    }

    return Response.json({ ok: true, project });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}

function mergeConfig(existing: unknown, incoming: unknown) {
  if (isPlainObject(existing) && isPlainObject(incoming)) {
    return { ...existing, ...incoming };
  }
  return incoming;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
