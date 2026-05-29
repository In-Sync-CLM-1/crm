import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Star } from "lucide-react";

export interface EmailEntry {
  email: string;
  email_type: string;
  is_primary: boolean;
}

interface InlineEmailInputProps {
  emails: EmailEntry[];
  onChange: (emails: EmailEntry[]) => void;
}

export function InlineEmailInput({ emails, onChange }: InlineEmailInputProps) {
  const [newEmail, setNewEmail] = useState({ email: "", email_type: "work" });

  const addEmail = () => {
    if (!newEmail.email) return;

    const newEntry: EmailEntry = {
      email: newEmail.email,
      email_type: newEmail.email_type,
      is_primary: emails.length === 0,
    };

    onChange([...emails, newEntry]);
    setNewEmail({ email: "", email_type: "work" });
  };

  const removeEmail = (index: number) => {
    const updated = emails.filter((_, i) => i !== index);
    // If we removed the primary, make the first one primary
    if (updated.length > 0 && !updated.some(e => e.is_primary)) {
      updated[0].is_primary = true;
    }
    onChange(updated);
  };

  const setPrimary = (index: number) => {
    const updated = emails.map((e, i) => ({
      ...e,
      is_primary: i === index,
    }));
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {emails.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input value={item.email} readOnly className="flex-1" />
          <Badge variant="secondary" className="text-xs">
            {item.email_type}
          </Badge>
          {item.is_primary ? (
            <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
          ) : (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setPrimary(index)}
              title="Set as primary"
            >
              <Star className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => removeEmail(index)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <div className="flex gap-1.5">
        <Input
          placeholder="Email address"
          type="email"
          value={newEmail.email}
          onChange={(e) => setNewEmail({ ...newEmail, email: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEmail();
            }
          }}
          className="flex-[2] h-9 min-w-0"
        />
        <Select
          value={newEmail.email_type}
          onValueChange={(value) => setNewEmail({ ...newEmail, email_type: value })}
        >
          <SelectTrigger className="w-20 h-9 text-xs px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="work">Work</SelectItem>
            <SelectItem value="personal">Personal</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={addEmail} disabled={!newEmail.email}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
