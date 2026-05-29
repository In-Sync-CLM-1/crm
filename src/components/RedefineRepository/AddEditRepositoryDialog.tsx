import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface AddEditRepositoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record?: any;
  orgId: string;
}

export function AddEditRepositoryDialog({
  open,
  onOpenChange,
  record,
  orgId,
}: AddEditRepositoryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: record?.name || "",
    designation: record?.designation || "",
    department: record?.department || "",
    job_level: record?.job_level || "",
    linkedin_url: record?.linkedin_url || "",
    mobile_number: record?.mobile_number || "",
    mobile_2: record?.mobile_2 || "",
    official_email: record?.official_email || "",
    personal_email: record?.personal_email || "",
    generic_email: record?.generic_email || "",
    industry_type: record?.industry_type || "",
    sub_industry: record?.sub_industry || "",
    company_name: record?.company_name || "",
    address: record?.address || "",
    location: record?.location || "",
    city: record?.city || "",
    state: record?.state || "",
    zone: record?.zone || "",
    tier: record?.tier || "",
    pincode: record?.pincode || "",
    website: record?.website || "",
    turnover: record?.turnover || "",
    employee_size: record?.employee_size || "",
    erp_name: record?.erp_name || "",
    erp_vendor: record?.erp_vendor || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!formData.name) {
        toast.error("Name is required");
        setLoading(false);
        return;
      }

      const recordData = {
        ...formData,
        org_id: orgId,
        created_by: user?.id,
      };

      if (record) {
        // Update existing record
        const { error } = await supabase
          .from("redefine_data_repository")
          .update(recordData)
          .eq("id", record.id);

        if (error) throw error;
        toast.success("Record updated successfully");
      } else {
        // Create new record
        const { error } = await supabase
          .from("redefine_data_repository")
          .insert([recordData]);

        if (error) throw error;
        toast.success("Record added successfully");
      }

      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving record:", error);
      toast.error(error.message || "Failed to save record");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record ? "Edit Record" : "Add New Record"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="personal">Personal Info</TabsTrigger>
              <TabsTrigger value="company">Company Info</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
            </TabsList>

            <TabsContent value="personal" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="designation">Designation</Label>
                  <Input
                    id="designation"
                    value={formData.designation}
                    onChange={(e) => handleChange("designation", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    value={formData.department}
                    onChange={(e) => handleChange("department", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="job_level">Job Level</Label>
                  <Input
                    id="job_level"
                    value={formData.job_level}
                    onChange={(e) => handleChange("job_level", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="mobile_number">Mobile Number</Label>
                  <Input
                    id="mobile_number"
                    value={formData.mobile_number}
                    onChange={(e) => handleChange("mobile_number", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="mobile_2">Mobile 2</Label>
                  <Input
                    id="mobile_2"
                    value={formData.mobile_2}
                    onChange={(e) => handleChange("mobile_2", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="official_email">Official Email</Label>
                  <Input
                    id="official_email"
                    type="email"
                    value={formData.official_email}
                    onChange={(e) => handleChange("official_email", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="personal_email">Personal Email</Label>
                  <Input
                    id="personal_email"
                    type="email"
                    value={formData.personal_email}
                    onChange={(e) => handleChange("personal_email", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="generic_email">Generic Email</Label>
                  <Input
                    id="generic_email"
                    type="email"
                    value={formData.generic_email}
                    onChange={(e) => handleChange("generic_email", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                  <Input
                    id="linkedin_url"
                    value={formData.linkedin_url}
                    onChange={(e) => handleChange("linkedin_url", e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="company" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="company_name">Company Name</Label>
                  <Input
                    id="company_name"
                    value={formData.company_name}
                    onChange={(e) => handleChange("company_name", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="industry_type">Industry Type</Label>
                  <Input
                    id="industry_type"
                    value={formData.industry_type}
                    onChange={(e) => handleChange("industry_type", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sub_industry">Sub Industry</Label>
                  <Input
                    id="sub_industry"
                    value={formData.sub_industry}
                    onChange={(e) => handleChange("sub_industry", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={formData.website}
                    onChange={(e) => handleChange("website", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => handleChange("address", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => handleChange("location", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => handleChange("city", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => handleChange("state", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="zone">Zone</Label>
                  <Input
                    id="zone"
                    value={formData.zone}
                    onChange={(e) => handleChange("zone", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="tier">Tier</Label>
                  <Input
                    id="tier"
                    value={formData.tier}
                    onChange={(e) => handleChange("tier", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="pincode">Pincode</Label>
                  <Input
                    id="pincode"
                    value={formData.pincode}
                    onChange={(e) => handleChange("pincode", e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="metrics" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="turnover">Turnover</Label>
                  <Input
                    id="turnover"
                    placeholder="e.g., 10-50 Cr"
                    value={formData.turnover}
                    onChange={(e) => handleChange("turnover", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="employee_size">Employee Size</Label>
                  <Input
                    id="employee_size"
                    placeholder="e.g., 100-500"
                    value={formData.employee_size}
                    onChange={(e) => handleChange("employee_size", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="erp_name">ERP Name</Label>
                  <Input
                    id="erp_name"
                    value={formData.erp_name}
                    onChange={(e) => handleChange("erp_name", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="erp_vendor">ERP Vendor</Label>
                  <Input
                    id="erp_vendor"
                    value={formData.erp_vendor}
                    onChange={(e) => handleChange("erp_vendor", e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {record ? "Update" : "Add"} Record
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
