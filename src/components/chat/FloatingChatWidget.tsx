 import { useState } from "react";
 import { useLocation } from "react-router-dom";
 import { MessageSquare, X, Minus, ExternalLink } from "lucide-react";
 import { Link } from "react-router-dom";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { useTotalUnreadCount, useConversations } from "@/hooks/useConversations";
 import { useMessages } from "@/hooks/useMessages";
 import { useAuth } from "@/contexts/AuthProvider";
 import { CompactConversationList } from "./CompactConversationList";
 import { CompactChatView } from "./CompactChatView";
 
 export function FloatingChatWidget() {
   const location = useLocation();
   const { user } = useAuth();
   const totalUnread = useTotalUnreadCount();
   const [isOpen, setIsOpen] = useState(false);
   const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
 
   // Hide on chat page to avoid duplication
   if (location.pathname.startsWith("/chat")) {
     return null;
   }
 
   // Don't show if not logged in
   if (!user) {
     return null;
   }
 
   return (
     <div className="fixed bottom-6 right-6 z-50">
       {/* Collapsed: Floating button */}
       {!isOpen && (
         <Button
           onClick={() => setIsOpen(true)}
           size="icon"
           className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
         >
           <MessageSquare className="h-6 w-6" />
           {totalUnread > 0 && (
             <Badge
               variant="destructive"
               className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center"
             >
               {totalUnread > 99 ? "99+" : totalUnread}
             </Badge>
           )}
         </Button>
       )}
 
       {/* Expanded: Widget panel */}
       {isOpen && (
         <div className="w-[380px] h-[500px] max-h-[calc(100vh-120px)] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
           {/* Header */}
           <div className="h-12 border-b border-border px-4 flex items-center justify-between bg-muted/30">
             {activeConversationId ? (
               <Button
                 variant="ghost"
                 size="sm"
                 onClick={() => setActiveConversationId(null)}
                 className="text-sm font-medium"
               >
                 ← Back
               </Button>
             ) : (
               <span className="font-semibold">Messages</span>
             )}
 
             <div className="flex items-center gap-1">
               <Link to="/chat">
                 <Button variant="ghost" size="icon" className="h-8 w-8">
                   <ExternalLink className="h-4 w-4" />
                 </Button>
               </Link>
               <Button
                 variant="ghost"
                 size="icon"
                 className="h-8 w-8"
                 onClick={() => setIsOpen(false)}
               >
                 <Minus className="h-4 w-4" />
               </Button>
               <Button
                 variant="ghost"
                 size="icon"
                 className="h-8 w-8"
                 onClick={() => {
                   setIsOpen(false);
                   setActiveConversationId(null);
                 }}
               >
                 <X className="h-4 w-4" />
               </Button>
             </div>
           </div>
 
           {/* Content */}
           <div className="flex-1 overflow-hidden">
             {activeConversationId ? (
               <CompactChatView
                 conversationId={activeConversationId}
                 onBack={() => setActiveConversationId(null)}
               />
             ) : (
               <CompactConversationList
                 onSelectConversation={setActiveConversationId}
               />
             )}
           </div>
         </div>
       )}
     </div>
   );
 }