import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, User, Mail, Phone, Briefcase, Trash2, Edit, X } from "lucide-react";
import { useNotification } from "@/hooks/useNotification";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";

interface AlternateContact {
  id: string;
  name: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

interface ClientAlternateContactsProps {
  clientId: string;
  orgId: string;
}

export function ClientAlternateContacts({ clientId, orgId }: ClientAlternateContactsProps) {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<AlternateContact | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    designation: "",
    email: "",
    phone: "",
    notes: "",
  });

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["client-alternate-contacts", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_alternate_contacts")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as AlternateContact[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from("client_alternate_contacts")
        .insert({
          client_id: clientId,
          org_id: orgId,
          name: data.name,
          designation: data.designation || null,
          email: data.email || null,
          phone: data.phone || null,
          notes: data.notes || null,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Contact added", "Alternate contact has been added");
      queryClient.invalidateQueries({ queryKey: ["client-alternate-contacts", clientId] });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: () => {
      notify.error("Error", "Failed to add contact");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("client_alternate_contacts")
        .update({
          name: data.name,
          designation: data.designation || null,
          email: data.email || null,
          phone: data.phone || null,
          notes: data.notes || null,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Contact updated", "Alternate contact has been updated");
      queryClient.invalidateQueries({ queryKey: ["client-alternate-contacts", clientId] });
      resetForm();
      setEditingContact(null);
      setIsDialogOpen(false);
    },
    onError: () => {
      notify.error("Error", "Failed to update contact");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_alternate_contacts")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Contact deleted", "Alternate contact has been removed");
      queryClient.invalidateQueries({ queryKey: ["client-alternate-contacts", clientId] });
    },
    onError: () => {
      notify.error("Error", "Failed to delete contact");
    },
  });

  const resetForm = () => {
    setFormData({ name: "", designation: "", email: "", phone: "", notes: "" });
    setEditingContact(null);
  };

  const openEditDialog = (contact: AlternateContact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      designation: contact.designation || "",
      email: contact.email || "",
      phone: contact.phone || "",
      notes: contact.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      notify.error("Error", "Name is required");
      return;
    }

    if (editingContact) {
      updateMutation.mutate({ id: editingContact.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading contacts..." />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Alternate Contacts</CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingContact ? "Edit Contact" : "Add Alternate Contact"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contact name"
                />
              </div>
              <div>
                <Label htmlFor="designation">Designation</Label>
                <Input
                  id="designation"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  placeholder="e.g., Finance Manager"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 XXXXX XXXXX"
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes about this contact"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingContact ? "Update" : "Add"} Contact
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!contacts?.length ? (
          <EmptyState
            icon={<User className="h-12 w-12" />}
            title="No alternate contacts"
            message="Add alternate contacts for this client"
          />
        ) : (
          <div className="space-y-4">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{contact.name}</span>
                    </div>
                    {contact.designation && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Briefcase className="h-3 w-3" />
                        {contact.designation}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-4 text-sm">
                      {contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <Mail className="h-3 w-3" />
                          {contact.email}
                        </a>
                      )}
                      {contact.phone && (
                        <a
                          href={`tel:${contact.phone}`}
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <Phone className="h-3 w-3" />
                          {contact.phone}
                        </a>
                      )}
                    </div>
                    {contact.notes && (
                      <p className="text-sm text-muted-foreground mt-2">{contact.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(contact)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(contact.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}