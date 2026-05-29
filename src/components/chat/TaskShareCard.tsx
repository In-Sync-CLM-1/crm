 import { useQuery } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { CheckSquare, ExternalLink } from "lucide-react";
 import { Link } from "react-router-dom";
 import { Skeleton } from "@/components/ui/skeleton";
 import { Badge } from "@/components/ui/badge";
 
 interface TaskShareCardProps {
   taskId: string;
 }
 
 export function TaskShareCard({ taskId }: TaskShareCardProps) {
   const { data: task, isLoading } = useQuery({
     queryKey: ["chat-task-share", taskId],
     queryFn: async () => {
       const { data, error } = await supabase
         .from("tasks")
         .select("id, title, status, priority, due_date")
         .eq("id", taskId)
         .single();
 
       if (error) throw error;
       return data;
     },
     enabled: !!taskId,
     staleTime: 60000,
   });
 
   if (isLoading) {
     return (
       <div className="flex items-center gap-3 p-3 bg-background/50 rounded-lg">
         <Skeleton className="h-10 w-10 rounded" />
         <div className="flex-1 space-y-2">
           <Skeleton className="h-4 w-3/4" />
           <Skeleton className="h-3 w-1/2" />
         </div>
       </div>
     );
   }
 
   if (!task) {
     return (
       <div className="flex items-center gap-3 p-3 bg-background/50 rounded-lg text-muted-foreground">
         <CheckSquare className="h-5 w-5" />
         <span className="text-sm">Task not found</span>
       </div>
     );
   }
 
   const getStatusColor = (status: string) => {
     switch (status) {
       case "completed":
         return "bg-green-500/10 text-green-600";
       case "in_progress":
         return "bg-blue-500/10 text-blue-600";
       case "pending":
         return "bg-yellow-500/10 text-yellow-600";
       default:
         return "bg-muted text-muted-foreground";
     }
   };
 
   return (
     <Link
       to={`/tasks?taskId=${task.id}`}
       className="flex items-center gap-3 p-3 bg-background/50 rounded-lg hover:bg-background/80 transition-colors"
     >
       <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
         <CheckSquare className="h-5 w-5 text-primary" />
       </div>
       <div className="flex-1 min-w-0">
         <p className="text-sm font-medium truncate">{task.title}</p>
         <div className="flex items-center gap-2 mt-1">
           <Badge variant="secondary" className={getStatusColor(task.status)}>
             {task.status?.replace("_", " ")}
           </Badge>
           {task.priority && (
             <span className="text-xs text-muted-foreground capitalize">
               {task.priority}
             </span>
           )}
         </div>
       </div>
       <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
     </Link>
   );
 }