import { NextResponse } from 'next/server';
import { consolidatePeriod } from '../../../lib/engine/consolidate';

export async function POST(req) {
  try {
    const { userId, period } = await req.json();

    if (!userId || !period) {
      return NextResponse.json(
        { error: "userId and period are required" },
        { status: 400 }
      );
    }

    const result = await consolidatePeriod(userId, period);

    return NextResponse.json(result);

  } catch (error) {
    console.error("CONSOLIDATE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to consolidate period", details: error.message },
      { status: 500 }
    );
  }
}
