import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useTaskMutations } from "@/hooks/useTaskMutations";
import { TaskWithUsers } from "@/types/tasks";
import { format } from "date-fns";
import { Calendar, User, Clock, CheckCircle2, PlayCircle, Trash2, AlertCircle, MessageSquare, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface TaskDetailDialogProps {
  task: TaskWithUsers;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailDialog({ task, open, onOpenChange }: TaskDetailDialogProps) {
  const { markInProgress, markComplete, deleteTask, updateTask, isLoading } = useTaskMutations();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [remarks, setRemarks] = useState(task.remarks || "");
  const [isEditingRemarks, setIsEditingRemarks] = useState(false);

  // Reset remarks when task changes
  useEffect(() => {
    setRemarks(task.remarks || "");
    setIsEditingRemarks(false);
  }, [task.id, task.remarks]);

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const canEdit = currentUser?.id === task.assigned_by;
  const canUpdateStatus = currentUser?.id === task.assigned_to;

  // Only mark as overdue if due date is before start of today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(task.due_date);
  dueDate.setHours(0, 0, 0, 0);
  const isOverdue = dueDate < today && task.status !== "completed";

  const handleDelete = () => {
    deleteTask(task.id, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "default";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "default";
      case "in_progress":
        return "secondary";
      case "completed":
        return "outline";
      default:
        return "default";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Task Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Title and Badges */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                {task.title}
                {isOverdue && <AlertCircle className="h-5 w-5 text-destructive" />}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={getStatusColor(task.status)}>
                {task.status.replace("_", " ")}
              </Badge>
              <Badge variant={getPriorityColor(task.priority)}>{task.priority} priority</Badge>
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <div className="space-y-2">
              <h3 className="font-semibold">Description</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Assignee and Creator */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                Assigned To
              </h3>
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {task.assignee?.first_name[0]}
                    {task.assignee?.last_name?.[0] || ""}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {task.assignee?.first_name} {task.assignee?.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{task.assignee?.email}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                Created By
              </h3>
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {task.creator?.first_name[0]}
                    {task.creator?.last_name?.[0] || ""}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {task.creator?.first_name} {task.creator?.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{task.creator?.email}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Remarks Section */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Remarks
              </h3>
              {canUpdateStatus && !isEditingRemarks && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingRemarks(true)}
                >
                  {task.remarks ? "Edit" : "Add Remarks"}
                </Button>
              )}
            </div>
            {isEditingRemarks ? (
              <div className="space-y-2">
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Add your remarks here..."
                  rows={3}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRemarks(task.remarks || "");
                      setIsEditingRemarks(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={isLoading}
                    onClick={() => {
                      updateTask(
                        { id: task.id, data: { remarks } },
                        {
                          onSuccess: () => {
                            setIsEditingRemarks(false);
                          },
                        }
                      );
                    }}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {task.remarks || "No remarks added yet."}
              </p>
            )}
          </div>

          {/* Timeline */}
          <div className="space-y-3 border-t pt-4">
            <h3 className="font-semibold">Timeline</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Created: {format(new Date(task.created_at), "PPP")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span className={isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}>
                  Due: {format(new Date(task.due_date), "PPP")}
                  {isOverdue && " (Overdue)"}
                </span>
              </div>
              {task.completed_at && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Completed: {format(new Date(task.completed_at), "PPP")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between gap-2 border-t pt-4">
            <div>
              {canEdit && !showDeleteConfirm && (
                <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
              {showDeleteConfirm && (
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDelete}>
                    Confirm Delete
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {canUpdateStatus && task.status !== "completed" && (
              <div className="flex gap-2">
                {task.status === "pending" && (
                  <Button
                    onClick={() => {
                      markInProgress(task.id);
                      onOpenChange(false);
                    }}
                  >
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Mark In Progress
                  </Button>
                )}
                {task.status === "in_progress" && (
                  <Button
                    onClick={() => {
                      markComplete(task.id);
                      onOpenChange(false);
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mark Complete
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
