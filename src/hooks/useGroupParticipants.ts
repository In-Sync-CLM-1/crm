 import { useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/contexts/AuthProvider";
 
 export function useGroupParticipants(conversationId: string | null) {
   const { user } = useAuth();
   const queryClient = useQueryClient();
 
   const addParticipantsMutation = useMutation({
     mutationFn: async (userIds: string[]) => {
       if (!conversationId) throw new Error("No conversation");
 
       const { error } = await supabase.from("chat_participants").insert(
         userIds.map((uid) => ({
           conversation_id: conversationId,
           user_id: uid,
           is_admin: false,
         }))
       );
 
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
       queryClient.invalidateQueries({
         queryKey: ["chat-read-receipts", conversationId],
       });
     },
   });
 
   const removeParticipantMutation = useMutation({
     mutationFn: async (userId: string) => {
       if (!conversationId) throw new Error("No conversation");
 
       const { error } = await supabase
         .from("chat_participants")
         .delete()
         .eq("conversation_id", conversationId)
         .eq("user_id", userId);
 
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
     },
   });
 
   const leaveGroupMutation = useMutation({
     mutationFn: async () => {
       if (!conversationId || !user?.id) throw new Error("Not ready");
 
       const { error } = await supabase
         .from("chat_participants")
         .delete()
         .eq("conversation_id", conversationId)
         .eq("user_id", user.id);
 
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
     },
   });
 
   return {
     addParticipants: addParticipantsMutation.mutateAsync,
     removeParticipant: removeParticipantMutation.mutateAsync,
     leaveGroup: leaveGroupMutation.mutateAsync,
     isAdding: addParticipantsMutation.isPending,
     isRemoving: removeParticipantMutation.isPending,
     isLeaving: leaveGroupMutation.isPending,
   };
 }