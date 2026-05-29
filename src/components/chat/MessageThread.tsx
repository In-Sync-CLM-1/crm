 import { useEffect, useRef } from "react";
 import { format, isToday, isYesterday, isSameDay } from "date-fns";
 import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
 import { Skeleton } from "@/components/ui/skeleton";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { ChatMessage } from "@/hooks/useMessages";
 import { MessageReactions } from "./MessageReactions";
 import { FileAttachment } from "./FileAttachment";
 import { TaskShareCard } from "./TaskShareCard";
 import { useMessageReactions } from "@/hooks/useMessageReactions";
 import { User } from "lucide-react";
 
 interface MessageThreadProps {
   messages: ChatMessage[];
   isLoading: boolean;
   currentUserId: string;
   conversationId: string;
   onMarkAsRead: () => void;
 }
 
 export function MessageThread({
   messages,
   isLoading,
   currentUserId,
   conversationId,
   onMarkAsRead,
 }: MessageThreadProps) {
   const scrollRef = useRef<HTMLDivElement>(null);
   const { getGroupedReactions, toggleReaction } = useMessageReactions(conversationId);
 
   // Auto-scroll to bottom when new messages arrive
   useEffect(() => {
     if (scrollRef.current) {
       scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
     }
   }, [messages]);
 
   // Mark as read when viewing
   useEffect(() => {
     if (messages.length > 0) {
       onMarkAsRead();
     }
   }, [messages.length, onMarkAsRead]);
 
   const formatDateDivider = (date: Date) => {
     if (isToday(date)) return "Today";
     if (isYesterday(date)) return "Yesterday";
     return format(date, "MMMM d, yyyy");
   };
 
   const shouldShowDateDivider = (index: number) => {
     if (index === 0) return true;
     const currentDate = new Date(messages[index].created_at);
     const prevDate = new Date(messages[index - 1].created_at);
     return !isSameDay(currentDate, prevDate);
   };
 
   if (isLoading) {
     return (
       <ScrollArea className="flex-1 p-4">
         <div className="space-y-4">
           {[...Array(5)].map((_, i) => (
             <div key={i} className={`flex gap-3 ${i % 2 === 0 ? "" : "flex-row-reverse"}`}>
               <Skeleton className="h-8 w-8 rounded-full shrink-0" />
               <Skeleton className={`h-16 ${i % 2 === 0 ? "w-2/3" : "w-1/2"} rounded-lg`} />
             </div>
           ))}
         </div>
       </ScrollArea>
     );
   }
 
   return (
     <ScrollArea className="flex-1" ref={scrollRef}>
       <div className="p-4 space-y-4">
         {messages.length === 0 ? (
           <div className="text-center py-8 text-muted-foreground">
             <p>No messages yet. Start the conversation!</p>
           </div>
         ) : (
           messages.map((message, index) => {
             const isOwn = message.sender_id === currentUserId;
             const showDivider = shouldShowDateDivider(index);
             const reactions = getGroupedReactions(message.id);
 
             return (
               <div key={message.id}>
                 {showDivider && (
                   <div className="flex items-center justify-center my-4">
                     <div className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                       {formatDateDivider(new Date(message.created_at))}
                     </div>
                   </div>
                 )}
 
                 <div
                   className={`flex gap-2 group ${
                     isOwn ? "flex-row-reverse" : ""
                   }`}
                 >
                   {!isOwn && (
                     <Avatar className="h-8 w-8 shrink-0">
                       <AvatarImage src={message.sender?.avatar_url || undefined} />
                       <AvatarFallback>
                         <User className="h-4 w-4" />
                       </AvatarFallback>
                     </Avatar>
                   )}
 
                   <div className={`max-w-[70%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                     {!isOwn && message.sender?.full_name && (
                       <span className="text-xs text-muted-foreground mb-1 px-1">
                         {message.sender.full_name}
                       </span>
                     )}
 
                     <div
                       className={`rounded-2xl px-4 py-2 ${
                         isOwn
                           ? "bg-primary text-primary-foreground rounded-tr-sm"
                           : "bg-muted rounded-tl-sm"
                       }`}
                     >
                       {message.message_type === "text" && (
                         <p className="text-sm whitespace-pre-wrap break-words">
                           {message.content}
                         </p>
                       )}
                       {message.message_type === "file" && (
                         <FileAttachment
                           url={message.file_url || ""}
                           name={message.file_name || "File"}
                           size={message.file_size || 0}
                         />
                       )}
                       {message.message_type === "task_share" && message.task_id && (
                         <TaskShareCard taskId={message.task_id} />
                       )}
                     </div>
 
                     <div className="flex items-center gap-2 mt-1 px-1">
                       <span className="text-[10px] text-muted-foreground">
                         {format(new Date(message.created_at), "h:mm a")}
                       </span>
                       {message.is_edited && (
                         <span className="text-[10px] text-muted-foreground">(edited)</span>
                       )}
                     </div>
 
                     <MessageReactions
                       reactions={reactions}
                       onToggle={(emoji) => toggleReaction({ messageId: message.id, emoji })}
                       messageId={message.id}
                     />
                   </div>
                 </div>
               </div>
             );
           })
         )}
       </div>
     </ScrollArea>
   );
 }