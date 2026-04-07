import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/jobs/[jobId]
 * Get the status of an analysis job
 * NOTE: MVP version - in production would query Bull queue
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    // For MVP: Return a placeholder response
    // In production, this would query Bull/Redis for actual job status
    return NextResponse.json({
      jobId,
      status: "active",
      progress: 50,
      message: "Analyzing games... 50% complete",
      data: {
        analyzed: 5,
        total: 10,
      },
    });
  } catch (error) {
    console.error("Error fetching job status:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch job status",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
