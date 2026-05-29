import { useState } from "react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import { useOrgData } from "@/hooks/useOrgData";
import { useCRUD } from "@/hooks/useCRUD";
import { useInlineEdit } from "@/hooks/useInlineEdit";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/common/LoadingState";
import { Plus, Trash2, Edit, Check, X } from "lucide-react";

interface PipelineStage {
  id: string;
  name: string;
  description: string | null;
  stage_order: number;
  probability: number;
  color: string;
  is_active: boolean;
}

export default function PipelineStages() {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const inlineEdit = useInlineEdit<PipelineStage>();
  
  const [newStage, setNewStage] = useState({
    name: "",
    description: "",
    probability: 50,
    color: "#01B8AA",
  });

  const { data: stages = [], isLoading, refetch } = useOrgData<PipelineStage>("pipeline_stages", {
    orderBy: { column: "stage_order", ascending: true }
  });

  const { create, update, delete: deleteMutation } = useCRUD("pipeline_stages", {
    onSuccess: () => refetch(),
  });

  const handleAddStage = async () => {
    if (!newStage.name) {
      notify.error("Name required", "Please enter a stage name");
      return;
    }

    if (!effectiveOrgId) return;

    const maxOrder = Math.max(...stages.map(s => s.stage_order), 0);

    await create({
      org_id: effectiveOrgId,
      name: newStage.name,
      description: newStage.description,
      stage_order: maxOrder + 1,
      probability: newStage.probability,
      color: newStage.color,
    });

    setNewStage({
      name: "",
      description: "",
      probability: 50,
      color: "#01B8AA",
    });
  };

  const handleDeleteStage = async (id: string) => {
    if (!notify.confirm("Are you sure you want to delete this stage?")) return;
    deleteMutation(id);
  };

  const handleSaveEdit = async (id: string, value: Partial<PipelineStage>) => {
    await update({ id, data: value });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <LoadingState message="Loading pipeline stages..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Pipeline Stages</h1>
          <p className="text-muted-foreground mt-1">Manage your sales pipeline stages</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add New Stage</CardTitle>
            <CardDescription>Create a new pipeline stage for your sales process</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Stage Name</Label>
                <Input
                  value={newStage.name}
                  onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
                  placeholder="e.g., Qualified"
                />
              </div>

              <div className="space-y-2">
                <Label>Probability (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={newStage.probability}
                  onChange={(e) => setNewStage({ ...newStage, probability: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={newStage.description}
                onChange={(e) => setNewStage({ ...newStage, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={newStage.color}
                  onChange={(e) => setNewStage({ ...newStage, color: e.target.value })}
                  className="w-20 h-10"
                />
                <Input
                  value={newStage.color}
                  onChange={(e) => setNewStage({ ...newStage, color: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>

            <Button onClick={handleAddStage}>
              <Plus className="mr-2 h-4 w-4" />
              Add Stage
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Pipeline Stages</CardTitle>
            <CardDescription>
              {stages.length} stage{stages.length !== 1 ? "s" : ""} configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stages.map((stage) => (
                <div
                  key={stage.id}
                  className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  
                  {inlineEdit.isEditing(stage.id) ? (
                    <>
                      <div className="flex-1 grid gap-2 md:grid-cols-3">
                        <Input
                          value={(inlineEdit.editValue as PipelineStage).name || stage.name}
                          onChange={(e) => inlineEdit.updateEdit({ name: e.target.value })}
                          disabled={inlineEdit.isSaving}
                        />
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={(inlineEdit.editValue as PipelineStage).probability ?? stage.probability}
                          onChange={(e) => inlineEdit.updateEdit({ probability: parseInt(e.target.value) })}
                          placeholder="Probability %"
                          disabled={inlineEdit.isSaving}
                        />
                        <Input
                          type="color"
                          value={(inlineEdit.editValue as PipelineStage).color || stage.color}
                          onChange={(e) => inlineEdit.updateEdit({ color: e.target.value })}
                          disabled={inlineEdit.isSaving}
                        />
                      </div>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => inlineEdit.saveEdit(stage.id, handleSaveEdit)}
                        disabled={inlineEdit.isSaving}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={inlineEdit.cancelEdit}
                        disabled={inlineEdit.isSaving}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1">
                        <div className="font-medium">{stage.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {stage.probability}% probability
                          {stage.description && ` • ${stage.description}`}
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => inlineEdit.startEdit(stage.id, stage)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteStage(stage.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}