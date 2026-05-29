 import { useState, useRef, KeyboardEvent } from "react";
 import { Send, Paperclip, X, Loader2 } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Textarea } from "@/components/ui/textarea";
 import { useChatFileUpload } from "@/hooks/useChatFileUpload";
 import { toast } from "sonner";
 
 interface MessageInputProps {
   conversationId: string;
   onSend: (params: {
     content?: string;
     messageType?: "text" | "file" | "task_share";
     fileUrl?: string;
     fileName?: string;
     fileSize?: number;
   }) => Promise<any>;
   isSending: boolean;
 }
 
 export function MessageInput({
   conversationId,
   onSend,
   isSending,
 }: MessageInputProps) {
   const [message, setMessage] = useState("");
   const [pendingFile, setPendingFile] = useState<File | null>(null);
   const fileInputRef = useRef<HTMLInputElement>(null);
   const { uploadFile, isUploading } = useChatFileUpload();
 
   const handleSend = async () => {
     const trimmedMessage = message.trim();
 
     if (pendingFile) {
       // Upload file first
       const result = await uploadFile(pendingFile, conversationId);
       if (result) {
         await onSend({
           content: trimmedMessage || null,
           messageType: "file",
           fileUrl: result.url,
           fileName: result.name,
           fileSize: result.size,
         });
         setPendingFile(null);
         setMessage("");
       } else {
         toast.error("Failed to upload file");
       }
       return;
     }
 
     if (!trimmedMessage) return;
 
     await onSend({ content: trimmedMessage, messageType: "text" });
     setMessage("");
   };
 
   const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
     if (e.key === "Enter" && !e.shiftKey) {
       e.preventDefault();
       handleSend();
     }
   };
 
   const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (file) {
       // Check size limits
       const maxSize = file.type.startsWith("image/") ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
       if (file.size > maxSize) {
         toast.error(`File too large. Max ${file.type.startsWith("image/") ? "5MB" : "10MB"}`);
         return;
       }
       setPendingFile(file);
     }
     if (fileInputRef.current) {
       fileInputRef.current.value = "";
     }
   };
 
   const isDisabled = isSending || isUploading || (!message.trim() && !pendingFile);
 
   return (
     <div className="border-t border-border p-4 bg-background">
       {/* Pending file preview */}
       {pendingFile && (
         <div className="mb-3 flex items-center gap-2 bg-muted rounded-lg p-2">
           <Paperclip className="h-4 w-4 text-muted-foreground" />
           <span className="text-sm truncate flex-1">{pendingFile.name}</span>
           <span className="text-xs text-muted-foreground">
             {(pendingFile.size / 1024).toFixed(1)} KB
           </span>
           <Button
             variant="ghost"
             size="icon"
             className="h-6 w-6"
             onClick={() => setPendingFile(null)}
           >
             <X className="h-4 w-4" />
           </Button>
         </div>
       )}
 
       <div className="flex items-end gap-2">
         <input
           type="file"
           ref={fileInputRef}
           onChange={handleFileSelect}
           className="hidden"
           accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
         />
 
         <Button
           variant="ghost"
           size="icon"
           onClick={() => fileInputRef.current?.click()}
           disabled={isSending || isUploading}
         >
           <Paperclip className="h-5 w-5" />
         </Button>
 
         <Textarea
           value={message}
           onChange={(e) => setMessage(e.target.value)}
           onKeyDown={handleKeyDown}
           placeholder="Type a message..."
           className="min-h-[40px] max-h-[120px] resize-none"
           rows={1}
         />
 
         <Button
           onClick={handleSend}
           disabled={isDisabled}
           size="icon"
         >
           {isSending || isUploading ? (
             <Loader2 className="h-5 w-5 animate-spin" />
           ) : (
             <Send className="h-5 w-5" />
           )}
         </Button>
       </div>
     </div>
   );
 }