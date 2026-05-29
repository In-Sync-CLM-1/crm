import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Star } from "lucide-react";

export interface PhoneEntry {
  phone: string;
  phone_type: string;
  is_primary: boolean;
}

interface InlinePhoneInputProps {
  phones: PhoneEntry[];
  onChange: (phones: PhoneEntry[]) => void;
}

export function InlinePhoneInput({ phones, onChange }: InlinePhoneInputProps) {
  const [newPhone, setNewPhone] = useState({ phone: "", phone_type: "mobile" });

  const addPhone = () => {
    if (!newPhone.phone) return;

    const newEntry: PhoneEntry = {
      phone: newPhone.phone,
      phone_type: newPhone.phone_type,
      is_primary: phones.length === 0,
    };

    onChange([...phones, newEntry]);
    setNewPhone({ phone: "", phone_type: "mobile" });
  };

  const removePhone = (index: number) => {
    const updated = phones.filter((_, i) => i !== index);
    // If we removed the primary, make the first one primary
    if (updated.length > 0 && !updated.some(p => p.is_primary)) {
      updated[0].is_primary = true;
    }
    onChange(updated);
  };

  const setPrimary = (index: number) => {
    const updated = phones.map((p, i) => ({
      ...p,
      is_primary: i === index,
    }));
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {phones.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input value={item.phone} readOnly className="flex-1" />
          <Badge variant="secondary" className="text-xs">
            {item.phone_type}
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
            onClick={() => removePhone(index)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <div className="flex gap-1.5">
        <Input
          placeholder="Phone number"
          type="tel"
          value={newPhone.phone}
          onChange={(e) => setNewPhone({ ...newPhone, phone: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addPhone();
            }
          }}
          className="flex-[2] h-9 min-w-0"
        />
        <Select
          value={newPhone.phone_type}
          onValueChange={(value) => setNewPhone({ ...newPhone, phone_type: value })}
        >
          <SelectTrigger className="w-20 h-9 text-xs px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mobile">Mobile</SelectItem>
            <SelectItem value="work">Work</SelectItem>
            <SelectItem value="home">Home</SelectItem>
            <SelectItem value="fax">Fax</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={addPhone} disabled={!newPhone.phone}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
