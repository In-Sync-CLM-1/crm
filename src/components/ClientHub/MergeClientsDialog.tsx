import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Merge, FileText, Receipt } from "lucide-react";
import { useNotification } from "@/hooks/useNotification";

interface Client {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
}

interface MergeClientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  onMergeComplete: () => void;
}

export function MergeClientsDialog({ open, onOpenChange, clients, onMergeComplete }: MergeClientsDialogProps) {
  const [primaryClientId, setPrimaryClientId] = useState<string>(clients[0]?.id || "");
  const notify = useNotification();

  const { data: relatedCounts } = useQuery({
    queryKey: ["client-related-counts", clients.map(c => c.id)],
    queryFn: async () => {
      const counts: Record<string, { documents: number; invoices: number }> = {};
      
      for (const client of clients) {
        const [docsResult, invoicesResult] = await Promise.all([
          supabase
            .from("client_documents")
            .select("id", { count: "exact", head: true })
            .eq("client_id", client.id),
          supabase
            .from("client_invoices")
            .select("id", { count: "exact", head: true })
            .eq("client_id", client.id),
        ]);

        counts[client.id] = {
          documents: docsResult.count || 0,
          invoices: invoicesResult.count || 0,
        };
      }

      return counts;
    },
    enabled: open && clients.length > 0,
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      const duplicateIds = clients.filter(c => c.id !== primaryClientId).map(c => c.id);

      // Transfer documents
      const { error: docsError } = await supabase
        .from("client_documents")
        .update({ client_id: primaryClientId })
        .in("client_id", duplicateIds);

      if (docsError) throw docsError;

      // Transfer invoices
      const { error: invoicesError } = await supabase
        .from("client_invoices")
        .update({ client_id: primaryClientId })
        .in("client_id", duplicateIds);

      if (invoicesError) throw invoicesError;

      // Transfer alternate contacts
      const { error: contactsError } = await supabase
        .from("client_alternate_contacts")
        .update({ client_id: primaryClientId })
        .in("client_id", duplicateIds);

      if (contactsError) throw contactsError;

      // Delete duplicate clients
      const { error: deleteError } = await supabase
        .from("clients")
        .delete()
        .in("id", duplicateIds);

      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      notify.success("Clients merged", "All records have been transferred to the primary client");
      onMergeComplete();
      onOpenChange(false);
    },
    onError: () => {
      notify.error("Error", "Failed to merge clients");
    },
  });

  const totalTransfer = clients
    .filter(c => c.id !== primaryClientId)
    .reduce((acc, c) => {
      const counts = relatedCounts?.[c.id] || { documents: 0, invoices: 0 };
      return {
        documents: acc.documents + counts.documents,
        invoices: acc.invoices + counts.invoices,
      };
    }, { documents: 0, invoices: 0 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge Clients
          </DialogTitle>
          <DialogDescription>
            Select the primary client to keep. All documents and invoices from other clients will be transferred.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={primaryClientId} onValueChange={setPrimaryClientId}>
            {clients.map((client) => {
              const counts = relatedCounts?.[client.id] || { documents: 0, invoices: 0 };
              return (
                <Card
                  key={client.id}
                  className={`cursor-pointer transition-colors ${
                    primaryClientId === client.id ? "border-primary bg-primary/5" : ""
                  }`}
                  onClick={() => setPrimaryClientId(client.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value={client.id} id={client.id} className="mt-1" />
                      <Label htmlFor={client.id} className="flex-1 cursor-pointer">
                        <p className="font-medium">
                          {client.first_name} {client.last_name}
                          {primaryClientId === client.id && (
                            <Badge className="ml-2" variant="default">Primary</Badge>
                          )}
                        </p>
                        <div className="text-sm text-muted-foreground mt-1">
                          {client.email && <span>{client.email}</span>}
                          {client.phone && <span> • {client.phone}</span>}
                        </div>
                        {client.company && (
                          <p className="text-sm text-muted-foreground">{client.company}</p>
                        )}
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {counts.documents} docs
                          </span>
                          <span className="flex items-center gap-1">
                            <Receipt className="h-3 w-3" />
                            {counts.invoices} invoices
                          </span>
                        </div>
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </RadioGroup>

          {(totalTransfer.documents > 0 || totalTransfer.invoices > 0) && (
            <div className="bg-muted p-3 rounded-lg text-sm">
              <p className="font-medium">What will be transferred:</p>
              <ul className="list-disc list-inside text-muted-foreground mt-1">
                {totalTransfer.documents > 0 && (
                  <li>{totalTransfer.documents} document(s)</li>
                )}
                {totalTransfer.invoices > 0 && (
                  <li>{totalTransfer.invoices} invoice(s)</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mergeMutation.mutate()}
            disabled={mergeMutation.isPending}
          >
            {mergeMutation.isPending ? "Merging..." : "Merge Clients"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
