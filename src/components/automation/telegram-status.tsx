"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useAutomationStore } from "@/store/automation-store";

export function TelegramStatus() {
  const telegramConfigured = useAutomationStore((s) => s.telegramConfigured);
  const claudeConfigured = useAutomationStore((s) => s.claudeConfigured);

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-5 space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">Service Status</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  telegramConfigured ? "bg-emerald-400" : "bg-red-400"
                }`}
              />
              <span className="text-sm text-foreground">Telegram Bot</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {telegramConfigured ? "Connected" : "Not configured"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  claudeConfigured ? "bg-emerald-400" : "bg-red-400"
                }`}
              />
              <span className="text-sm text-foreground">Claude API</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {claudeConfigured ? "Connected" : "Not configured"}
            </span>
          </div>
        </div>

        {(!telegramConfigured || !claudeConfigured) && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300">
            <p className="font-medium">Setup needed:</p>
            <ol className="mt-1 list-decimal list-inside space-y-1 text-amber-400/80">
              {!telegramConfigured && (
                <>
                  <li>Open Telegram, search @BotFather, send /newbot</li>
                  <li>Copy token to .env.local as TELEGRAM_BOT_TOKEN</li>
                  <li>Get chat ID from /getUpdates endpoint</li>
                </>
              )}
              {!claudeConfigured && (
                <li>Add ANTHROPIC_API_KEY to .env.local from console.anthropic.com</li>
              )}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
