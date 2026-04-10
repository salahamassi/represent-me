import { NextResponse } from "next/server";
import { getScheduleConfigs } from "@/lib/db";
import * as telegram from "@/lib/telegram";
import { isConfigured as isClaudeConfigured } from "@/services/claude-service";

export async function GET() {
  const schedules = getScheduleConfigs();
  return NextResponse.json({
    schedules,
    telegram: {
      configured: telegram.isConfigured(),
    },
    claude: {
      configured: isClaudeConfigured(),
    },
  });
}
