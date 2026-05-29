import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import type { RevenueCardType } from "./DashboardRevenueCards";

interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  status: string;
  invoice_date: string;
  payment_received_date?: string;
  tax_amount?: number;
  tds_amount?: number;
  clientName: string;
}

interface RevenueCardDialogProps {
  open: boolean;
  onClose: () => void;
  cardType: RevenueCardType;
  invoices: Invoice[];
  dateRangeLabel: string;
}

const cardLabels: Record<RevenueCardType, string> = {
  invoiced: "Total Invoiced",
  received: "Payments Received",
  pending: "Pending Invoices",
  gst: "GST Details",
  tds: "TDS Details",
};

const formatCompact = (value: number): string => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
};

export function RevenueCardDialog({
  open,
  onClose,
  cardType,
  invoices,
  dateRangeLabel,
}: RevenueCardDialogProps) {
  const count = invoices.length;

  // Choose appropriate date column based on card type
  const getDateLabel = () => {
    if (cardType === "received" || cardType === "gst" || cardType === "tds") {
      return "Payment Date";
    }
    return "Invoice Date";
  };

  const getDate = (inv: Invoice) => {
    if (cardType === "received" || cardType === "gst" || cardType === "tds") {
      return inv.payment_received_date || inv.invoice_date;
    }
    return inv.invoice_date;
  };

  // Show GST/TDS columns for those card types
  const showGST = cardType === "gst";
  const showTDS = cardType === "tds";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {cardLabels[cardType]} ({count})
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {dateRangeLabel}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          {count === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No records found for this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Invoice #</TableHead>
                  <TableHead className="text-xs">Client</TableHead>
                  <TableHead className="text-xs">{getDateLabel()}</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  {showGST && <TableHead className="text-xs text-right">GST</TableHead>}
                  {showTDS && <TableHead className="text-xs text-right">TDS</TableHead>}
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
                      {format(new Date(getDate(inv)), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {formatCompact(inv.amount)}
                    </TableCell>
                    {showGST && (
                      <TableCell className="text-xs text-right font-medium text-blue-600">
                        {formatCompact(inv.tax_amount || 0)}
                      </TableCell>
                    )}
                    {showTDS && (
                      <TableCell className="text-xs text-right font-medium text-orange-600">
                        {formatCompact(inv.tds_amount || 0)}
                      </TableCell>
                    )}
                    <TableCell className="text-xs capitalize">{inv.status}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" asChild>
                        <Link to={`/clients`}>
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
