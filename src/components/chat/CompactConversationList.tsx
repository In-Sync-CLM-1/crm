 import { useState } from "react";
 import { Search, Plus, Users, User } from "lucide-react";
 import { Input } from "@/components/ui/input";
 import { Button } from "@/components/ui/button";
 import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
 import { Badge } from "@/components/ui/badge";
 import { Skeleton } from "@/components/ui/skeleton";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { useConversations, Conversation } from "@/hooks/useConversations";
 import { NewConversationDialog } from "./NewConversationDialog";
 import { useAuth } from "@/contexts/AuthProvider";
 import { formatDistanceToNow } from "date-fns";
 
 interface CompactConversationListProps {
   onSelectConversation: (id: string) => void;
 }
 
 export function CompactConversationList({
   onSelectConversation,
 }: CompactConversationListProps) {
   const { user } = useAuth();
   const { conversations, isLoading } = useConversations();
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
     if (conv.last_message.message_type === "file") return "📎 File";
     if (conv.last_message.message_type === "task_share") return "📋 Task";
     return conv.last_message.content?.substring(0, 30) || "";
   };
 
   const filteredConversations = conversations.filter((conv) => {
     const name = getDisplayName(conv).toLowerCase();
     return name.includes(search.toLowerCase());
   });
 
   if (isLoading) {
     return (
       <div className="p-3 space-y-3">
         {[...Array(4)].map((_, i) => (
           <div key={i} className="flex gap-3">
             <Skeleton className="h-9 w-9 rounded-full shrink-0" />
             <div className="flex-1 space-y-1.5">
               <Skeleton className="h-3.5 w-3/4" />
               <Skeleton className="h-3 w-1/2" />
             </div>
           </div>
         ))}
       </div>
     );
   }
 
   return (
     <div className="h-full flex flex-col">
       {/* Search */}
       <div className="p-3 border-b border-border">
         <div className="relative">
           <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
           <Input
             placeholder="Search..."
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             className="pl-8 h-8 text-sm"
           />
         </div>
       </div>
 
       {/* List */}
       <ScrollArea className="flex-1">
         <div className="p-2">
           {filteredConversations.length === 0 ? (
             <div className="text-center py-6 text-muted-foreground text-sm">
               No conversations
             </div>
           ) : (
             filteredConversations.map((conv) => (
               <button
                 key={conv.id}
                 onClick={() => onSelectConversation(conv.id)}
                 className="w-full flex items-start gap-2.5 p-2 rounded-lg text-left hover:bg-muted/50 transition-colors"
               >
                 <Avatar className="h-9 w-9 shrink-0">
                   <AvatarImage src={getAvatar(conv) || undefined} />
                   <AvatarFallback className="text-xs">
                     {conv.conversation_type === "group" ? (
                       <Users className="h-4 w-4" />
                     ) : (
                       <User className="h-4 w-4" />
                     )}
                   </AvatarFallback>
                 </Avatar>
                 <div className="flex-1 min-w-0">
                   <div className="flex items-center justify-between gap-2">
                     <span className="text-sm font-medium truncate">
                       {getDisplayName(conv)}
                     </span>
                     <span className="text-[10px] text-muted-foreground shrink-0">
                       {formatDistanceToNow(new Date(conv.last_message_at), {
                         addSuffix: false,
                       })}
                     </span>
                   </div>
                   <div className="flex items-center justify-between gap-2 mt-0.5">
                     <p className="text-xs text-muted-foreground truncate">
                       {getLastMessagePreview(conv)}
                     </p>
                     {conv.unread_count > 0 && (
                       <Badge variant="default" className="shrink-0 h-4 min-w-4 px-1 text-[10px]">
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
 
       {/* New conversation button */}
       <div className="p-3 border-t border-border">
         <Button
           onClick={() => setNewDialogOpen(true)}
           className="w-full"
           size="sm"
         >
           <Plus className="h-4 w-4 mr-1.5" />
           New Message
         </Button>
       </div>
 
       <NewConversationDialog
         open={newDialogOpen}
         onOpenChange={setNewDialogOpen}
         onCreated={onSelectConversation}
       />
     </div>
   );
 }