import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PipelineStage {
  id: string;
  name: string;
  color: string;
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
}

export interface PipelineFiltersState {
  name: string;
  company: string;
  city: string;
  state: string;
  country: string;
  source: string;
  stageId: string;
  industryType: string;
  jobTitle: string;
  createdBy: string;
}

interface PipelineFiltersProps {
  filters: PipelineFiltersState;
  stages: PipelineStage[];
  users?: User[];
  onFiltersChange: (filters: PipelineFiltersState) => void;
  onSearch: () => void;
  onClear: () => void;
  isSearching?: boolean;
  resultCount?: number;
  totalCount?: number;
}

const emptyFilters: PipelineFiltersState = {
  name: "",
  company: "",
  city: "",
  state: "",
  country: "",
  source: "",
  stageId: "",
  industryType: "",
  jobTitle: "",
  createdBy: "",
};

export function PipelineFilters({
  filters,
  stages,
  users = [],
  onFiltersChange,
  onSearch,
  onClear,
  isSearching = false,
  resultCount,
  totalCount,
}: PipelineFiltersProps) {
  const [isOpen, setIsOpen] = useState(true);

  const handleChange = (field: keyof PipelineFiltersState, value: string) => {
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
            <span className="font-medium text-sm">Field Filters</span>
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
              placeholder="Industry"
              value={filters.industryType}
              onChange={(e) => handleChange("industryType", e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-xs"
            />
            <Input
              placeholder="Source"
              value={filters.source}
              onChange={(e) => handleChange("source", e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-xs"
            />
            <Select
              value={filters.stageId}
              onValueChange={(v) => handleChange("stageId", v === "all" ? "" : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Stage" />
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
          </div>

          {/* Row 2: Location + Created By */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            <Input
              placeholder="City"
              value={filters.city}
              onChange={(e) => handleChange("city", e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-xs"
            />
            <Input
              placeholder="State"
              value={filters.state}
              onChange={(e) => handleChange("state", e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-xs"
            />
            <Input
              placeholder="Country"
              value={filters.country}
              onChange={(e) => handleChange("country", e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-xs"
            />
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
            <div className="col-span-2 flex gap-2 justify-end">
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

export { emptyFilters };
