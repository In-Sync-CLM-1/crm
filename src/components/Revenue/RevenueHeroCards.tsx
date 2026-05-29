import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Clock, AlertTriangle, CheckCircle } from "lucide-react";

interface RevenueHeroCardsProps {
  totalRevenue: number;
  paidAmount: number;
  outstandingAmount: number;
  overdueAmount: number;
  currency?: string;
}

const formatCurrency = (amount: number, currency: string = "INR") => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
};

export function RevenueHeroCards({
  totalRevenue,
  paidAmount,
  outstandingAmount,
  overdueAmount,
  currency = "INR",
}: RevenueHeroCardsProps) {
  const paidPercentage = totalRevenue > 0 ? ((paidAmount / totalRevenue) * 100).toFixed(1) : "0";
  const outstandingPercentage = totalRevenue > 0 ? ((outstandingAmount / totalRevenue) * 100).toFixed(1) : "0";
  const overduePercentage = totalRevenue > 0 ? ((overdueAmount / totalRevenue) * 100).toFixed(1) : "0";

  const cards = [
    {
      title: "Total Revenue",
      value: formatCurrency(totalRevenue, currency),
      icon: DollarSign,
      gradient: "from-blue-500 to-blue-600",
      subtitle: "All invoices",
      trend: null,
    },
    {
      title: "Received",
      value: formatCurrency(paidAmount, currency),
      icon: CheckCircle,
      gradient: "from-emerald-500 to-emerald-600",
      subtitle: `${paidPercentage}% of total`,
      trend: "up" as const,
    },
    {
      title: "Outstanding",
      value: formatCurrency(outstandingAmount, currency),
      icon: Clock,
      gradient: "from-amber-500 to-amber-600",
      subtitle: `${outstandingPercentage}% pending`,
      trend: null,
    },
    {
      title: "Overdue",
      value: formatCurrency(overdueAmount, currency),
      icon: AlertTriangle,
      gradient: "from-red-500 to-red-600",
      subtitle: `${overduePercentage}% overdue`,
      trend: overdueAmount > 0 ? ("down" as const) : null,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card
          key={card.title}
          className={`relative overflow-hidden bg-gradient-to-br ${card.gradient} text-white border-0 shadow-lg`}
        >
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white/90">{card.title}</span>
              <card.icon className="h-5 w-5 text-white/80" />
            </div>
            <div className="text-2xl font-bold mb-1">{card.value}</div>
            <div className="flex items-center gap-1 text-sm text-white/80">
              {card.trend === "up" && <TrendingUp className="h-3 w-3" />}
              {card.trend === "down" && <TrendingDown className="h-3 w-3" />}
              <span>{card.subtitle}</span>
            </div>
          </div>
          {/* Decorative circle */}
          <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-white/10" />
        </Card>
      ))}
    </div>
  );
}
