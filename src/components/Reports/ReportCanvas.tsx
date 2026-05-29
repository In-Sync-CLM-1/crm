import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table2, BarChart3, Activity, Trash2 } from "lucide-react";
import ReportTableComponent from "./ReportTableComponent";
import ReportChartComponent from "./ReportChartComponent";
import ReportMetricCard from "./ReportMetricCard";

export type ComponentType = 'table' | 'chart' | 'metric';

export interface ReportComponent {
  id: string;
  type: ComponentType;
  config: any;
}

interface ReportCanvasProps {
  components: ReportComponent[];
  onChange: (components: ReportComponent[]) => void;
  dataSource: string;
  parameters: any;
  orgId: string;
}

export default function ReportCanvas({ components, onChange, dataSource, parameters, orgId }: ReportCanvasProps) {
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);

  const addComponent = (type: ComponentType) => {
    const newComponent: ReportComponent = {
      id: `comp_${Date.now()}`,
      type,
      config: type === 'table' 
        ? { columns: [] }
        : type === 'chart'
        ? { chartType: 'bar', xAxis: '', yAxis: '' }
        : { field: '', operation: 'count', label: '' },
    };
    onChange([...components, newComponent]);
    setSelectedComponent(newComponent.id);
  };

  const removeComponent = (id: string) => {
    onChange(components.filter(c => c.id !== id));
    if (selectedComponent === id) {
      setSelectedComponent(null);
    }
  };

  const updateComponent = (id: string, config: any) => {
    onChange(components.map(c => c.id === id ? { ...c, config } : c));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Report Canvas</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => addComponent('metric')}>
            <Activity className="h-4 w-4 mr-1" />
            Metric
          </Button>
          <Button size="sm" variant="outline" onClick={() => addComponent('chart')}>
            <BarChart3 className="h-4 w-4 mr-1" />
            Chart
          </Button>
          <Button size="sm" variant="outline" onClick={() => addComponent('table')}>
            <Table2 className="h-4 w-4 mr-1" />
            Table
          </Button>
        </div>
      </div>

      <div
        className="min-h-[400px] border-2 border-dashed rounded-lg p-4 space-y-4"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          e.preventDefault();
          const fieldData = e.dataTransfer.getData('field');
          if (fieldData) {
            const field = JSON.parse(fieldData);
            // Auto-create appropriate component based on field type
            if (field.aggregations && field.aggregations.length > 0) {
              addComponent('metric');
            } else if (field.type === 'number') {
              addComponent('chart');
            } else {
              addComponent('table');
            }
          }
        }}
      >
        {components.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="mb-2">Drag fields here or add components using the buttons above</p>
              <p className="text-sm">Start building your report</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {components.map((component) => (
              <Card
                key={component.id}
                className={`p-4 ${selectedComponent === component.id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setSelectedComponent(component.id)}
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium capitalize">{component.type} Component</h4>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeComponent(component.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {component.type === 'table' && (
                  <ReportTableComponent
                    config={component.config}
                    dataSource={dataSource as any}
                    parameters={parameters}
                    orgId={orgId}
                    onConfigChange={(config) => updateComponent(component.id, config)}
                  />
                )}

                {component.type === 'chart' && (
                  <ReportChartComponent
                    config={component.config}
                    dataSource={dataSource as any}
                    parameters={parameters}
                    orgId={orgId}
                    onConfigChange={(config) => updateComponent(component.id, config)}
                  />
                )}

                {component.type === 'metric' && (
                  <ReportMetricCard
                    config={component.config}
                    dataSource={dataSource as any}
                    parameters={parameters}
                    orgId={orgId}
                    onConfigChange={(config) => updateComponent(component.id, config)}
                  />
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
