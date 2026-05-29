import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileDown } from "lucide-react";
import PaginationControls from "@/components/common/PaginationControls";

interface SearchResultsTableProps {
  contacts: any[];
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalRecords: number;
  startRecord: number;
  endRecord: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  isLoading?: boolean;
  onExport?: () => void;
  isExporting?: boolean;
}

const SearchResultsTable = ({ 
  contacts, 
  currentPage,
  totalPages,
  pageSize,
  totalRecords,
  startRecord,
  endRecord,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
  onExport,
  isExporting = false,
}: SearchResultsTableProps) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {onExport && (
        <div className="flex justify-end">
          <Button
            onClick={onExport}
            disabled={isExporting || contacts.length === 0}
            variant="outline"
            size="sm"
          >
            <FileDown className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export to Excel'}
          </Button>
        </div>
      )}
      <div className="rounded-md border">
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Pipeline Stage</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No contacts found matching your filters
              </TableCell>
            </TableRow>
          ) : (
            contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell className="font-medium">
                  {contact.first_name} {contact.last_name}
                </TableCell>
                <TableCell>{contact.company || '-'}</TableCell>
                <TableCell>{contact.email || '-'}</TableCell>
                <TableCell>{contact.phone || '-'}</TableCell>
                <TableCell>
                  {contact.pipeline_stages && (
                    <Badge
                      style={{
                        backgroundColor: contact.pipeline_stages.color,
                        color: '#ffffff',
                      }}
                    >
                      {contact.pipeline_stages.name}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                  >
                    View
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </div>
      
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalRecords={totalRecords}
        startRecord={startRecord}
        endRecord={endRecord}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        disabled={isLoading}
      />
    </div>
  );
};

export default SearchResultsTable;
