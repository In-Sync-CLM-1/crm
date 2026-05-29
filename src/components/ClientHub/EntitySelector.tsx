import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Plus } from "lucide-react";

export type EntityType = "client" | "contact" | "external";

export interface SelectedEntity {
  type: EntityType;
  id: string;
  name: string;
  company?: string;
}

interface EntitySelectorProps {
  value: SelectedEntity | null;
  onChange: (entity: SelectedEntity | null) => void;
  showCreateExternal?: boolean;
  onCreateExternal?: (name: string, company: string) => void;
}

export function EntitySelector({ 
  value, 
  onChange, 
  showCreateExternal = false,
  onCreateExternal 
}: EntitySelectorProps) {
  const { effectiveOrgId } = useOrgContext();
  const [entityType, setEntityType] = useState<EntityType>(value?.type || "client");
  const [selectedId, setSelectedId] = useState<string>(value?.id || "");
  const [showNewExternal, setShowNewExternal] = useState(false);
  const [newExternalName, setNewExternalName] = useState("");
  const [newExternalCompany, setNewExternalCompany] = useState("");

  // Fetch clients
  const { data: clients } = useQuery({
    queryKey: ["clients-selector", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, company")
        .eq("org_id", effectiveOrgId)
        .order("first_name");
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId && entityType === "client",
  });

  // Fetch contacts (leads/prospects)
  const { data: contacts } = useQuery({
    queryKey: ["contacts-selector", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, company")
        .eq("org_id", effectiveOrgId)
        .order("first_name");
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId && entityType === "contact",
  });

  // Fetch external entities
  const { data: externalEntities } = useQuery({
    queryKey: ["external-entities-selector", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("external_entities")
        .select("id, name, company")
        .eq("org_id", effectiveOrgId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrgId && entityType === "external",
  });

  useEffect(() => {
    if (value) {
      setEntityType(value.type);
      setSelectedId(value.id);
    }
  }, [value]);

  const handleTypeChange = (type: EntityType) => {
    setEntityType(type);
    setSelectedId("");
    setShowNewExternal(false);
    onChange(null);
  };

  const handleEntitySelect = (id: string) => {
    setSelectedId(id);
    
    let entity: SelectedEntity | null = null;
    
    if (entityType === "client") {
      const client = clients?.find(c => c.id === id);
      if (client) {
        entity = {
          type: "client",
          id: client.id,
          name: `${client.first_name} ${client.last_name || ""}`.trim(),
          company: client.company || undefined,
        };
      }
    } else if (entityType === "contact") {
      const contact = contacts?.find(c => c.id === id);
      if (contact) {
        entity = {
          type: "contact",
          id: contact.id,
          name: `${contact.first_name} ${contact.last_name || ""}`.trim(),
          company: contact.company || undefined,
        };
      }
    } else if (entityType === "external") {
      const external = externalEntities?.find(e => e.id === id);
      if (external) {
        entity = {
          type: "external",
          id: external.id,
          name: external.name,
          company: external.company || undefined,
        };
      }
    }
    
    onChange(entity);
  };

  const handleCreateExternal = () => {
    if (onCreateExternal && newExternalName) {
      onCreateExternal(newExternalName, newExternalCompany);
      setNewExternalName("");
      setNewExternalCompany("");
      setShowNewExternal(false);
    }
  };

  const getOptions = () => {
    if (entityType === "client") {
      return clients?.map(c => ({
        id: c.id,
        label: `${c.first_name} ${c.last_name || ""}`.trim() + (c.company ? ` (${c.company})` : ""),
      })) || [];
    }
    if (entityType === "contact") {
      return contacts?.map(c => ({
        id: c.id,
        label: `${c.first_name} ${c.last_name || ""}`.trim() + (c.company ? ` (${c.company})` : ""),
      })) || [];
    }
    if (entityType === "external") {
      return externalEntities?.map(e => ({
        id: e.id,
        label: e.name + (e.company ? ` (${e.company})` : ""),
      })) || [];
    }
    return [];
  };

  const options = getOptions();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Entity Type</Label>
        <RadioGroup
          value={entityType}
          onValueChange={(v) => handleTypeChange(v as EntityType)}
          className="flex flex-wrap gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="client" id="entity-client" />
            <Label htmlFor="entity-client" className="font-normal cursor-pointer">Client</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="contact" id="entity-contact" />
            <Label htmlFor="entity-contact" className="font-normal cursor-pointer">Contact (Lead)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="external" id="entity-external" />
            <Label htmlFor="entity-external" className="font-normal cursor-pointer">External Entity</Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label>Select {entityType === "client" ? "Client" : entityType === "contact" ? "Contact" : "External Entity"}</Label>
        <Select value={selectedId} onValueChange={handleEntitySelect}>
          <SelectTrigger>
            <SelectValue placeholder={`Choose a ${entityType}...`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showCreateExternal && entityType === "external" && (
        <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
          {!showNewExternal ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowNewExternal(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create New External Entity
            </Button>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Name *"
                  value={newExternalName}
                  onChange={(e) => setNewExternalName(e.target.value)}
                />
                <Input
                  placeholder="Company"
                  value={newExternalCompany}
                  onChange={(e) => setNewExternalCompany(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreateExternal}
                  disabled={!newExternalName}
                >
                  Create
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewExternal(false)}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
