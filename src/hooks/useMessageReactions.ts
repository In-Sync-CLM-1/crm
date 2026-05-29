 import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/contexts/AuthProvider";
 import { useEffect, useCallback } from "react";
 
 export interface MessageReaction {
   id: string;
   message_id: string;
   user_id: string;
   emoji: string;
   created_at: string;
 }
 
 export interface GroupedReaction {
   emoji: string;
   count: number;
   users: string[];
   hasReacted: boolean;
 }
 
 export function useMessageReactions(conversationId: string | null) {
   const { user } = useAuth();
   const queryClient = useQueryClient();
 
   const query = useQuery({
     queryKey: ["chat-reactions", conversationId],
     queryFn: async (): Promise<MessageReaction[]> => {
       if (!conversationId) return [];
 
       // Get all message IDs for this conversation
       const { data: messages } = await supabase
         .from("chat_messages")
         .select("id")
         .eq("conversation_id", conversationId);
 
       if (!messages?.length) return [];
 
       const messageIds = messages.map((m) => m.id);
 
       const { data: reactions, error } = await supabase
         .from("chat_message_reactions")
         .select("*")
         .in("message_id", messageIds);
 
       if (error) throw error;
       return reactions || [];
     },
     enabled: !!conversationId,
     staleTime: 30000,
   });
 
   // Real-time subscription
   useEffect(() => {
     if (!conversationId) return;
 
     const channel = supabase
       .channel(`chat-reactions-${conversationId}`)
       .on(
         "postgres_changes",
         { event: "*", schema: "public", table: "chat_message_reactions" },
         () => {
           queryClient.invalidateQueries({
             queryKey: ["chat-reactions", conversationId],
           });
         }
       )
       .subscribe();
 
     return () => {
       supabase.removeChannel(channel);
     };
   }, [conversationId, queryClient]);
 
   const toggleReactionMutation = useMutation({
     mutationFn: async ({
       messageId,
       emoji,
     }: {
       messageId: string;
       emoji: string;
     }) => {
       if (!user?.id) throw new Error("Not authenticated");
 
       // Check if user already reacted with this emoji
       const { data: existing } = await supabase
         .from("chat_message_reactions")
         .select("id")
         .eq("message_id", messageId)
         .eq("user_id", user.id)
         .eq("emoji", emoji)
         .single();
 
       if (existing) {
         // Remove reaction
         await supabase
           .from("chat_message_reactions")
           .delete()
           .eq("id", existing.id);
       } else {
         // Add reaction
         await supabase.from("chat_message_reactions").insert({
           message_id: messageId,
           user_id: user.id,
           emoji,
         });
       }
     },
     onSuccess: () => {
       queryClient.invalidateQueries({
         queryKey: ["chat-reactions", conversationId],
       });
     },
   });
 
   const getGroupedReactions = useCallback(
     (messageId: string): GroupedReaction[] => {
       const reactions = query.data?.filter((r) => r.message_id === messageId) || [];
       const emojiMap = new Map<string, { count: number; users: string[] }>();
 
       reactions.forEach((r) => {
         const existing = emojiMap.get(r.emoji);
         if (existing) {
           existing.count++;
           existing.users.push(r.user_id);
         } else {
           emojiMap.set(r.emoji, { count: 1, users: [r.user_id] });
         }
       });
 
       return Array.from(emojiMap.entries()).map(([emoji, data]) => ({
         emoji,
         count: data.count,
         users: data.users,
         hasReacted: data.users.includes(user?.id || ""),
       }));
     },
     [query.data, user?.id]
   );
 
   return {
     reactions: query.data || [],
     isLoading: query.isLoading,
     toggleReaction: toggleReactionMutation.mutate,
     getGroupedReactions,
   };
 }