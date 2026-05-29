 import { useState } from "react";
 import { useQuery } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/contexts/AuthProvider";
 import { useOrgContext } from "@/hooks/useOrgContext";
 import { useGroupParticipants } from "@/hooks/useGroupParticipants";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import { Input } from "@/components/ui/input";
 import { Button } from "@/components/ui/button";
 import { Checkbox } from "@/components/ui/checkbox";
 import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { Search, User, Loader2 } from "lucide-react";
 import { toast } from "sonner";
 
 interface AddParticipantsDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   conversationId: string;
   existingParticipantIds: string[];
 }
 
 export function AddParticipantsDialog({
   open,
   onOpenChange,
   conversationId,
   existingParticipantIds,
 }: AddParticipantsDialogProps) {
   const { user } = useAuth();
   const { effectiveOrgId } = useOrgContext();
   const { addParticipants, isAdding } = useGroupParticipants(conversationId);
 
   const [search, setSearch] = useState("");
   const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
 
   // Fetch org users not already in conversation
   const { data: users = [], isLoading } = useQuery({
     queryKey: ["add-participants-users", effectiveOrgId, existingParticipantIds],
     queryFn: async () => {
       if (!effectiveOrgId) return [];
 
       const { data, error } = await supabase
         .from("profiles")
         .select("id, first_name, last_name, avatar_url")
         .eq("org_id", effectiveOrgId)
         .not("id", "in", `(${existingParticipantIds.join(",")})`);
 
       if (error) throw error;
       return data || [];
     },
     enabled: !!effectiveOrgId && open,
   });
 
   const filteredUsers = users.filter((u) => {
     const fullName = `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase();
     return fullName.includes(search.toLowerCase());
   });
 
   const toggleUser = (userId: string) => {
     setSelectedUsers((prev) =>
       prev.includes(userId)
         ? prev.filter((id) => id !== userId)
         : [...prev, userId]
     );
   };
 
   const handleAdd = async () => {
     if (selectedUsers.length === 0) return;
 
     try {
       await addParticipants(selectedUsers);
       toast.success(`Added ${selectedUsers.length} member(s)`);
       onOpenChange(false);
       setSelectedUsers([]);
       setSearch("");
     } catch (error) {
       toast.error("Failed to add members");
     }
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-md">
         <DialogHeader>
           <DialogTitle>Add Members</DialogTitle>
         </DialogHeader>
 
         <div className="space-y-4">
           <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
             <Input
               placeholder="Search users..."
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               className="pl-9"
             />
           </div>
 
           <ScrollArea className="h-[250px]">
             <div className="space-y-1">
               {isLoading ? (
                 <div className="flex items-center justify-center py-8">
                   <Loader2 className="h-6 w-6 animate-spin" />
                 </div>
               ) : filteredUsers.length === 0 ? (
                 <p className="text-center py-8 text-muted-foreground">
                   No users available to add
                 </p>
               ) : (
                 filteredUsers.map((u) => (
                   <label
                     key={u.id}
                     className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                   >
                     <Checkbox
                       checked={selectedUsers.includes(u.id)}
                       onCheckedChange={() => toggleUser(u.id)}
                     />
                     <Avatar className="h-9 w-9">
                       <AvatarImage src={u.avatar_url || undefined} />
                       <AvatarFallback>
                         <User className="h-4 w-4" />
                       </AvatarFallback>
                     </Avatar>
                     <span className="text-sm font-medium">
                       {u.first_name} {u.last_name}
                     </span>
                   </label>
                 ))
               )}
             </div>
           </ScrollArea>
 
           {selectedUsers.length > 0 && (
             <p className="text-sm text-muted-foreground">
               {selectedUsers.length} user(s) selected
             </p>
           )}
 
           <Button
             onClick={handleAdd}
             disabled={selectedUsers.length === 0 || isAdding}
             className="w-full"
           >
             {isAdding ? (
               <Loader2 className="h-4 w-4 animate-spin mr-2" />
             ) : null}
             Add Members
           </Button>
         </div>
       </DialogContent>
     </Dialog>
   );
 }