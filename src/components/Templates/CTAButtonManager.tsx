import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export interface CTAButton {
  id: string;
  text: string;
  url: string;
  style: 'primary' | 'secondary' | 'outline';
}

interface CTAButtonManagerProps {
  buttons: CTAButton[];
  onChange: (buttons: CTAButton[]) => void;
}

export const CTAButtonManager = ({ buttons, onChange }: CTAButtonManagerProps) => {
  const addButton = () => {
    const newButton: CTAButton = {
      id: crypto.randomUUID(),
      text: '',
      url: '',
      style: 'primary'
    };
    onChange([...buttons, newButton]);
  };

  const removeButton = (id: string) => {
    onChange(buttons.filter(btn => btn.id !== id));
  };

  const updateButton = (id: string, field: keyof CTAButton, value: string) => {
    onChange(buttons.map(btn => 
      btn.id === id ? { ...btn, [field]: value } : btn
    ));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>CTA Buttons (max 3)</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addButton}
          disabled={buttons.length >= 3}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Button
        </Button>
      </div>

      <div className="space-y-3">
        {buttons.map((button, index) => (
          <Card key={button.id}>
            <CardContent className="pt-4">
              <div className="grid gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Button {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeButton(button.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`btn-text-${button.id}`}>Button Text</Label>
                  <Input
                    id={`btn-text-${button.id}`}
                    value={button.text}
                    onChange={(e) => updateButton(button.id, 'text', e.target.value)}
                    placeholder="Get Started"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`btn-url-${button.id}`}>URL (supports variables)</Label>
                  <Input
                    id={`btn-url-${button.id}`}
                    value={button.url}
                    onChange={(e) => updateButton(button.id, 'url', e.target.value)}
                    placeholder="https://example.com or {{website}}"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`btn-style-${button.id}`}>Button Style</Label>
                  <Select
                    value={button.style}
                    onValueChange={(value) => updateButton(button.id, 'style', value as CTAButton['style'])}
                  >
                    <SelectTrigger id={`btn-style-${button.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="primary">Primary (Blue)</SelectItem>
                      <SelectItem value="secondary">Secondary (Gray)</SelectItem>
                      <SelectItem value="outline">Outline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {buttons.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No buttons added. Click "Add Button" to create a call-to-action.
        </p>
      )}
    </div>
  );
};
