import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Merge, Trash2, X, Users } from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { MergeClientsDialog } from "./MergeClientsDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

interface Client {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
}

interface DuplicateGroup {
  matchType: string;
  matchValue: string;
  clients: Client[];
}

interface DuplicateClientsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DuplicateClientsManager({ open, onOpenChange }: DuplicateClientsManagerProps) {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const queryClient = useQueryClient();
  const [mergeGroup, setMergeGroup] = useState<DuplicateGroup | null>(null);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [dismissedGroups, setDismissedGroups] = useState<Set<string>>(new Set());

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients-for-duplicates", effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, email, phone, company")
        .eq("org_id", effectiveOrgId!);

      if (error) throw error;
      return data as Client[];
    },
    enabled: !!effectiveOrgId && open,
  });

  const duplicateGroups = useMemo(() => {
    if (!clients) return [];

    const groups: DuplicateGroup[] = [];
    const seenClients = new Set<string>();

    // Group by email
    const emailGroups = new Map<string, Client[]>();
    clients.forEach(client => {
      if (client.email) {
        const email = client.email.toLowerCase();
        if (!emailGroups.has(email)) {
          emailGroups.set(email, []);
        }
        emailGroups.get(email)!.push(client);
      }
    });

    emailGroups.forEach((groupClients, email) => {
      if (groupClients.length > 1) {
        const groupKey = `email:${email}`;
        if (!dismissedGroups.has(groupKey)) {
          groups.push({
            matchType: "Email",
            matchValue: email,
            clients: groupClients,
          });
          groupClients.forEach(c => seenClients.add(c.id));
        }
      }
    });

    // Group by phone
    const phoneGroups = new Map<string, Client[]>();
    clients.forEach(client => {
      if (client.phone && !seenClients.has(client.id)) {
        const phone = client.phone.replace(/\D/g, '');
        if (phone.length >= 10) {
          if (!phoneGroups.has(phone)) {
            phoneGroups.set(phone, []);
          }
          phoneGroups.get(phone)!.push(client);
        }
      }
    });

    phoneGroups.forEach((groupClients, phone) => {
      if (groupClients.length > 1) {
        const groupKey = `phone:${phone}`;
        if (!dismissedGroups.has(groupKey)) {
          groups.push({
            matchType: "Phone",
            matchValue: phone,
            clients: groupClients,
          });
          groupClients.forEach(c => seenClients.add(c.id));
        }
      }
    });

    // Group by name + company
    const nameCompanyGroups = new Map<string, Client[]>();
    clients.forEach(client => {
      if (!seenClients.has(client.id)) {
        const key = `${client.first_name.toLowerCase()}-${(client.last_name || '').toLowerCase()}-${(client.company || '').toLowerCase()}`;
        if (key !== '--') {
          if (!nameCompanyGroups.has(key)) {
            nameCompanyGroups.set(key, []);
          }
          nameCompanyGroups.get(key)!.push(client);
        }
      }
    });

    nameCompanyGroups.forEach((groupClients, key) => {
      if (groupClients.length > 1) {
        const groupKey = `name:${key}`;
        if (!dismissedGroups.has(groupKey)) {
          groups.push({
            matchType: "Name + Company",
            matchValue: key.replace(/-/g, ' '),
            clients: groupClients,
          });
        }
      }
    });

    return groups;
  }, [clients, dismissedGroups]);

  const deleteMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", clientId);

      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Client deleted", "The duplicate client has been removed");
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients-for-duplicates"] });
      setDeleteClient(null);
    },
    onError: () => {
      notify.error("Error", "Failed to delete client");
    },
  });

  const handleDismissGroup = (group: DuplicateGroup) => {
    const groupKey = `${group.matchType.toLowerCase()}:${group.matchValue}`;
    setDismissedGroups(prev => new Set([...prev, groupKey]));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Duplicate Clients Manager
            </DialogTitle>
            <DialogDescription>
              Review and manage duplicate client records. Merge or delete duplicates to keep your data clean.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[60vh] pr-4">
            {isLoading ? (
              <LoadingState message="Scanning for duplicates..." />
            ) : duplicateGroups.length === 0 ? (
              <EmptyState
                title="No Duplicates Found"
                message="Your client list is clean! No duplicate records were detected."
              />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                  <p className="text-sm">
                    Found {duplicateGroups.length} potential duplicate group(s). Review each group and take action.
                  </p>
                </div>

                {duplicateGroups.map((group, idx) => (
                  <Card key={idx}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{group.matchType}</Badge>
                          <span className="text-muted-foreground font-normal">
                            {group.clients.length} matching clients
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDismissGroup(group)}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Dismiss
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {group.clients.map((client) => (
                        <div
                          key={client.id}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        >
                          <div>
                            <p className="font-medium">
                              {client.first_name} {client.last_name}
                            </p>
                            <div className="text-sm text-muted-foreground space-x-3">
                              {client.email && <span>{client.email}</span>}
                              {client.phone && <span>{client.phone}</span>}
                              {client.company && <span>• {client.company}</span>}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteClient(client)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setMergeGroup(group)}
                      >
                        <Merge className="h-4 w-4 mr-2" />
                        Merge These Clients
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {mergeGroup && (
        <MergeClientsDialog
          open={!!mergeGroup}
          onOpenChange={(open) => !open && setMergeGroup(null)}
          clients={mergeGroup.clients}
          onMergeComplete={() => {
            setMergeGroup(null);
            queryClient.invalidateQueries({ queryKey: ["clients"] });
            queryClient.invalidateQueries({ queryKey: ["clients-for-duplicates"] });
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteClient}
        onOpenChange={(open) => !open && setDeleteClient(null)}
        title="Delete Client"
        description={`Are you sure you want to delete ${deleteClient?.first_name} ${deleteClient?.last_name}? This action cannot be undone.`}
        confirmText="Delete"
        onConfirm={() => deleteClient && deleteMutation.mutate(deleteClient.id)}
        variant="destructive"
      />
    </>
  );
}
