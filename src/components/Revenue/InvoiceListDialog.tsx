import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { formatCompactINR } from "@/utils/currency";

export type MetricType = "invoiced" | "received";

interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  status: string;
  invoice_date: string;
  clientName?: string;
}

interface InvoiceListDialogProps {
  open: boolean;
  onClose: () => void;
  month: string;
  metricType: MetricType;
  invoices?: Invoice[];
}

const metricLabels: Record<MetricType, string> = {
  invoiced: "Invoiced",
  received: "Revenue Received",
};

export function InvoiceListDialog({
  open,
  onClose,
  month,
  metricType,
  invoices = [],
}: InvoiceListDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {metricLabels[metricType]} in {month} ({invoices.length})
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No records found for this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Invoice #</TableHead>
                  <TableHead className="text-xs">Client</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id} className="h-8">
                    <TableCell className="text-xs font-medium">{inv.invoice_number}</TableCell>
                    <TableCell className="text-xs">{inv.clientName || "-"}</TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(inv.invoice_date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {formatCompactINR(inv.amount)}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{inv.status}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" asChild>
                        <Link to="/clients">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
