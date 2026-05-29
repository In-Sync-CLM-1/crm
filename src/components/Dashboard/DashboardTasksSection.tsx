import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { TaskList } from "@/components/Tasks/TaskList";

interface DashboardTasksSectionProps {
  limit?: number;
}

export function DashboardTasksSection({ limit = 5 }: DashboardTasksSectionProps) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-medium">Upcoming Tasks</h3>
          <p className="text-[10px] text-muted-foreground">Your {limit} nearest tasks</p>
        </div>
        <Link to="/tasks">
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
            View All
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </div>
      <TaskList filter="assigned_to_me" limit={limit} showCreateButton={false} />
    </Card>
  );
}
