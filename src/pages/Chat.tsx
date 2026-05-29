 import { useState } from "react";
 import { useParams, useNavigate } from "react-router-dom";
 import DashboardLayout from "@/components/Layout/DashboardLayout";
 import { ConversationList } from "@/components/chat/ConversationList";
 import { MessageThread } from "@/components/chat/MessageThread";
 import { MessageInput } from "@/components/chat/MessageInput";
 import { ChatHeader } from "@/components/chat/ChatHeader";
 import { useConversations } from "@/hooks/useConversations";
 import { useMessages } from "@/hooks/useMessages";
 import { useAuth } from "@/contexts/AuthProvider";
 import { MessageSquare } from "lucide-react";
 
 export default function Chat() {
   const { conversationId } = useParams();
   const navigate = useNavigate();
   const { user } = useAuth();
   const { conversations, isLoading: conversationsLoading } = useConversations();
   const {
     messages,
     isLoading: messagesLoading,
     sendMessage,
     isSending,
     markAsRead,
   } = useMessages(conversationId || null);
 
   const [showSidebar, setShowSidebar] = useState(true);
 
   const currentConversation = conversations.find((c) => c.id === conversationId);
 
   // Get display name for conversation
   const getConversationName = () => {
     if (!currentConversation) return "";
     if (currentConversation.conversation_type === "group") {
       return currentConversation.name || "Group Chat";
     }
     // For direct messages, show the other person's name
     const otherParticipant = currentConversation.participants.find(
       (p) => p.user_id !== user?.id
     );
     return otherParticipant?.profile?.full_name || "Chat";
   };
 
   const handleSelectConversation = (id: string) => {
     navigate(`/chat/${id}`);
   };
 
   return (
     <DashboardLayout>
       <div className="flex h-[calc(100vh-4rem)] bg-background">
         {/* Conversation List Sidebar */}
         <div
           className={`${
             showSidebar ? "w-80" : "w-0"
           } border-r border-border transition-all duration-200 overflow-hidden flex-shrink-0`}
         >
           <ConversationList
             conversations={conversations}
             isLoading={conversationsLoading}
             selectedId={conversationId}
             onSelect={handleSelectConversation}
           />
         </div>
 
         {/* Main Chat Area */}
         <div className="flex-1 flex flex-col min-w-0">
           {conversationId && currentConversation ? (
             <>
               <ChatHeader
                 conversation={currentConversation}
                 name={getConversationName()}
                 onToggleSidebar={() => setShowSidebar(!showSidebar)}
               />
               <MessageThread
                 messages={messages}
                 isLoading={messagesLoading}
                 currentUserId={user?.id || ""}
                 conversationId={conversationId}
                 onMarkAsRead={markAsRead}
               />
               <MessageInput
                 conversationId={conversationId}
                 onSend={sendMessage}
                 isSending={isSending}
               />
             </>
           ) : (
             <div className="flex-1 flex items-center justify-center text-muted-foreground">
               <div className="text-center">
                 <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                 <p className="text-lg font-medium">Select a conversation</p>
                 <p className="text-sm">Choose a chat from the sidebar to start messaging</p>
               </div>
             </div>
           )}
         </div>
       </div>
     </DashboardLayout>
   );
 }