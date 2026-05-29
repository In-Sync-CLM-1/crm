import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, PhoneCall } from "lucide-react";
import { useNotification } from "@/hooks/useNotification";

interface BulkAICallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedContactIds: string[];
  onLaunched?: (batchId: string) => void;
}

interface CallScript {
  id: string;
  name: string;
  objective: string;
  is_active: boolean;
}

export function BulkAICallDialog({ open, onOpenChange, selectedContactIds, onLaunched }: BulkAICallDialogProps) {
  const [scripts, setScripts] = useState<CallScript[]>([]);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [scriptId, setScriptId] = useState<string>("");
  const [launching, setLaunching] = useState(false);
  const { notify } = useNotification();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingScripts(true);
      const { data, error } = await (supabase as any)
        .from("mkt_call_scripts")
        .select("id, name, objective, is_active")
        .eq("is_active", true)
        .order("name");
      if (cancelled) return;
      if (error) {
        notify({ title: "Could not load scripts", description: error.message, variant: "destructive" });
      } else {
        setScripts(data ?? []);
      }
      setLoadingScripts(false);
    })();
    return () => { cancelled = true; };
  }, [open, notify]);

  const launch = async () => {
    if (!scriptId) {
      notify({ title: "Pick a script first", variant: "destructive" });
      return;
    }
    setLaunching(true);
    try {
      const { data, error } = await supabase.functions.invoke("mkt-bolna-bulk-call", {
        body: { contact_ids: selectedContactIds, script_id: scriptId },
      });
      if (error) throw new Error(error.message);
      const result = data as { ok?: boolean; batch_id?: string; total_queued?: number; error?: string };
      if (!result?.ok) throw new Error(result?.error ?? "Launch failed");
      notify({
        title: "Calls launched",
        description: `Queued ${result.total_queued} call${result.total_queued === 1 ? "" : "s"}. They will dial one at a time.`,
      });
      onLaunched?.(result.batch_id ?? "");
      onOpenChange(false);
      setScriptId("");
    } catch (err) {
      notify({
        title: "Launch failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLaunching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4" />
            Start AI Calls
          </DialogTitle>
          <DialogDescription>
            Bolna will call {selectedContactIds.length} contact{selectedContactIds.length === 1 ? "" : "s"} one
            at a time using the script you choose. Calls dial from your Exotel landline. The next call only
            starts once the current one ends, so you can monitor and stop a batch mid-way if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Label htmlFor="script">Script</Label>
          {loadingScripts ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading scripts...
            </div>
          ) : scripts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active call scripts. Create one in Templates → Call Scripts first.
            </p>
          ) : (
            <Select value={scriptId} onValueChange={setScriptId}>
              <SelectTrigger id="script">
                <SelectValue placeholder="Pick a script" />
              </SelectTrigger>
              <SelectContent>
                {scripts.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex flex-col">
                      <span>{s.name}</span>
                      <span className="text-[10px] text-muted-foreground">{s.objective}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={launching}>
            Cancel
          </Button>
          <Button onClick={launch} disabled={launching || !scriptId || scripts.length === 0}>
            {launching && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Launch {selectedContactIds.length} call{selectedContactIds.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
