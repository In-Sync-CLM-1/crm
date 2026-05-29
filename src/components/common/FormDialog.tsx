import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface FormDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onSubmit: (e: React.FormEvent) => void;
  isLoading?: boolean;
  submitLabel?: string;
  children: React.ReactNode;
}

export function FormDialog<T>({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  isLoading = false,
  submitLabel = "Submit",
  children,
}: FormDialogProps<T>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {children}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
