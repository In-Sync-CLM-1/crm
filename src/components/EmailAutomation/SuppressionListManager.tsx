import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useNotification } from "@/hooks/useNotification";
import { Ban, Plus, Trash2, Upload } from "lucide-react";
import { format } from "date-fns";

export function SuppressionListManager() {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newReason, setNewReason] = useState("manual");
  const [newNotes, setNewNotes] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");

  const { data: suppressionList, isLoading } = useQuery({
    queryKey: ["suppression_list", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("email_suppression_list")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("suppressed_at", { ascending: false });
      if (error) throw error;

      // Fetch profiles for suppressed_by users
      const userIds = [...new Set(data.map((item) => item.suppressed_by).filter(Boolean))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds);

      // Map profiles to suppression list items
      return data.map((item) => {
        const profile = profiles?.find((p) => p.id === item.suppressed_by);
        return {
          ...item,
          suppressed_by_name: profile
            ? `${profile.first_name} ${profile.last_name}`
            : "System",
        };
      });
    },
    enabled: !!effectiveOrgId,
  });

  const addMutation = useMutation({
    mutationFn: async ({
      email,
      reason,
      notes,
    }: {
      email: string;
      reason: string;
      notes: string;
    }) => {
      if (!effectiveOrgId) throw new Error("No org ID");
      const { error } = await supabase.from("email_suppression_list").insert({
        org_id: effectiveOrgId,
        email: email.toLowerCase().trim(),
        reason,
        notes,
        suppressed_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppression_list"] });
      notify.success("Email suppressed", "The email has been added to the suppression list");
      setNewEmail("");
      setNewNotes("");
      setIsAddDialogOpen(false);
    },
    onError: (error: any) => {
      notify.error("Error", error);
    },
  });

  const bulkAddMutation = useMutation({
    mutationFn: async (emails: string[]) => {
      if (!effectiveOrgId) throw new Error("No org ID");
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { error } = await supabase.from("email_suppression_list").insert(
        emails.map((email) => ({
          org_id: effectiveOrgId,
          email: email.toLowerCase().trim(),
          reason: "manual",
          suppressed_by: userId,
        }))
      );
      if (error) throw error;
    },
    onSuccess: (_, emails) => {
      queryClient.invalidateQueries({ queryKey: ["suppression_list"] });
      notify.success("Bulk import complete", `${emails.length} emails added to suppression list`);
      setBulkEmails("");
      setIsAddDialogOpen(false);
    },
    onError: (error: any) => {
      notify.error("Error", error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_suppression_list").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppression_list"] });
      notify.success("Email removed", "The email has been removed from the suppression list");
    },
    onError: (error: any) => {
      notify.error("Error", error);
    },
  });

  const handleAddEmail = () => {
    if (!newEmail.trim()) {
      notify.error("Error", new Error("Please enter an email address"));
      return;
    }

    addMutation.mutate({ email: newEmail, reason: newReason, notes: newNotes });
  };

  const handleBulkAdd = () => {
    const emails = bulkEmails
      .split("\n")
      .map((e) => e.trim())
      .filter((e) => e && e.includes("@"));

    if (emails.length === 0) {
      notify.error("Error", new Error("No valid emails found"));
      return;
    }

    bulkAddMutation.mutate(emails);
  };

  const getReasonBadge = (reason: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      unsubscribed: "default",
      bounced: "destructive",
      complained: "destructive",
      manual: "secondary",
    };
    return <Badge variant={variants[reason] || "default"}>{reason}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="h-5 w-5" />
          Email Suppression List
        </CardTitle>
        <CardDescription>
          Manage emails that should not receive automated messages
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Email
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to Suppression List</DialogTitle>
              <DialogDescription>
                Add one or multiple emails to prevent automated messages
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Single Email</Label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Reason</Label>
                <Select value={newReason} onValueChange={setNewReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                    <SelectItem value="bounced">Bounced</SelectItem>
                    <SelectItem value="complained">Complained</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  placeholder="Additional notes..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                />
              </div>

              <div className="border-t pt-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Bulk Import (One email per line)
                  </Label>
                  <Textarea
                    placeholder="email1@example.com&#10;email2@example.com&#10;email3@example.com"
                    value={bulkEmails}
                    onChange={(e) => setBulkEmails(e.target.value)}
                    rows={6}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                {bulkEmails ? (
                  <Button onClick={handleBulkAdd} disabled={bulkAddMutation.isPending}>
                    {bulkAddMutation.isPending ? "Importing..." : "Bulk Import"}
                  </Button>
                ) : (
                  <Button onClick={handleAddEmail} disabled={addMutation.isPending}>
                    {addMutation.isPending ? "Adding..." : "Add Email"}
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading suppression list...
          </div>
        ) : !suppressionList || suppressionList.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No suppressed emails yet
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Suppressed By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppressionList.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.email}</TableCell>
                    <TableCell>{getReasonBadge(item.reason)}</TableCell>
                    <TableCell>{item.suppressed_by_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(item.suppressed_at), "MMM dd, yyyy")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {item.notes || "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (
                            confirm(
                              `Remove ${item.email} from suppression list? They will be able to receive automated emails again.`
                            )
                          ) {
                            deleteMutation.mutate(item.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
