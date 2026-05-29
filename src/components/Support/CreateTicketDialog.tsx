import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { X, Upload, Image, Video } from "lucide-react";
import { toast } from "sonner";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov"];
const MAX_IMAGES = 6;
const MAX_VIDEOS = 2;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 10 * 1024 * 1024;

interface SelectedFile {
  file: File;
  type: "image" | "video";
  preview?: string;
}

export interface CreateTicketData {
  subject: string;
  description: string;
  category: string;
  priority: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  company_name: string;
  attachments?: File[];
}

interface CreateTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateTicketData) => void;
  isLoading?: boolean;
}

function getFileType(name: string): "image" | "video" | "unknown" {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return "unknown";
}

export function CreateTicketDialog({ open, onOpenChange, onSubmit, isLoading }: CreateTicketDialogProps) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("medium");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageCount = selectedFiles.filter((f) => f.type === "image").length;
  const videoCount = selectedFiles.filter((f) => f.type === "video").length;

  const validateAndAddFiles = (files: FileList | File[]) => {
    const newFiles: SelectedFile[] = [];
    let currentImages = imageCount;
    let currentVideos = videoCount;

    for (const file of Array.from(files)) {
      const fileType = getFileType(file.name);
      if (fileType === "unknown") {
        toast.error(`Unsupported file type: ${file.name}`);
        continue;
      }
      if (fileType === "image") {
        if (currentImages >= MAX_IMAGES) {
          toast.error(`Maximum ${MAX_IMAGES} images allowed`);
          continue;
        }
        if (file.size > MAX_IMAGE_SIZE) {
          toast.error(`${file.name} exceeds 5 MB limit`);
          continue;
        }
        currentImages++;
        const preview = URL.createObjectURL(file);
        newFiles.push({ file, type: "image", preview });
      } else {
        if (currentVideos >= MAX_VIDEOS) {
          toast.error(`Maximum ${MAX_VIDEOS} videos allowed`);
          continue;
        }
        if (file.size > MAX_VIDEO_SIZE) {
          toast.error(`${file.name} exceeds 10 MB limit`);
          continue;
        }
        currentVideos++;
        newFiles.push({ file, type: "video" });
      }
    }

    setSelectedFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => {
      const removed = prev[index];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    onSubmit({
      subject,
      description,
      category,
      priority,
      contact_name: contactName,
      contact_phone: contactPhone,
      contact_email: contactEmail,
      company_name: companyName,
      attachments: selectedFiles.map((f) => f.file),
    });
    // Cleanup previews
    selectedFiles.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setSubject("");
    setDescription("");
    setCategory("general");
    setPriority("medium");
    setContactName("");
    setContactPhone("");
    setContactEmail("");
    setCompanyName("");
    setSelectedFiles([]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raise a Support Ticket</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Contact Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_name">Name *</Label>
              <Input id="contact_name" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Your name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input id="company_name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_phone">Contact Number</Label>
              <Input id="contact_phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+91 9876543210" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_email">Email</Label>
              <Input id="contact_email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="email@example.com" />
            </div>
          </div>

          {/* Issue Details */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject *</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief description of the issue" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Provide details about your issue..." rows={4} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="feature_request">Feature Request</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label>Attachments</Label>
            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto h-6 w-6 text-muted-foreground mb-1" />
              <p className="text-sm text-muted-foreground">
                Click or drag files here
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Images (max {MAX_IMAGES}, 5 MB each) · Videos (max {MAX_VIDEOS}, 10 MB each)
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) validateAndAddFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {selectedFiles.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {selectedFiles.map((sf, i) => (
                  <div key={i} className="relative group border rounded-md overflow-hidden bg-muted/30">
                    {sf.type === "image" && sf.preview ? (
                      <img src={sf.preview} alt={sf.file.name} className="w-full h-20 object-cover" />
                    ) : (
                      <div className="w-full h-20 flex flex-col items-center justify-center gap-1">
                        <Video className="h-6 w-6 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground truncate max-w-full px-1">{sf.file.name}</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 flex items-center justify-between">
                      <span className="truncate">{sf.type === "image" ? <Image className="inline h-3 w-3 mr-0.5" /> : <Video className="inline h-3 w-3 mr-0.5" />}{formatSize(sf.file.size)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading || !subject.trim() || !contactName.trim()}>
              {isLoading ? "Creating..." : "Create Ticket"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
