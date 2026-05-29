 import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/contexts/AuthProvider";
 import { useCallback, useEffect, useRef } from "react";
 
 export interface ChatMessage {
   id: string;
   conversation_id: string;
   sender_id: string;
   content: string | null;
   message_type: "text" | "file" | "task_share";
   task_id: string | null;
   file_url: string | null;
   file_name: string | null;
   file_size: number | null;
   is_edited: boolean;
   created_at: string;
   updated_at: string;
   sender?: {
     id: string;
     full_name: string | null;
     avatar_url: string | null;
   } | null;
 }
 
 export function useMessages(conversationId: string | null) {
   const { user } = useAuth();
   const queryClient = useQueryClient();
   // Track temp IDs to avoid duplicates when realtime delivers the real message
   const pendingMessageIds = useRef<Set<string>>(new Set());
 
   const query = useQuery({
     queryKey: ["chat-messages", conversationId],
     queryFn: async (): Promise<ChatMessage[]> => {
       if (!conversationId) return [];
 
       const { data: messages, error } = await supabase
         .from("chat_messages")
         .select("*")
         .eq("conversation_id", conversationId)
         .order("created_at", { ascending: true })
         .limit(100);
 
       if (error) throw error;
       if (!messages?.length) return [];
 
       // Get sender profiles
       const senderIds = [...new Set(messages.map((m) => m.sender_id))];
       const { data: profiles } = await supabase
         .from("profiles")
         .select("id, first_name, last_name, avatar_url")
         .in("id", senderIds);
 
       const profileMap = new Map(
         profiles?.map((p) => [
           p.id,
           {
             id: p.id,
             full_name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || null,
             avatar_url: p.avatar_url,
           },
         ])
       );
 
       return messages.map((m) => ({
         ...m,
         message_type: m.message_type as "text" | "file" | "task_share",
         sender: profileMap.get(m.sender_id) || null,
       }));
     },
     enabled: !!conversationId,
     staleTime: 10000,
   });
 
   // Real-time subscription for new messages
   useEffect(() => {
     if (!conversationId) return;
 
     const channel = supabase
       .channel(`chat-messages-${conversationId}`)
       .on(
         "postgres_changes",
         {
           event: "INSERT",
           schema: "public",
           table: "chat_messages",
           filter: `conversation_id=eq.${conversationId}`,
         },
         async (payload) => {
             // Skip if this is a message we just sent (we already have it optimistically)
             if (pendingMessageIds.current.has(payload.new.id)) {
               pendingMessageIds.current.delete(payload.new.id);
               return;
             }
 
           // Get sender profile for the new message
           const { data: profile } = await supabase
             .from("profiles")
             .select("id, first_name, last_name, avatar_url")
             .eq("id", payload.new.sender_id)
             .single();
 
           const newMessage: ChatMessage = {
             ...(payload.new as any),
             message_type: payload.new.message_type as "text" | "file" | "task_share",
             sender: profile
               ? {
                   id: profile.id,
                   full_name: `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || null,
                   avatar_url: profile.avatar_url,
                 }
               : null,
           };
 
           queryClient.setQueryData<ChatMessage[]>(
             ["chat-messages", conversationId],
             (old) => {
               if (!old) return [newMessage];
               // Avoid duplicates
               if (old.some((m) => m.id === newMessage.id)) return old;
               return [...old, newMessage];
             }
           );
         }
       )
       .on(
         "postgres_changes",
         {
           event: "UPDATE",
           schema: "public",
           table: "chat_messages",
           filter: `conversation_id=eq.${conversationId}`,
         },
         (payload) => {
           queryClient.setQueryData<ChatMessage[]>(
             ["chat-messages", conversationId],
             (old) => {
               if (!old) return old;
               return old.map((m) =>
                 m.id === payload.new.id
                   ? { ...m, ...(payload.new as any), message_type: payload.new.message_type as "text" | "file" | "task_share" }
                   : m
               );
             }
           );
         }
       )
       .subscribe();
 
     return () => {
       supabase.removeChannel(channel);
     };
   }, [conversationId, queryClient]);
 
   const sendMessageMutation = useMutation({
     mutationFn: async ({
       content,
       messageType = "text",
       taskId,
       fileUrl,
       fileName,
       fileSize,
     }: {
       content?: string;
       messageType?: "text" | "file" | "task_share";
       taskId?: string;
       fileUrl?: string;
       fileName?: string;
       fileSize?: number;
     }) => {
       if (!conversationId || !user?.id) throw new Error("Not ready");
 
       const { data, error } = await supabase
         .from("chat_messages")
         .insert({
           conversation_id: conversationId,
           sender_id: user.id,
           content: content || null,
           message_type: messageType,
           task_id: taskId || null,
           file_url: fileUrl || null,
           file_name: fileName || null,
           file_size: fileSize || null,
         })
         .select()
         .single();
 
       if (error) throw error;
       return data;
     },
     onMutate: async ({ content, messageType = "text" }) => {
       // Optimistic update
       const optimisticMessage: ChatMessage = {
         id: `temp-${Date.now()}`,
         conversation_id: conversationId!,
         sender_id: user?.id || "",
         content: content || null,
         message_type: messageType,
         task_id: null,
         file_url: null,
         file_name: null,
         file_size: null,
         is_edited: false,
         created_at: new Date().toISOString(),
         updated_at: new Date().toISOString(),
           sender: {
             id: user?.id || "",
             full_name: null,
             avatar_url: null,
           },
       };
 
       queryClient.setQueryData<ChatMessage[]>(
         ["chat-messages", conversationId],
         (old) => [...(old || []), optimisticMessage]
       );
 
       return { optimisticMessage };
     },
       onSuccess: (data, vars, context) => {
         // Mark this message ID as pending so realtime doesn't duplicate it
         pendingMessageIds.current.add(data.id);
 
         // Replace optimistic message with real one
         if (context?.optimisticMessage) {
           queryClient.setQueryData<ChatMessage[]>(
             ["chat-messages", conversationId],
             (old) => {
               if (!old) return old;
               return old.map((m) =>
                 m.id === context.optimisticMessage.id
                   ? {
                       ...data,
                       message_type: data.message_type as "text" | "file" | "task_share",
                       sender: context.optimisticMessage.sender,
                     }
                   : m
               );
             }
           );
         }
       },
     onError: (err, vars, context) => {
       // Remove optimistic message on error
       if (context?.optimisticMessage) {
         queryClient.setQueryData<ChatMessage[]>(
           ["chat-messages", conversationId],
           (old) => old?.filter((m) => m.id !== context.optimisticMessage.id)
         );
       }
     },
   });
 
   const markAsRead = useCallback(async () => {
     if (!conversationId || !user?.id) return;
 
     await supabase
       .from("chat_participants")
       .update({ last_read_at: new Date().toISOString() })
       .eq("conversation_id", conversationId)
       .eq("user_id", user.id);
 
     // Invalidate conversations to update unread counts
     queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
   }, [conversationId, user?.id, queryClient]);
 
   return {
     messages: query.data || [],
     isLoading: query.isLoading,
     error: query.error,
     sendMessage: sendMessageMutation.mutateAsync,
     isSending: sendMessageMutation.isPending,
     markAsRead,
   };
 }