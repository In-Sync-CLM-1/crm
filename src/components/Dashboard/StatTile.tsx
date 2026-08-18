import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: "default" | "good" | "warning" | "critical";
  /** Sub-line under the number, e.g. direction or the counts behind a figure. */
  hint?: string;
  onClick?: () => void;
}

const toneAccent: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "bg-primary",
  good: "bg-[hsl(101,45%,42%)]",
  warning: "bg-[hsl(38,88%,55%)]",
  critical: "bg-destructive",
};

const toneIcon: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "text-primary",
  good: "text-[hsl(101,45%,34%)]",
  warning: "text-[hsl(32,80%,42%)]",
  critical: "text-destructive",
};

/**
 * Editorial stat tile — IT Helpdesk's own StatTile pattern (a left accent
 * stripe carries the tone instead of a colored icon-chip square) paired with
 * the Fervent dashboard's serif-figure treatment for the number itself.
 */
export function StatTile({ label, value, icon: Icon, tone = "default", hint, onClick }: StatTileProps) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card text-left w-full p-3",
        onClick && "transition-all hover:border-primary/40 hover:shadow-md cursor-pointer",
      )}
    >
      <span className={cn("absolute left-0 top-0 h-full w-[3px]", toneAccent[tone])} aria-hidden="true" />
      <div className="pl-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide truncate">{label}</p>
          <p className="font-display font-medium tracking-tight text-xl leading-tight mt-1">{value}</p>
          {hint && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
        </div>
        {Icon && <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", toneIcon[tone])} strokeWidth={2} />}
      </div>
    </Wrapper>
  );
}
