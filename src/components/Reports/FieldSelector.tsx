import { DataSource, DataSourceField } from "@/config/reportDataSources";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { GripVertical } from "lucide-react";

interface FieldSelectorProps {
  dataSource: DataSource;
}

export default function FieldSelector({ dataSource }: FieldSelectorProps) {
  const [search, setSearch] = useState("");

  const filteredFields = dataSource.fields.filter(field =>
    field.label.toLowerCase().includes(search.toLowerCase()) ||
    field.key.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Available Fields</h3>
        <Input
          placeholder="Search fields..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3"
        />
      </div>

      <ScrollArea className="h-[500px] pr-4">
        <div className="space-y-2">
          {filteredFields.map((field) => (
            <div
              key={field.key}
              className="flex items-center gap-2 p-3 bg-card border rounded-lg hover:bg-accent/50 cursor-move transition-colors"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('field', JSON.stringify(field));
                e.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium text-sm">{field.label}</p>
                <p className="text-xs text-muted-foreground">{field.key}</p>
              </div>
              <Badge variant="outline" className="text-xs">
                {field.type}
              </Badge>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
