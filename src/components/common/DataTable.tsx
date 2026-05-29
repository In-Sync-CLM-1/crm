import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "./LoadingState";
import { EmptyState } from "./EmptyState";

export interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
  /** Hide column on mobile */
  hideOnMobile?: boolean;
  /** Priority for showing on mobile (lower = more important) */
  priority?: number;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  onRowClick?: (row: T) => void;
  renderActions?: (row: T) => React.ReactNode;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  isLoading = false,
  emptyMessage = "No data available",
  emptyIcon,
  onRowClick,
  renderActions,
}: DataTableProps<T>) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (data.length === 0) {
    return <EmptyState icon={emptyIcon} message={emptyMessage} />;
  }

  return (
    <div className="rounded-md border overflow-hidden">
      {/* Horizontal scroll wrapper for mobile */}
      <div className="overflow-x-auto -mx-px scroll-smooth-touch">
        <Table className="min-w-full">
          <TableHeader>
            <TableRow>
              {columns.map((column, index) => (
                <TableHead 
                  key={index} 
                  className={`${column.className || ''} ${column.hideOnMobile ? 'hidden sm:table-cell' : ''} whitespace-nowrap`}
                >
                  {column.header}
                </TableHead>
              ))}
              {renderActions && <TableHead className="text-right sticky right-0 bg-muted/50">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={`${onRowClick ? "cursor-pointer active:bg-muted/80" : ""} touch-action-pan-y`}
              >
                {columns.map((column, index) => (
                  <TableCell 
                    key={index} 
                    className={`${column.className || ''} ${column.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
                  >
                    {typeof column.accessor === "function"
                      ? column.accessor(row)
                      : String(row[column.accessor] ?? "")}
                  </TableCell>
                ))}
                {renderActions && (
                  <TableCell 
                    className="text-right sticky right-0 bg-card" 
                    onClick={(e) => e.stopPropagation()}
                  >
                    {renderActions(row)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
