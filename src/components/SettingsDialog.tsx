import { memo } from "react";
import {
  Settings as SettingsIcon,
  Key,
  Cpu,
  ChevronRight,
  RefreshCcw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Settings } from "@/core/workspace/hooks/useWorkspaceSettings";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
}

export const SettingsDialog = memo(function SettingsDialog({
  open,
  onOpenChange,
  settings,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] overflow-hidden border-border/40 bg-background/95 backdrop-blur-xl animate-scale-in">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <SettingsIcon className="h-5 w-5 text-primary" />
            Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="models" className="mt-4">
          <TabsList className="grid w-full grid-cols-3 bg-muted/30">
            <TabsTrigger
              value="models"
              className="data-[state=active]:bg-background"
            >
              Models
            </TabsTrigger>
            <TabsTrigger
              value="general"
              className="data-[state=active]:bg-background"
            >
              General
            </TabsTrigger>
            <TabsTrigger
              value="usage"
              className="data-[state=active]:bg-background"
            >
              Usage
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="models"
            className="mt-4 space-y-6 animate-fade-in-up"
          >
            <div className="space-y-4 animate-fade-in-down mb-6">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <Key className="h-3 w-3" />
                  OpenRouter API Key
                </label>
                <Input
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={settings.openRouterKey}
                  onChange={(e) => settings.setOpenRouterKey(e.target.value)}
                  className="bg-muted/20 border-border/40 focus:ring-primary/20"
                />
                <p className="text-[10px] text-muted-foreground">
                  Your key is stored locally in your browser's localStorage.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  OpenRouter Models (comma-separated)
                </label>
                <Input
                  placeholder="z-ai/glm-4.5-air:free, meta-llama/llama-3-8b-instruct:free"
                  value={settings.openRouterModel}
                  onChange={(e) => settings.setOpenRouterModel(e.target.value)}
                  className="bg-muted/20 border-border/40"
                />
              </div>
            </div>

            <div className="w-full border-t border-border/40 my-4" />

            <div className="space-y-4 animate-fade-in-down">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <Cpu className="h-3 w-3" />
                  Ollama Endpoint
                </label>
                <Input
                  placeholder="http://localhost:11434"
                  value={settings.ollamaEndpoint}
                  onChange={(e) => settings.setOllamaEndpoint(e.target.value)}
                  className="bg-muted/20 border-border/40"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Ollama Models (comma-separated)
                </label>
                <Input
                  placeholder="llama3.2, qwen2.5-coder:7b"
                  value={settings.ollamaModel}
                  onChange={(e) => settings.setOllamaModel(e.target.value)}
                  className="bg-muted/20 border-border/40"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="general"
            className="mt-4 space-y-6 animate-fade-in-up"
          >
            <div className="flex items-center justify-between p-4 rounded-lg border border-border/40 bg-muted/10 hover-lift">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">System Reasoning</div>
                <div className="text-xs text-muted-foreground">
                  Show detailed thinking process from models
                </div>
              </div>
              <Button
                variant={settings.thinking ? "default" : "outline"}
                size="sm"
                onClick={() => settings.setThinking(!settings.thinking)}
              >
                {settings.thinking ? "Enabled" : "Disabled"}
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border border-border/40 bg-muted/10 hover-lift">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Permission Mode</div>
                <div className="text-xs text-muted-foreground">
                  Global model execution policy
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  const modes = [
                    "plan",
                    "default",
                    "acceptEdits",
                    "dontAsk",
                    "bypassPermissions",
                  ];
                  const idx = modes.indexOf(settings.permissionMode);
                  settings.setPermissionMode(modes[(idx + 1) % modes.length]);
                }}
              >
                {settings.permissionMode}
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent
            value="usage"
            className="mt-4 space-y-6 animate-fade-in-up"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-border/40 bg-muted/10">
                  <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                    Lifetime Tokens
                  </div>
                  <div className="text-2xl font-bold font-mono">
                    {settings.cumulativeTokens.toLocaleString()}
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-border/40 bg-muted/10">
                  <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                    Estimated Cost
                  </div>
                  <div className="text-2xl font-bold font-mono text-primary">
                    ${settings.cumulativeCost.toFixed(4)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border border-border/40 bg-muted/10">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Reset Statistics</div>
                  <div className="text-xs text-muted-foreground">
                    Clear all usage tracking history
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    if (
                      confirm(
                        "Are you sure you want to reset all usage statistics?",
                      )
                    ) {
                      settings.resetUsage();
                    }
                  }}
                >
                  <RefreshCcw className="h-3 w-3 mr-2" />
                  Reset
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground text-center px-4">
                Usage estimates vary by provider. Ollama (local) usually has $0
                cost but high token throughput.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 flex justify-end">
          <Button
            onClick={() => onOpenChange(false)}
            className="px-8 shadow-lg shadow-primary/20 hover-lift"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});
