// Google Drive App Data folder helpers — stores notenest-state.json privately in user's Drive.
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FILE_NAME = "notenest-state.json";
const SPACE = "appDataFolder";

export interface DriveState {
  editorHTML: string;
  nodes: unknown[];
  updatedAt: string;
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFile(
  accessToken: string,
  name = FILE_NAME,
  parent: string = SPACE
): Promise<string | null> {
  const q = `name='${escapeDriveQueryValue(name)}' and '${escapeDriveQueryValue(parent)}' in parents`;
  const qs = new URLSearchParams({ spaces: SPACE, fields: "files(id)", q });
  const res = await fetch(`${DRIVE_API}/files?${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

async function readFileJson<T>(
  accessToken: string,
  fileId: string
): Promise<T | null> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

async function uploadJsonFile(
  accessToken: string,
  name: string,
  body: string,
  options?: { fileId?: string; parents?: string[] }
): Promise<void> {
  if (options?.fileId) {
    await fetch(`${UPLOAD_API}/files/${options.fileId}?uploadType=media`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body,
    });
    return;
  }

  const metadata = JSON.stringify({
    name,
    parents: options?.parents ?? [SPACE],
  });
  const boundary = "notenest_boundary";
  const multipart = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    body,
    `--${boundary}--`,
  ].join("\r\n");

  await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipart,
  });
}

export async function readDriveState(
  accessToken: string
): Promise<DriveState | null> {
  const id = await findFile(accessToken);
  if (!id) return null;
  return readFileJson<DriveState>(accessToken, id);
}

export async function writeDriveState(
  accessToken: string,
  state: Omit<DriveState, "updatedAt">
): Promise<DriveState> {
  const existingId = await findFile(accessToken);
  const payload: DriveState = {
    editorHTML: state.editorHTML,
    nodes: state.nodes,
    updatedAt: new Date().toISOString(),
  };
  await uploadJsonFile(accessToken, FILE_NAME, JSON.stringify(payload), {
    fileId: existingId ?? undefined,
    parents: [SPACE],
  });
  return payload;
}

export async function deleteDriveState(accessToken: string): Promise<void> {
  const id = await findFile(accessToken);
  if (!id) return;
  await fetch(`${DRIVE_API}/files/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
