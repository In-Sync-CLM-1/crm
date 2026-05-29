 import { useConversations } from "@/hooks/useConversations";
 import { useMessages } from "@/hooks/useMessages";
 import { useAuth } from "@/contexts/AuthProvider";
 import { MessageThread } from "./MessageThread";
 import { MessageInput } from "./MessageInput";
 import { Skeleton } from "@/components/ui/skeleton";
 
 interface CompactChatViewProps {
   conversationId: string;
   onBack: () => void;
 }
 
 export function CompactChatView({
   conversationId,
   onBack,
 }: CompactChatViewProps) {
   const { user } = useAuth();
   const { conversations } = useConversations();
   const {
     messages,
     isLoading,
     sendMessage,
     isSending,
     markAsRead,
   } = useMessages(conversationId);
 
   const conversation = conversations.find((c) => c.id === conversationId);
 
   if (!conversation) {
     return (
       <div className="h-full flex flex-col p-4">
         <Skeleton className="h-4 w-1/2 mb-4" />
         <div className="flex-1 space-y-3">
           {[...Array(3)].map((_, i) => (
             <Skeleton key={i} className="h-12 w-3/4" />
           ))}
         </div>
       </div>
     );
   }
 
   // Get display name
   const getDisplayName = () => {
     if (conversation.conversation_type === "group") {
       return conversation.name || "Group Chat";
     }
     const other = conversation.participants.find((p) => p.user_id !== user?.id);
     return other?.profile?.full_name || "Chat";
   };
 
   return (
     <div className="h-full flex flex-col">
       {/* Compact header with name */}
       <div className="px-4 py-2 border-b border-border">
         <h3 className="text-sm font-medium truncate">{getDisplayName()}</h3>
         {conversation.conversation_type === "group" && (
           <p className="text-xs text-muted-foreground">
             {conversation.participants.length} members
           </p>
         )}
       </div>
 
       {/* Messages */}
       <div className="flex-1 overflow-hidden">
         <MessageThread
           messages={messages}
           isLoading={isLoading}
           currentUserId={user?.id || ""}
           conversationId={conversationId}
           onMarkAsRead={markAsRead}
         />
       </div>
 
       {/* Input */}
       <MessageInput
         conversationId={conversationId}
         onSend={sendMessage}
         isSending={isSending}
       />
     </div>
   );
 }