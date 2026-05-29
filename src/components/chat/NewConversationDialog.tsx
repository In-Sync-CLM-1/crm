 import { useState } from "react";
 import { useQuery } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/contexts/AuthProvider";
 import { useOrgContext } from "@/hooks/useOrgContext";
 import { useConversations } from "@/hooks/useConversations";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
 import { Input } from "@/components/ui/input";
 import { Button } from "@/components/ui/button";
 import { Label } from "@/components/ui/label";
 import { Checkbox } from "@/components/ui/checkbox";
 import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { Search, User, Loader2 } from "lucide-react";
 import { toast } from "sonner";
 
 interface NewConversationDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onCreated: (conversationId: string) => void;
 }
 
 export function NewConversationDialog({
   open,
   onOpenChange,
   onCreated,
 }: NewConversationDialogProps) {
   const { user } = useAuth();
   const { effectiveOrgId } = useOrgContext();
   const { createConversation, isCreating } = useConversations();
 
   const [search, setSearch] = useState("");
   const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
   const [groupName, setGroupName] = useState("");
   const [tab, setTab] = useState("direct");
 
   // Fetch org users
   const { data: users = [], isLoading: usersLoading } = useQuery({
     queryKey: ["org-users-for-chat", effectiveOrgId],
     queryFn: async () => {
       if (!effectiveOrgId) return [];
 
       const { data, error } = await supabase
         .from("profiles")
         .select("id, first_name, last_name, avatar_url")
         .eq("org_id", effectiveOrgId)
         .neq("id", user?.id);
 
       if (error) throw error;
       return data || [];
     },
     enabled: !!effectiveOrgId && !!user?.id && open,
   });
 
   const filteredUsers = users.filter((u) => {
     const fullName = `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase();
     return fullName.includes(search.toLowerCase());
   });
 
   const toggleUser = (userId: string) => {
     if (tab === "direct") {
       setSelectedUsers([userId]);
     } else {
       setSelectedUsers((prev) =>
         prev.includes(userId)
           ? prev.filter((id) => id !== userId)
           : [...prev, userId]
       );
     }
   };
 
   const handleCreate = async () => {
     if (selectedUsers.length === 0) {
       toast.error("Please select at least one user");
       return;
     }
 
     if (tab === "group" && !groupName.trim()) {
       toast.error("Please enter a group name");
       return;
     }
 
     try {
       const conversationId = await createConversation({
         type: tab === "direct" ? "direct" : "group",
         participantIds: selectedUsers,
         name: tab === "group" ? groupName.trim() : undefined,
       });
 
       onCreated(conversationId);
       onOpenChange(false);
       resetForm();
     } catch (error) {
       toast.error("Failed to create conversation");
     }
   };
 
   const resetForm = () => {
     setSearch("");
     setSelectedUsers([]);
     setGroupName("");
     setTab("direct");
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-md">
         <DialogHeader>
           <DialogTitle>New Conversation</DialogTitle>
         </DialogHeader>
 
         <Tabs value={tab} onValueChange={setTab}>
           <TabsList className="grid w-full grid-cols-2">
             <TabsTrigger value="direct">Direct Message</TabsTrigger>
             <TabsTrigger value="group">Group Chat</TabsTrigger>
           </TabsList>
 
           <TabsContent value="direct" className="space-y-4 mt-4">
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
                 {usersLoading ? (
                   <div className="flex items-center justify-center py-8">
                     <Loader2 className="h-6 w-6 animate-spin" />
                   </div>
                 ) : filteredUsers.length === 0 ? (
                   <p className="text-center py-8 text-muted-foreground">
                     No users found
                   </p>
                 ) : (
                   filteredUsers.map((u) => (
                     <button
                       key={u.id}
                       onClick={() => toggleUser(u.id)}
                       className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                         selectedUsers.includes(u.id)
                           ? "bg-primary/10"
                           : "hover:bg-muted/50"
                       }`}
                     >
                       <Avatar className="h-9 w-9">
                         <AvatarImage src={u.avatar_url || undefined} />
                         <AvatarFallback>
                           <User className="h-4 w-4" />
                         </AvatarFallback>
                       </Avatar>
                       <span className="text-sm font-medium">
                         {u.first_name} {u.last_name}
                       </span>
                     </button>
                   ))
                 )}
               </div>
             </ScrollArea>
 
             <Button
               onClick={handleCreate}
               disabled={selectedUsers.length === 0 || isCreating}
               className="w-full"
             >
               {isCreating ? (
                 <Loader2 className="h-4 w-4 animate-spin mr-2" />
               ) : null}
               Start Conversation
             </Button>
           </TabsContent>
 
           <TabsContent value="group" className="space-y-4 mt-4">
             <div className="space-y-2">
               <Label>Group Name</Label>
               <Input
                 placeholder="Enter group name..."
                 value={groupName}
                 onChange={(e) => setGroupName(e.target.value)}
               />
             </div>
 
             <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
               <Input
                 placeholder="Search users..."
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 className="pl-9"
               />
             </div>
 
             <ScrollArea className="h-[200px]">
               <div className="space-y-1">
                 {usersLoading ? (
                   <div className="flex items-center justify-center py-8">
                     <Loader2 className="h-6 w-6 animate-spin" />
                   </div>
                 ) : filteredUsers.length === 0 ? (
                   <p className="text-center py-8 text-muted-foreground">
                     No users found
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
               onClick={handleCreate}
               disabled={
                 selectedUsers.length === 0 || !groupName.trim() || isCreating
               }
               className="w-full"
             >
               {isCreating ? (
                 <Loader2 className="h-4 w-4 animate-spin mr-2" />
               ) : null}
               Create Group
             </Button>
           </TabsContent>
         </Tabs>
       </DialogContent>
     </Dialog>
   );
 }