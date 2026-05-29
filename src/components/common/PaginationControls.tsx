import { 
  Pagination, 
  PaginationContent, 
  PaginationEllipsis, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalRecords: number;
  startRecord: number;
  endRecord: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  disabled?: boolean;
}

const PaginationControls = ({
  currentPage,
  totalPages,
  pageSize,
  totalRecords,
  startRecord,
  endRecord,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  disabled = false,
}: PaginationControlsProps) => {
  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 7; // Maximum number of page buttons to show
    
    if (totalPages <= maxVisible) {
      // Show all pages if total is less than max
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('ellipsis');
      }
      
      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('ellipsis');
      }
      
      // Always show last page
      pages.push(totalPages);
    }
    
    return pages;
  };

  if (totalRecords === 0) {
    return (
      <div className="flex items-center justify-between py-4 px-2">
        <p className="text-sm text-muted-foreground">No records to display</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      {/* Top row: Info and page size selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-2">
        <p className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
          Showing <span className="font-medium">{startRecord}</span> to{" "}
          <span className="font-medium">{endRecord}</span> of{" "}
          <span className="font-medium">{totalRecords}</span> records
        </p>
        
        <div className="flex items-center justify-center sm:justify-end gap-2">
          <span className="text-sm text-muted-foreground hidden sm:inline">Rows per page:</span>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(Number(value))}
            disabled={disabled}
          >
            <SelectTrigger className="w-[70px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bottom row: Pagination controls */}
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={() => !disabled && currentPage > 1 && onPageChange(currentPage - 1)}
              className={
                disabled || currentPage === 1
                  ? "pointer-events-none opacity-50"
                  : "cursor-pointer"
              }
            />
          </PaginationItem>

          {getPageNumbers().map((page, index) => (
            <PaginationItem key={`${page}-${index}`}>
              {page === 'ellipsis' ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  onClick={() => !disabled && onPageChange(page)}
                  isActive={currentPage === page}
                  className={disabled ? "pointer-events-none opacity-50" : "cursor-pointer"}
                >
                  {page}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}

          <PaginationItem>
            <PaginationNext
              onClick={() => !disabled && currentPage < totalPages && onPageChange(currentPage + 1)}
              className={
                disabled || currentPage === totalPages
                  ? "pointer-events-none opacity-50"
                  : "cursor-pointer"
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};

export default PaginationControls;
