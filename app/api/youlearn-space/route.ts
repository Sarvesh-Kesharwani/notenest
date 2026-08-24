export const runtime = "nodejs";

const DEFAULT_SPACE_ID = "c9241bc0721046c8";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const spaceId = searchParams.get("spaceId") || DEFAULT_SPACE_ID;

  try {
    const response = await fetch(
      `https://api.youlearn.ai/space/anonymous/${encodeURIComponent(spaceId)}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 },
      }
    );

    if (!response.ok) {
      return Response.json(
        { error: `YouLearn returned ${response.status}` },
        { status: response.status }
      );
    }

    return Response.json(await response.json());
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch YouLearn space",
      },
      { status: 502 }
    );
  }
}
