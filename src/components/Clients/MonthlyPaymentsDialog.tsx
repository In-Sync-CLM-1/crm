import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  amount: number;
  tax_amount?: number;
  tds_amount?: number;
  net_received_amount?: number;
  payment_received_date?: string;
  status: string;
  currency: string;
}

interface MonthlyPaymentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthLabel: string;
  invoices: Invoice[];
  currency?: string;
}

export function MonthlyPaymentsDialog({
  open,
  onOpenChange,
  monthLabel,
  invoices,
  currency = "INR",
}: MonthlyPaymentsDialogProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      paid: "default",
      pending: "secondary",
      overdue: "destructive",
    };
    return (
      <Badge variant={variants[status] || "outline"} className="capitalize">
        {status}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Payments for {monthLabel}
            <Badge variant="secondary">{invoices.length} invoices</Badge>
          </DialogTitle>
        </DialogHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Invoice Date</TableHead>
              <TableHead>Payment Date</TableHead>
              <TableHead className="text-right">Base Amount</TableHead>
              <TableHead className="text-right">GST</TableHead>
              <TableHead className="text-right">TDS</TableHead>
              <TableHead className="text-right">Net Received</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                <TableCell>
                  {format(parseISO(invoice.invoice_date), "dd MMM yyyy")}
                </TableCell>
                <TableCell>
                  {invoice.payment_received_date
                    ? format(parseISO(invoice.payment_received_date), "dd MMM yyyy")
                    : "-"}
                </TableCell>
                <TableCell className="text-right">{formatCurrency(invoice.amount || 0)}</TableCell>
                <TableCell className="text-right text-blue-600">
                  {formatCurrency(invoice.tax_amount || 0)}
                </TableCell>
                <TableCell className="text-right text-orange-600">
                  {formatCurrency(invoice.tds_amount || 0)}
                </TableCell>
                <TableCell className="text-right font-medium text-green-600">
                  {formatCurrency(invoice.net_received_amount || 0)}
                </TableCell>
                <TableCell>{getStatusBadge(invoice.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
