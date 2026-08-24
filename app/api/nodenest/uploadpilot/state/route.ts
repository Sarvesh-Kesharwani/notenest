export const runtime = "nodejs";

function baseUrl() {
  return (process.env.UPLOADPILOT_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
}

export async function GET() {
  try {
    const response = await fetch(`${baseUrl()}/api/state`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    return Response.json(data, { status: response.status });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "UploadPilot is not reachable",
      },
      { status: 502 }
    );
  }
}
