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

export type MetricType = "qualified" | "proposals" | "deals" | "invoiced" | "received";

interface Contact {
  id: string;
  first_name: string;
  last_name?: string;
  company?: string;
  created_at: string;
  stageName?: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  status: string;
  invoice_date: string;
  clientName?: string;
}

interface ContactsListDialogProps {
  open: boolean;
  onClose: () => void;
  month: string;
  metricType: MetricType;
  contacts?: Contact[];
  invoices?: Invoice[];
}

const metricLabels: Record<MetricType, string> = {
  qualified: "Qualified Opportunities",
  proposals: "Proposals",
  deals: "Deals Closed",
  invoiced: "Invoiced",
  received: "Revenue Received",
};

const formatCompact = (value: number): string => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
};

export function ContactsListDialog({
  open,
  onClose,
  month,
  metricType,
  contacts = [],
  invoices = [],
}: ContactsListDialogProps) {
  const isInvoiceMetric = metricType === "invoiced" || metricType === "received";
  const items = isInvoiceMetric ? invoices : contacts;
  const count = items.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {metricLabels[metricType]} in {month} ({count})
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          {count === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No records found for this period.
            </p>
          ) : isInvoiceMetric ? (
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
                      {formatCompact(inv.amount)}
                    </TableCell>
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Company</TableHead>
                  <TableHead className="text-xs">Date Added</TableHead>
                  <TableHead className="text-xs">Stage</TableHead>
                  <TableHead className="text-xs w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id} className="h-8">
                    <TableCell className="text-xs font-medium">
                      {contact.first_name} {contact.last_name || ""}
                    </TableCell>
                    <TableCell className="text-xs">{contact.company || "-"}</TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(contact.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{contact.stageName || "-"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" asChild>
                        <Link to={`/contacts/${contact.id}`}>
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
