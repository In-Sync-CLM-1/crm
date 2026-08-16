import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";

const empty = {
  first_name: "", last_name: "", email: "", phone: "", company: "", job_title: "",
  address: "", city: "", state: "", country: "", postal_code: "",
  gstin: "", pan: "", billing_address: "", billing_state_code: "", invoice_company_name: "",
};

export function AddClientDialog() {
  const { effectiveOrgId } = useOrgContext();
  const queryClient = useQueryClient();
  const notify = useNotification();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const set = (key: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const addClient = useMutation({
    mutationFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization selected");
      if (!form.first_name.trim()) throw new Error("First name is required");

      const { data: user } = await supabase.auth.getUser();
      const trimmedForm = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v.trim() || null]),
      ) as Record<string, string | null>;
      const { error } = await supabase.from("clients").insert({
        org_id: effectiveOrgId,
        contact_id: null,
        converted_by: user.user?.id,
        converted_at: new Date().toISOString(),
        status: "active",
        ...trimmedForm,
        first_name: form.first_name.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Client added", `${form.first_name} ${form.last_name || ""} has been added`);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setForm(empty);
      setOpen(false);
    },
    onError: (error: Error) => {
      notify.error("Error", error.message || "Failed to add client");
    },
  });

  const field = (key: keyof typeof empty, label: string, required = false) => (
    <div className="space-y-1">
      <Label htmlFor={key}>{label}{required && " *"}</Label>
      <Input id={key} value={form[key]} onChange={set(key)} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Add Client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Client</DialogTitle>
          <DialogDescription>
            Create a client record directly — no need to go through a contact or pipeline first.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          {field("first_name", "First Name", true)}
          {field("last_name", "Last Name")}
          {field("email", "Email")}
          {field("phone", "Phone")}
          {field("company", "Company")}
          {field("job_title", "Job Title")}
          {field("address", "Address")}
          {field("city", "City")}
          {field("state", "State")}
          {field("country", "Country")}
          {field("postal_code", "Postal Code")}
          {field("gstin", "GSTIN")}
          {field("pan", "PAN")}
          {field("billing_state_code", "Billing State Code")}
          <div className="col-span-2">{field("billing_address", "Billing Address")}</div>
          <div className="col-span-2">{field("invoice_company_name", "Invoice Company Name")}</div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => addClient.mutate()} disabled={addClient.isPending}>
            {addClient.isPending ? "Adding..." : "Add Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
