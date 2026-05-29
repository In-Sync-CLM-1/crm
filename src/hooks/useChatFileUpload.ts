 import { useState } from "react";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/contexts/AuthProvider";
 
 export function useChatFileUpload() {
   const { user } = useAuth();
   const [isUploading, setIsUploading] = useState(false);
   const [progress, setProgress] = useState(0);
 
   const uploadFile = async (
     file: File,
     conversationId: string
   ): Promise<{ url: string; name: string; size: number } | null> => {
     if (!user?.id) return null;
 
     setIsUploading(true);
     setProgress(0);
 
     try {
       const timestamp = Date.now();
       const ext = file.name.split(".").pop();
       const path = `${user.id}/${conversationId}/${timestamp}.${ext}`;
 
       const { error } = await supabase.storage
         .from("chat-attachments")
         .upload(path, file, {
           cacheControl: "3600",
           upsert: false,
         });
 
       if (error) throw error;
 
       setProgress(100);
 
       // Get signed URL
       const { data: signedData } = await supabase.storage
         .from("chat-attachments")
         .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
 
       return {
         url: signedData?.signedUrl || "",
         name: file.name,
         size: file.size,
       };
     } catch (error) {
       console.error("File upload error:", error);
       return null;
     } finally {
       setIsUploading(false);
     }
   };
 
   const getSignedUrl = async (path: string): Promise<string | null> => {
     const { data } = await supabase.storage
       .from("chat-attachments")
       .createSignedUrl(path, 60 * 60); // 1 hour
     return data?.signedUrl || null;
   };
 
   return {
     uploadFile,
     getSignedUrl,
     isUploading,
     progress,
   };
 }