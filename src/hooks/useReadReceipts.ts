 import { useQuery } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useCallback, useEffect } from "react";
 import { useQueryClient } from "@tanstack/react-query";
 
 export interface ReadReceipt {
   user_id: string;
   last_read_at: string;
   profile: {
     full_name: string | null;
     avatar_url: string | null;
   } | null;
 }
 
 export function useReadReceipts(
   conversationId: string | null,
   currentUserId: string | null
 ) {
   const queryClient = useQueryClient();
 
   const query = useQuery({
     queryKey: ["chat-read-receipts", conversationId],
     queryFn: async (): Promise<ReadReceipt[]> => {
       if (!conversationId) return [];
 
       const { data: participants, error } = await supabase
         .from("chat_participants")
         .select("user_id, last_read_at")
         .eq("conversation_id", conversationId);
 
       if (error) throw error;
       if (!participants?.length) return [];
 
       // Get profiles
       const userIds = participants.map((p) => p.user_id);
       const { data: profiles } = await supabase
         .from("profiles")
         .select("id, first_name, last_name, avatar_url")
         .in("id", userIds);
 
       const profileMap = new Map(
         profiles?.map((p) => [
           p.id,
           {
             full_name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || null,
             avatar_url: p.avatar_url,
           },
         ])
       );
 
       return participants.map((p) => ({
         user_id: p.user_id,
         last_read_at: p.last_read_at || "",
         profile: profileMap.get(p.user_id) || null,
       }));
     },
     enabled: !!conversationId,
     staleTime: 30000,
   });
 
   // Real-time subscription for read receipt updates
   useEffect(() => {
     if (!conversationId) return;
 
     const channel = supabase
       .channel(`read-receipts-${conversationId}`)
       .on(
         "postgres_changes",
         {
           event: "UPDATE",
           schema: "public",
           table: "chat_participants",
           filter: `conversation_id=eq.${conversationId}`,
         },
         () => {
           queryClient.invalidateQueries({
             queryKey: ["chat-read-receipts", conversationId],
           });
         }
       )
       .subscribe();
 
     return () => {
       supabase.removeChannel(channel);
     };
   }, [conversationId, queryClient]);
 
   const getMessageReadReceipts = useCallback(
     (messageCreatedAt: string): ReadReceipt[] => {
       if (!query.data) return [];
       return query.data.filter(
         (r) =>
           r.user_id !== currentUserId &&
           new Date(r.last_read_at) >= new Date(messageCreatedAt)
       );
     },
     [query.data, currentUserId]
   );
 
   const isReadByAll = useCallback(
     (messageCreatedAt: string): boolean => {
       if (!query.data) return false;
       const others = query.data.filter((r) => r.user_id !== currentUserId);
       return others.every(
         (r) => new Date(r.last_read_at) >= new Date(messageCreatedAt)
       );
     },
     [query.data, currentUserId]
   );
 
   return {
     receipts: query.data || [],
     isLoading: query.isLoading,
     getMessageReadReceipts,
     isReadByAll,
   };
 }