import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotification } from "@/hooks/useNotification";

/**
 * Small copy-to-clipboard button for any generated copy a user would want to
 * paste elsewhere (ad copy, post drafts, keywords, captions). Icon flips to
 * a checkmark for 1.5s as feedback, on top of the toast.
 */
export function CopyButton({
  text,
  label = "Copy",
  className,
  size = "sm",
  variant = "ghost",
}: {
  text: string;
  label?: string;
  className?: string;
  size?: "sm" | "icon";
  variant?: "ghost" | "outline";
}) {
  const [copied, setCopied] = useState(false);
  const notify = useNotification();

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      notify.success("Copied", "Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify.error("Couldn't copy", "Your browser blocked clipboard access");
    }
  };

  if (size === "icon") {
    return (
      <Button
        type="button"
        variant={variant}
        size="icon"
        className={cn("h-7 w-7 shrink-0", className)}
        onClick={handleCopy}
        disabled={!text}
        title={label}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={cn("h-7 text-xs gap-1", className)}
      onClick={handleCopy}
      disabled={!text}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
