 import { useState } from "react";
 import { Smile } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
 import { GroupedReaction } from "@/hooks/useMessageReactions";
 import EmojiPicker from "emoji-picker-react";
 
 interface MessageReactionsProps {
   reactions: GroupedReaction[];
   onToggle: (emoji: string) => void;
   messageId: string;
 }
 
 const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];
 
 export function MessageReactions({
   reactions,
   onToggle,
   messageId,
 }: MessageReactionsProps) {
   const [pickerOpen, setPickerOpen] = useState(false);
 
   const handleEmojiSelect = (emojiData: any) => {
     onToggle(emojiData.emoji);
     setPickerOpen(false);
   };
 
   return (
     <div className="flex items-center gap-1 mt-1 flex-wrap">
       {/* Existing reactions */}
       {reactions.map((r) => (
         <button
           key={r.emoji}
           onClick={() => onToggle(r.emoji)}
           className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
             r.hasReacted
               ? "bg-primary/10 border-primary/30 text-primary"
               : "bg-muted border-border hover:bg-muted/80"
           }`}
         >
           <span>{r.emoji}</span>
           <span>{r.count}</span>
         </button>
       ))}
 
       {/* Add reaction button */}
       <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
         <PopoverTrigger asChild>
           <Button
             variant="ghost"
             size="icon"
             className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
           >
             <Smile className="h-4 w-4" />
           </Button>
         </PopoverTrigger>
         <PopoverContent className="w-auto p-2" align="start">
           {/* Quick emoji row */}
           <div className="flex gap-1 mb-2 pb-2 border-b">
             {QUICK_EMOJIS.map((emoji) => (
               <button
                 key={emoji}
                 onClick={() => {
                   onToggle(emoji);
                   setPickerOpen(false);
                 }}
                 className="text-xl hover:bg-muted rounded p-1 transition-colors"
               >
                 {emoji}
               </button>
             ))}
           </div>
           <EmojiPicker
             onEmojiClick={handleEmojiSelect}
             width={300}
             height={350}
             skinTonesDisabled
             searchDisabled={false}
             previewConfig={{ showPreview: false }}
           />
         </PopoverContent>
       </Popover>
     </div>
   );
 }