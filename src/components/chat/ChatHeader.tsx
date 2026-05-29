 import { useState } from "react";
 import { useNavigate } from "react-router-dom";
 import { Menu, Users, User, MoreVertical, UserPlus, LogOut } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
 } from "@/components/ui/dropdown-menu";
 import { Conversation } from "@/hooks/useConversations";
 import { useAuth } from "@/contexts/AuthProvider";
 import { useGroupParticipants } from "@/hooks/useGroupParticipants";
 import { GroupParticipantsSheet } from "./GroupParticipantsSheet";
 import { AddParticipantsDialog } from "./AddParticipantsDialog";
 import { toast } from "sonner";
 
 interface ChatHeaderProps {
   conversation: Conversation;
   name: string;
   onToggleSidebar: () => void;
 }
 
 export function ChatHeader({
   conversation,
   name,
   onToggleSidebar,
 }: ChatHeaderProps) {
   const navigate = useNavigate();
   const { user } = useAuth();
   const { leaveGroup, isLeaving } = useGroupParticipants(conversation.id);
   const [participantsOpen, setParticipantsOpen] = useState(false);
   const [addParticipantsOpen, setAddParticipantsOpen] = useState(false);
 
   const isGroup = conversation.conversation_type === "group";
   const isAdmin = conversation.participants.find(
     (p) => p.user_id === user?.id
   )?.is_admin;
 
   const otherParticipant = conversation.participants.find(
     (p) => p.user_id !== user?.id
   );
 
   const handleLeaveGroup = async () => {
     try {
       await leaveGroup();
       toast.success("You left the group");
       navigate("/chat");
     } catch (error) {
       toast.error("Failed to leave group");
     }
   };
 
   return (
     <div className="h-16 border-b border-border px-4 flex items-center gap-3 bg-background">
       <Button
         variant="ghost"
         size="icon"
         className="lg:hidden"
         onClick={onToggleSidebar}
       >
         <Menu className="h-5 w-5" />
       </Button>
 
       <Avatar className="h-10 w-10">
         <AvatarImage src={otherParticipant?.profile?.avatar_url || undefined} />
         <AvatarFallback>
           {isGroup ? <Users className="h-5 w-5" /> : <User className="h-5 w-5" />}
         </AvatarFallback>
       </Avatar>
 
       <div className="flex-1 min-w-0">
         <h3 className="font-medium truncate">{name}</h3>
         {isGroup && (
           <p className="text-xs text-muted-foreground">
             {conversation.participants.length} members
           </p>
         )}
       </div>
 
       <DropdownMenu>
         <DropdownMenuTrigger asChild>
           <Button variant="ghost" size="icon">
             <MoreVertical className="h-5 w-5" />
           </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end">
           {isGroup && (
             <>
               <DropdownMenuItem onClick={() => setParticipantsOpen(true)}>
                 <Users className="h-4 w-4 mr-2" />
                 View Participants
               </DropdownMenuItem>
               {isAdmin && (
                 <DropdownMenuItem onClick={() => setAddParticipantsOpen(true)}>
                   <UserPlus className="h-4 w-4 mr-2" />
                   Add Members
                 </DropdownMenuItem>
               )}
               <DropdownMenuSeparator />
               <DropdownMenuItem
                 onClick={handleLeaveGroup}
                 disabled={isLeaving}
                 className="text-destructive"
               >
                 <LogOut className="h-4 w-4 mr-2" />
                 Leave Group
               </DropdownMenuItem>
             </>
           )}
           {!isGroup && (
             <DropdownMenuItem onClick={() => setParticipantsOpen(true)}>
               <User className="h-4 w-4 mr-2" />
               View Profile
             </DropdownMenuItem>
           )}
         </DropdownMenuContent>
       </DropdownMenu>
 
       <GroupParticipantsSheet
         open={participantsOpen}
         onOpenChange={setParticipantsOpen}
         participants={conversation.participants}
         isAdmin={isAdmin || false}
         conversationId={conversation.id}
       />
 
       <AddParticipantsDialog
         open={addParticipantsOpen}
         onOpenChange={setAddParticipantsOpen}
         conversationId={conversation.id}
         existingParticipantIds={conversation.participants.map((p) => p.user_id)}
       />
     </div>
   );
 }