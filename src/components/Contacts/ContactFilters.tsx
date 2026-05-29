import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PipelineStage {
  id: string;
  name: string;
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
}

export interface ContactFiltersState {
  name: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  source: string;
  status: string;
  stageId: string;
  industryType: string;
  jobTitle: string;
  createdBy: string;
}

interface ContactFiltersProps {
  filters: ContactFiltersState;
  stages: PipelineStage[];
  users: User[];
  onFiltersChange: (filters: ContactFiltersState) => void;
  onSearch: () => void;
  onClear: () => void;
  isSearching?: boolean;
  resultCount?: number;
  totalCount?: number;
}

export const emptyContactFilters: ContactFiltersState = {
  name: "",
  email: "",
  phone: "",
  company: "",
  city: "",
  source: "",
  status: "",
  stageId: "",
  industryType: "",
  jobTitle: "",
  createdBy: "",
};

export function ContactFilters({
  filters,
  stages,
  users,
  onFiltersChange,
  onSearch,
  onClear,
  isSearching = false,
  resultCount,
  totalCount,
}: ContactFiltersProps) {
  const [isOpen, setIsOpen] = useState(true);

  const handleChange = (field: keyof ContactFiltersState, value: string) => {
    onFiltersChange({ ...filters, [field]: value });
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isSearching) {
      onSearch();
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg bg-card">
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Filters</span>
            {hasActiveFilters && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {resultCount !== undefined && totalCount !== undefined && resultCount !== totalCount && (
              <span className="text-xs text-muted-foreground">
                {resultCount} of {totalCount}
              </span>
            )}
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-3 pt-0 space-y-3">
          {/* Row 1 */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            <Input
              placeholder="Name"
              value={filters.name}
              onChange={(e) => handleChange("name", e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-xs"
            />
            <Input
              placeholder="Email"
              value={filters.email}
              onChange={(e) => handleChange("email", e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-xs"
            />
            <Input
              placeholder="Phone"
              value={filters.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-xs"
            />
            <Input
              placeholder="Company"
              value={filters.company}
              onChange={(e) => handleChange("company", e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-xs"
            />
            <Input
              placeholder="Job Title"
              value={filters.jobTitle}
              onChange={(e) => handleChange("jobTitle", e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-xs"
            />
            <Input
              placeholder="City"
              value={filters.city}
              onChange={(e) => handleChange("city", e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-xs"
            />
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            <Input
              placeholder="Source"
              value={filters.source}
              onChange={(e) => handleChange("source", e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-xs"
            />
            <Select
              value={filters.industryType}
              onValueChange={(v) => handleChange("industryType", v === "all" ? "" : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Industry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Industries</SelectItem>
                <SelectItem value="manufacturing">Manufacturing</SelectItem>
                <SelectItem value="it_software">IT/Software</SelectItem>
                <SelectItem value="healthcare">Healthcare</SelectItem>
                <SelectItem value="finance_banking">Finance/Banking</SelectItem>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="education">Education</SelectItem>
                <SelectItem value="real_estate">Real Estate</SelectItem>
                <SelectItem value="hospitality">Hospitality</SelectItem>
                <SelectItem value="logistics">Logistics</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.status}
              onValueChange={(v) => handleChange("status", v === "all" ? "" : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.stageId}
              onValueChange={(v) => handleChange("stageId", v === "all" ? "" : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Pipeline Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.createdBy}
              onValueChange={(v) => handleChange("createdBy", v === "all" ? "" : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Created By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.first_name} {user.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                onClick={onSearch}
                disabled={isSearching}
                className="h-8 text-xs"
              >
                <Search className="h-3 w-3 mr-1" />
                Search
              </Button>
              {hasActiveFilters && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onClear}
                  disabled={isSearching}
                  className="h-8 text-xs"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
