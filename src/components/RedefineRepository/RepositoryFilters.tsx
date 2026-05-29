import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface RepositoryFiltersProps {
  filters: {
    industryType: string;
    state: string;
    zone: string;
    tier: string;
    jobLevel: string;
  };
  onFiltersChange: (filters: any) => void;
}

export function RepositoryFilters({ filters, onFiltersChange }: RepositoryFiltersProps) {
  const handleFilterChange = (key: string, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleClearFilters = () => {
    onFiltersChange({
      industryType: "",
      state: "",
      zone: "",
      tier: "",
      jobLevel: "",
    });
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== "");

  return (
    <div className="mt-4 p-4 border rounded-lg bg-muted/50 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Advanced Filters</h3>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            <X className="mr-2 h-4 w-4" />
            Clear All
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div>
          <Label>Industry Type</Label>
          <Select value={filters.industryType} onValueChange={(v) => handleFilterChange("industryType", v)}>
            <SelectTrigger>
              <SelectValue placeholder="All Industries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Industries</SelectItem>
              <SelectItem value="IT Services">IT Services</SelectItem>
              <SelectItem value="Manufacturing">Manufacturing</SelectItem>
              <SelectItem value="Healthcare">Healthcare</SelectItem>
              <SelectItem value="Finance">Finance</SelectItem>
              <SelectItem value="Retail">Retail</SelectItem>
              <SelectItem value="Education">Education</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>State</Label>
          <Select value={filters.state} onValueChange={(v) => handleFilterChange("state", v)}>
            <SelectTrigger>
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All States</SelectItem>
              <SelectItem value="Karnataka">Karnataka</SelectItem>
              <SelectItem value="Maharashtra">Maharashtra</SelectItem>
              <SelectItem value="Tamil Nadu">Tamil Nadu</SelectItem>
              <SelectItem value="Delhi">Delhi</SelectItem>
              <SelectItem value="Gujarat">Gujarat</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Zone</Label>
          <Select value={filters.zone} onValueChange={(v) => handleFilterChange("zone", v)}>
            <SelectTrigger>
              <SelectValue placeholder="All Zones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Zones</SelectItem>
              <SelectItem value="North">North</SelectItem>
              <SelectItem value="South">South</SelectItem>
              <SelectItem value="East">East</SelectItem>
              <SelectItem value="West">West</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Tier</Label>
          <Select value={filters.tier} onValueChange={(v) => handleFilterChange("tier", v)}>
            <SelectTrigger>
              <SelectValue placeholder="All Tiers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Tiers</SelectItem>
              <SelectItem value="Tier 1">Tier 1</SelectItem>
              <SelectItem value="Tier 2">Tier 2</SelectItem>
              <SelectItem value="Tier 3">Tier 3</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Job Level</Label>
          <Select value={filters.jobLevel} onValueChange={(v) => handleFilterChange("jobLevel", v)}>
            <SelectTrigger>
              <SelectValue placeholder="All Levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Levels</SelectItem>
              <SelectItem value="L1">L1</SelectItem>
              <SelectItem value="L2">L2</SelectItem>
              <SelectItem value="L3">L3</SelectItem>
              <SelectItem value="L4">L4</SelectItem>
              <SelectItem value="L5">L5</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
