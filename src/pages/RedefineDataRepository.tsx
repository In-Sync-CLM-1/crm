import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Database, Download, Plus, Search, Filter, Building2, Users, TrendingUp, Calendar } from "lucide-react";
import { AddEditRepositoryDialog } from "@/components/RedefineRepository/AddEditRepositoryDialog";
import { RepositoryFilters } from "@/components/RedefineRepository/RepositoryFilters";
import { exportToCSV, ExportColumn } from "@/utils/exportUtils";
import { useNotification } from "@/hooks/useNotification";
import { format } from "date-fns";
import { BulkDeleteButton } from "@/components/common/BulkDeleteButton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

export default function RedefineDataRepository() {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    industryType: "",
    state: "",
    zone: "",
    tier: "",
    jobLevel: "",
  });

  // Reset to page 1 when filters or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filters]);

  // Fetch total count for pagination
  const { data: totalCount } = useQuery({
    queryKey: ["redefine-repository-count", effectiveOrgId, searchQuery, filters],
    queryFn: async () => {
      let query = supabase
        .from("redefine_data_repository")
        .select("*", { count: "exact", head: true })
        .eq("org_id", effectiveOrgId!);

      if (searchQuery) {
        query = query.or(
          `name.ilike.%${searchQuery}%,company_name.ilike.%${searchQuery}%,official_email.ilike.%${searchQuery}%,designation.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%`
        );
      }

      if (filters.industryType) {
        query = query.eq("industry_type", filters.industryType);
      }
      if (filters.state) {
        query = query.eq("state", filters.state);
      }
      if (filters.zone) {
        query = query.eq("zone", filters.zone);
      }
      if (filters.tier) {
        query = query.eq("tier", filters.tier);
      }
      if (filters.jobLevel) {
        query = query.eq("job_level", filters.jobLevel);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch repository data with pagination
  const { data: records, isLoading, refetch } = useQuery({
    queryKey: ["redefine-repository", effectiveOrgId, searchQuery, filters, currentPage],
    queryFn: async () => {
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("redefine_data_repository")
        .select("*")
        .eq("org_id", effectiveOrgId!)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (searchQuery) {
        query = query.or(
          `name.ilike.%${searchQuery}%,company_name.ilike.%${searchQuery}%,official_email.ilike.%${searchQuery}%,designation.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%`
        );
      }

      if (filters.industryType) {
        query = query.eq("industry_type", filters.industryType);
      }
      if (filters.state) {
        query = query.eq("state", filters.state);
      }
      if (filters.zone) {
        query = query.eq("zone", filters.zone);
      }
      if (filters.tier) {
        query = query.eq("tier", filters.tier);
      }
      if (filters.jobLevel) {
        query = query.eq("job_level", filters.jobLevel);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId,
  });

  const totalPages = Math.ceil((totalCount || 0) / pageSize);
  const startRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalCount || 0);

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ["redefine-repository-stats", effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("redefine_data_repository")
        .select("company_name, industry_type, created_at")
        .eq("org_id", effectiveOrgId!);

      if (error) throw error;

      const uniqueCompanies = new Set(data.map(r => r.company_name).filter(Boolean)).size;
      const uniqueIndustries = new Set(data.map(r => r.industry_type).filter(Boolean)).size;
      const thisMonth = data.filter(r => {
        const created = new Date(r.created_at);
        const now = new Date();
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
      }).length;

      return {
        totalRecords: data.length,
        uniqueCompanies,
        uniqueIndustries,
        recordsThisMonth: thisMonth,
      };
    },
    enabled: !!effectiveOrgId,
  });

  const handleExport = () => {
    if (!records || records.length === 0) {
      notify.error("No data to export", "There is no data to export");
      return;
    }

    const columns: ExportColumn[] = [
      { key: "name", label: "Name" },
      { key: "designation", label: "Designation" },
      { key: "department", label: "Department" },
      { key: "job_level", label: "Job Level" },
      { key: "linkedin_url", label: "LinkedIn" },
      { key: "mobile_number", label: "Mobile Number" },
      { key: "mobile_2", label: "Mobile 2" },
      { key: "official_email", label: "Official Email" },
      { key: "personal_email", label: "Personal Email" },
      { key: "generic_email", label: "Generic Email" },
      { key: "industry_type", label: "Industry Type" },
      { key: "sub_industry", label: "Sub Industry" },
      { key: "company_name", label: "Company Name" },
      { key: "address", label: "Address" },
      { key: "location", label: "Location" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "zone", label: "Zone" },
      { key: "tier", label: "Tier" },
      { key: "pincode", label: "Pincode" },
      { key: "website", label: "Website" },
      { key: "turnover", label: "Turnover" },
      { key: "employee_size", label: "Employee Size" },
      { key: "erp_name", label: "ERP Name" },
      { key: "erp_vendor", label: "ERP Vendor" },
    ];

    try {
      exportToCSV(records, columns, `redefine-repository-${format(new Date(), "yyyy-MM-dd")}`);
      notify.success("Data exported successfully", "Your data has been exported to CSV");
    } catch (error) {
      notify.error("Failed to export data", "An error occurred while exporting");
    }
  };

  const handleEdit = (record: any) => {
    setSelectedRecord(record);
    setShowAddDialog(true);
  };

  const handleCloseDialog = () => {
    setShowAddDialog(false);
    setSelectedRecord(null);
    refetch();
  };

  const handleBulkDeleteSuccess = () => {
    setSelectedRecords([]);
    refetch();
  };

  const toggleSelectAll = () => {
    if (selectedRecords.length === records?.length) {
      setSelectedRecords([]);
    } else {
      setSelectedRecords(records?.map(record => record.id) || []);
    }
  };

  const toggleSelectRecord = (id: string) => {
    setSelectedRecords(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Data Repository</h1>
            <p className="text-muted-foreground">Manage your professional contacts and company data</p>
          </div>
        </div>
        <div className="flex gap-2">
          {selectedRecords.length > 0 && (
            <BulkDeleteButton
              selectedIds={selectedRecords}
              tableName="redefine_data_repository"
              onSuccess={handleBulkDeleteSuccess}
            />
          )}
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Record
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalRecords || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Companies</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.uniqueCompanies || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Industries</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.uniqueIndustries || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.recordsThisMonth || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, company, email, designation, city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
          </div>
          {showFilters && (
            <RepositoryFilters
              filters={filters}
              onFiltersChange={setFilters}
            />
          )}
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : records && records.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedRecords.length === records?.length && records.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedRecords.includes(record.id)}
                          onCheckedChange={() => toggleSelectRecord(record.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{record.name}</TableCell>
                      <TableCell>{record.designation || "-"}</TableCell>
                      <TableCell>{record.company_name || "-"}</TableCell>
                      <TableCell>
                        {record.industry_type ? (
                          <Badge variant="secondary">{record.industry_type}</Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell>{record.city || record.location || "-"}</TableCell>
                      <TableCell>{record.mobile_number || "-"}</TableCell>
                      <TableCell>{record.official_email || "-"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(record)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No records found. Add your first record or import from CSV.
            </div>
          )}

          {/* Pagination */}
          {totalCount && totalCount > 0 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {startRecord} to {endRecord} of {totalCount} records
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNumber;
                    if (totalPages <= 5) {
                      pageNumber = i + 1;
                    } else if (currentPage <= 3) {
                      pageNumber = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNumber = totalPages - 4 + i;
                    } else {
                      pageNumber = currentPage - 2 + i;
                    }
                    
                    return (
                      <PaginationItem key={pageNumber}>
                        <PaginationLink
                          onClick={() => setCurrentPage(pageNumber)}
                          isActive={currentPage === pageNumber}
                          className="cursor-pointer"
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  
                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddEditRepositoryDialog
        open={showAddDialog}
        onOpenChange={handleCloseDialog}
        record={selectedRecord}
        orgId={effectiveOrgId!}
      />
      </div>
    </DashboardLayout>
  );
}
