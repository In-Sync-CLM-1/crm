 import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
 import { Button } from "@/components/ui/button";
 import {
   Sheet,
   SheetContent,
   SheetHeader,
   SheetTitle,
 } from "@/components/ui/sheet";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { Badge } from "@/components/ui/badge";
 import { User, Crown, X } from "lucide-react";
 import { ConversationParticipant } from "@/hooks/useConversations";
 import { useGroupParticipants } from "@/hooks/useGroupParticipants";
 import { useAuth } from "@/contexts/AuthProvider";
 import { toast } from "sonner";
 
 interface GroupParticipantsSheetProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   participants: ConversationParticipant[];
   isAdmin: boolean;
   conversationId: string;
 }
 
 export function GroupParticipantsSheet({
   open,
   onOpenChange,
   participants,
   isAdmin,
   conversationId,
 }: GroupParticipantsSheetProps) {
   const { user } = useAuth();
   const { removeParticipant, isRemoving } = useGroupParticipants(conversationId);
 
   const handleRemove = async (userId: string) => {
     try {
       await removeParticipant(userId);
       toast.success("Participant removed");
     } catch (error) {
       toast.error("Failed to remove participant");
     }
   };
 
   return (
     <Sheet open={open} onOpenChange={onOpenChange}>
       <SheetContent>
         <SheetHeader>
           <SheetTitle>Participants ({participants.length})</SheetTitle>
         </SheetHeader>
 
         <ScrollArea className="h-[calc(100vh-8rem)] mt-4">
           <div className="space-y-2">
             {participants.map((p) => (
               <div
                 key={p.user_id}
                 className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
               >
                 <Avatar className="h-10 w-10">
                   <AvatarImage src={p.profile?.avatar_url || undefined} />
                   <AvatarFallback>
                     <User className="h-5 w-5" />
                   </AvatarFallback>
                 </Avatar>
                 <div className="flex-1 min-w-0">
                   <div className="flex items-center gap-2">
                     <span className="font-medium truncate">
                       {p.profile?.full_name || "Unknown"}
                     </span>
                     {p.is_admin && (
                       <Badge variant="secondary" className="shrink-0">
                         <Crown className="h-3 w-3 mr-1" />
                         Admin
                       </Badge>
                     )}
                     {p.user_id === user?.id && (
                       <span className="text-xs text-muted-foreground">(You)</span>
                     )}
                   </div>
                 </div>
                 {isAdmin && p.user_id !== user?.id && (
                   <Button
                     variant="ghost"
                     size="icon"
                     className="h-8 w-8 text-destructive"
                     onClick={() => handleRemove(p.user_id)}
                     disabled={isRemoving}
                   >
                     <X className="h-4 w-4" />
                   </Button>
                 )}
               </div>
             ))}
           </div>
         </ScrollArea>
       </SheetContent>
     </Sheet>
   );
 }