 import { useState } from "react";
 import { Search, Plus, Users, User } from "lucide-react";
 import { Input } from "@/components/ui/input";
 import { Button } from "@/components/ui/button";
 import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
 import { Badge } from "@/components/ui/badge";
 import { Skeleton } from "@/components/ui/skeleton";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { Conversation } from "@/hooks/useConversations";
 import { NewConversationDialog } from "./NewConversationDialog";
 import { useAuth } from "@/contexts/AuthProvider";
 import { formatDistanceToNow } from "date-fns";
 
 interface ConversationListProps {
   conversations: Conversation[];
   isLoading: boolean;
   selectedId?: string;
   onSelect: (id: string) => void;
 }
 
 export function ConversationList({
   conversations,
   isLoading,
   selectedId,
   onSelect,
 }: ConversationListProps) {
   const { user } = useAuth();
   const [search, setSearch] = useState("");
   const [newDialogOpen, setNewDialogOpen] = useState(false);
 
   const getDisplayName = (conv: Conversation) => {
     if (conv.conversation_type === "group") {
       return conv.name || "Group Chat";
     }
     const other = conv.participants.find((p) => p.user_id !== user?.id);
     return other?.profile?.full_name || "Unknown";
   };
 
   const getAvatar = (conv: Conversation) => {
     if (conv.conversation_type === "group") return null;
     const other = conv.participants.find((p) => p.user_id !== user?.id);
     return other?.profile?.avatar_url || null;
   };
 
   const getLastMessagePreview = (conv: Conversation) => {
     if (!conv.last_message) return "No messages yet";
     if (conv.last_message.message_type === "file") return "📎 Sent a file";
     if (conv.last_message.message_type === "task_share") return "📋 Shared a task";
     return conv.last_message.content || "";
   };
 
   const filteredConversations = conversations.filter((conv) => {
     const name = getDisplayName(conv).toLowerCase();
     return name.includes(search.toLowerCase());
   });
 
   if (isLoading) {
     return (
       <div className="h-full flex flex-col">
         <div className="p-4 border-b border-border">
           <Skeleton className="h-9 w-full" />
         </div>
         <div className="p-4 space-y-3">
           {[...Array(5)].map((_, i) => (
             <div key={i} className="flex gap-3">
               <Skeleton className="h-10 w-10 rounded-full" />
               <div className="flex-1 space-y-2">
                 <Skeleton className="h-4 w-3/4" />
                 <Skeleton className="h-3 w-1/2" />
               </div>
             </div>
           ))}
         </div>
       </div>
     );
   }
 
   return (
     <div className="h-full flex flex-col">
       {/* Header */}
       <div className="p-4 border-b border-border">
         <div className="flex items-center justify-between mb-3">
           <h2 className="text-lg font-semibold">Messages</h2>
           <Button size="sm" onClick={() => setNewDialogOpen(true)}>
             <Plus className="h-4 w-4 mr-1" />
             New
           </Button>
         </div>
         <div className="relative">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
           <Input
             placeholder="Search conversations..."
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             className="pl-9 h-9"
           />
         </div>
       </div>
 
       {/* Conversation List */}
       <ScrollArea className="flex-1">
         <div className="p-2">
           {filteredConversations.length === 0 ? (
             <div className="text-center py-8 text-muted-foreground">
               <p>No conversations found</p>
             </div>
           ) : (
             filteredConversations.map((conv) => (
               <button
                 key={conv.id}
                 onClick={() => onSelect(conv.id)}
                 className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors ${
                   selectedId === conv.id
                     ? "bg-accent"
                     : "hover:bg-muted/50"
                 }`}
               >
                 <Avatar className="h-10 w-10 shrink-0">
                   <AvatarImage src={getAvatar(conv) || undefined} />
                   <AvatarFallback>
                     {conv.conversation_type === "group" ? (
                       <Users className="h-5 w-5" />
                     ) : (
                       <User className="h-5 w-5" />
                     )}
                   </AvatarFallback>
                 </Avatar>
                 <div className="flex-1 min-w-0">
                   <div className="flex items-center justify-between gap-2">
                     <span className="font-medium truncate">
                       {getDisplayName(conv)}
                     </span>
                     <span className="text-xs text-muted-foreground shrink-0">
                       {formatDistanceToNow(new Date(conv.last_message_at), {
                         addSuffix: false,
                       })}
                     </span>
                   </div>
                   <div className="flex items-center justify-between gap-2 mt-0.5">
                     <p className="text-sm text-muted-foreground truncate">
                       {getLastMessagePreview(conv)}
                     </p>
                     {conv.unread_count > 0 && (
                       <Badge variant="default" className="shrink-0 h-5 min-w-5 px-1.5">
                         {conv.unread_count}
                       </Badge>
                     )}
                   </div>
                 </div>
               </button>
             ))
           )}
         </div>
       </ScrollArea>
 
       <NewConversationDialog
         open={newDialogOpen}
         onOpenChange={setNewDialogOpen}
         onCreated={onSelect}
       />
     </div>
   );
 }