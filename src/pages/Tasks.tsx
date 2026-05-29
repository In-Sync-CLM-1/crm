import DashboardLayout from "@/components/Layout/DashboardLayout";
import { TaskList } from "@/components/Tasks/TaskList";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckSquare } from "lucide-react";

export default function Tasks() {
  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 overflow-x-hidden">
        <div className="flex items-center gap-2 sm:gap-3">
          <CheckSquare className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-foreground truncate">Tasks</h1>
            <p className="text-xs sm:text-base text-muted-foreground mt-0.5 sm:mt-1 truncate">Manage and track all your tasks</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Tasks</CardTitle>
            <CardDescription>View and manage tasks assigned to you or by you</CardDescription>
          </CardHeader>
          <CardContent>
            <TaskList filter="all" showCreateButton={true} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
