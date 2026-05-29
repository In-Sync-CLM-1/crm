import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Upload, AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { TemplateVariable, CRMField, VariableMapping, getCRMFields } from "@/utils/templateVariables";
import { parseCSV, ParsedCSVData, generateCSVTemplate } from "@/utils/csvParser";
import { toast } from "sonner";

interface VariableMappingStepProps {
  templateVariables: TemplateVariable[];
  identifierType: 'phone' | 'email';
  orgId: string;
  onComplete: (mappings: Record<string, VariableMapping>, csvData: ParsedCSVData | null) => void;
  onBack: () => void;
}

export function VariableMappingStep({
  templateVariables,
  identifierType,
  orgId,
  onComplete,
  onBack
}: VariableMappingStepProps) {
  const [mappings, setMappings] = useState<Record<string, VariableMapping>>({});
  const [crmFields, setCrmFields] = useState<{ standardFields: CRMField[]; customFields: CRMField[] }>({
    standardFields: [],
    customFields: []
  });
  const [csvData, setCsvData] = useState<ParsedCSVData | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCRMFields();
    initializeMappings();
  }, [orgId, templateVariables]);

  const loadCRMFields = async () => {
    const fields = await getCRMFields(orgId, true);
    setCrmFields(fields);
  };

  const initializeMappings = () => {
    const initialMappings: Record<string, VariableMapping> = {};
    templateVariables.forEach(tv => {
      initialMappings[tv.variable] = {
        source: 'crm',
        field: 'first_name'
      };
    });
    setMappings(initialMappings);
  };

  const updateMapping = (variable: string, update: Partial<VariableMapping>) => {
    setMappings(prev => ({
      ...prev,
      [variable]: { ...prev[variable], ...update }
    }));
  };

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setCsvFile(file);

    try {
      const text = await file.text();
      const parsed = parseCSV(text, identifierType);
      
      if (parsed.errors.length > 0) {
        toast.error(`CSV has ${parsed.errors.length} error(s)`, {
          description: parsed.errors.slice(0, 3).join('\n')
        });
      }

      if (parsed.rows.length === 0) {
        toast.error("No valid rows found in CSV");
        setCsvData(null);
        return;
      }

      setCsvData(parsed);
      toast.success(`CSV loaded: ${parsed.rows.length} rows`);
    } catch (error) {
      toast.error("Failed to parse CSV file");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const csvColumns = templateVariables
      .filter(tv => mappings[tv.variable]?.source === 'csv' && mappings[tv.variable]?.field)
      .map(tv => mappings[tv.variable].field!);

    const template = generateCSVTemplate(identifierType, csvColumns.length > 0 ? csvColumns : ['variable1', 'variable2']);
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign_template_${identifierType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success("CSV template downloaded");
  };

  const handleContinue = () => {
    // Validate all variables are mapped
    const unmapped = templateVariables.filter(tv => {
      const mapping = mappings[tv.variable];
      if (!mapping) return true;
      if (mapping.source === 'static' && !mapping.value) return true;
      if ((mapping.source === 'crm' || mapping.source === 'csv') && !mapping.field) return true;
      return false;
    });

    if (unmapped.length > 0) {
      toast.error(`Please map all variables: ${unmapped.map(v => v.variable).join(', ')}`);
      return;
    }

    // If any variable uses CSV source, require CSV upload
    const needsCSV = Object.values(mappings).some(m => m.source === 'csv');
    if (needsCSV && !csvData) {
      toast.error("Please upload a CSV file for CSV-mapped variables");
      return;
    }

    onComplete(mappings, csvData);
  };

  const allFields = [...crmFields.standardFields, ...crmFields.customFields];
  const csvColumns = csvData?.headers.filter(h => h !== csvData.identifierColumn) || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Variable Mapping</h2>
        <p className="text-muted-foreground">
          Map template variables to contact data or upload custom CSV data
        </p>
      </div>

      {templateVariables.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No variables detected in template. You can proceed to select recipients.
          </AlertDescription>
        </Alert>
      )}

      {templateVariables.length > 0 && (
        <div className="space-y-6">
          {/* Subject Variables Section */}
          {templateVariables.some(tv => tv.source === 'subject') && (
            <div className="space-y-4">
              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold text-lg">Subject Line Variables</h3>
                <p className="text-sm text-muted-foreground">These variables appear in the email subject</p>
              </div>
              {templateVariables.filter(tv => tv.source === 'subject').map((tv) => (
                <Card key={tv.variable} className="p-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-base font-semibold">{tv.variable}</Label>
                        {tv.label && <p className="text-sm text-muted-foreground">{tv.label}</p>}
                      </div>
                    </div>

                <RadioGroup
                  value={mappings[tv.variable]?.source || 'crm'}
                  onValueChange={(value) => updateMapping(tv.variable, { source: value as any })}
                  className="space-y-3"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="crm" id={`${tv.variable}-crm`} />
                    <Label htmlFor={`${tv.variable}-crm`} className="flex-1 flex items-center gap-2">
                      <span>CRM Field</span>
                      {mappings[tv.variable]?.source === 'crm' && (
                        <Select
                          value={mappings[tv.variable]?.field || ''}
                          onValueChange={(value) => updateMapping(tv.variable, { field: value })}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Standard Fields</div>
                            {crmFields.standardFields.map(field => (
                              <SelectItem key={field.key} value={field.key}>
                                {field.label}
                              </SelectItem>
                            ))}
                            {crmFields.customFields.length > 0 && (
                              <>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Custom Fields</div>
                                {crmFields.customFields.map(field => (
                                  <SelectItem key={field.key} value={field.key}>
                                    {field.label}
                                  </SelectItem>
                                ))}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="csv" id={`${tv.variable}-csv`} />
                    <Label htmlFor={`${tv.variable}-csv`} className="flex-1 flex items-center gap-2">
                      <span>CSV Column</span>
                      {mappings[tv.variable]?.source === 'csv' && (
                        <Select
                          value={mappings[tv.variable]?.field || ''}
                          onValueChange={(value) => updateMapping(tv.variable, { field: value })}
                          disabled={!csvData}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder={csvData ? "Select column" : "Upload CSV first"} />
                          </SelectTrigger>
                          <SelectContent>
                            {csvColumns.map(col => (
                              <SelectItem key={col} value={col}>
                                {col}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="static" id={`${tv.variable}-static`} />
                    <Label htmlFor={`${tv.variable}-static`} className="flex-1 flex items-center gap-2">
                      <span>Static Value</span>
                      {mappings[tv.variable]?.source === 'static' && (
                        <Input
                          placeholder="Enter value"
                          value={mappings[tv.variable]?.value || ''}
                          onChange={(e) => updateMapping(tv.variable, { value: e.target.value })}
                          className="w-[200px]"
                        />
                      )}
                    </Label>
                  </div>
                </RadioGroup>

                {mappings[tv.variable] && (
                  <div className="mt-2 p-2 bg-muted rounded text-sm">
                    <span className="text-muted-foreground">Preview: </span>
                    <span className="font-medium">
                      {mappings[tv.variable].source === 'static' 
                        ? mappings[tv.variable].value || '(empty)'
                        : mappings[tv.variable].field || '(not selected)'}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          ))}
            </div>
          )}

          {/* Body Variables Section */}
          {templateVariables.some(tv => tv.source === 'body') && (
            <div className="space-y-4">
              <div className="border-l-4 border-secondary pl-4">
                <h3 className="font-semibold text-lg">Email Body Variables</h3>
                <p className="text-sm text-muted-foreground">These variables appear in the email body</p>
              </div>
              {templateVariables.filter(tv => tv.source === 'body').map((tv) => (
                <Card key={tv.variable} className="p-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-base font-semibold">{tv.variable}</Label>
                        {tv.label && <p className="text-sm text-muted-foreground">{tv.label}</p>}
                      </div>
                    </div>

                <RadioGroup
                  value={mappings[tv.variable]?.source || 'crm'}
                  onValueChange={(value) => updateMapping(tv.variable, { source: value as any })}
                  className="space-y-3"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="crm" id={`${tv.variable}-crm`} />
                    <Label htmlFor={`${tv.variable}-crm`} className="flex-1 flex items-center gap-2">
                      <span>CRM Field</span>
                      {mappings[tv.variable]?.source === 'crm' && (
                        <Select
                          value={mappings[tv.variable]?.field || ''}
                          onValueChange={(value) => updateMapping(tv.variable, { field: value })}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Standard Fields</div>
                            {crmFields.standardFields.map(field => (
                              <SelectItem key={field.key} value={field.key}>
                                {field.label}
                              </SelectItem>
                            ))}
                            {crmFields.customFields.length > 0 && (
                              <>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Custom Fields</div>
                                {crmFields.customFields.map(field => (
                                  <SelectItem key={field.key} value={field.key}>
                                    {field.label}
                                  </SelectItem>
                                ))}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="csv" id={`${tv.variable}-csv`} />
                    <Label htmlFor={`${tv.variable}-csv`} className="flex-1 flex items-center gap-2">
                      <span>CSV Column</span>
                      {mappings[tv.variable]?.source === 'csv' && (
                        <Select
                          value={mappings[tv.variable]?.field || ''}
                          onValueChange={(value) => updateMapping(tv.variable, { field: value })}
                          disabled={!csvData}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder={csvData ? "Select column" : "Upload CSV first"} />
                          </SelectTrigger>
                          <SelectContent>
                            {csvColumns.map(col => (
                              <SelectItem key={col} value={col}>
                                {col}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="static" id={`${tv.variable}-static`} />
                    <Label htmlFor={`${tv.variable}-static`} className="flex-1 flex items-center gap-2">
                      <span>Static Value</span>
                      {mappings[tv.variable]?.source === 'static' && (
                        <Input
                          placeholder="Enter value"
                          value={mappings[tv.variable]?.value || ''}
                          onChange={(e) => updateMapping(tv.variable, { value: e.target.value })}
                          className="w-[200px]"
                        />
                      )}
                    </Label>
                  </div>
                </RadioGroup>

                {mappings[tv.variable] && (
                  <div className="mt-2 p-2 bg-muted rounded text-sm">
                    <span className="text-muted-foreground">Preview: </span>
                    <span className="font-medium">
                      {mappings[tv.variable].source === 'static' 
                        ? mappings[tv.variable].value || '(empty)'
                        : mappings[tv.variable].field || '(not selected)'}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          ))}
            </div>
          )}
        </div>
      )}

      <Card className="p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">CSV Upload for Promotional Lists</h3>
              <p className="text-sm text-muted-foreground">
                Upload custom recipient lists without adding them to your CRM
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Note:</strong> Recipients from CSV uploads will be used for this campaign only and will NOT be added to your CRM contacts. Perfect for promotional campaigns to external lists.
            </AlertDescription>
          </Alert>

          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              className="hidden"
              id="csv-upload"
              disabled={loading}
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              {csvFile ? (
                <div className="space-y-2">
                  <FileText className="h-12 w-12 mx-auto text-primary" />
                  <div className="text-sm">
                    <p className="font-medium">{csvFile.name}</p>
                    {csvData && (
                      <p className="text-muted-foreground">
                        {csvData.rows.length} rows loaded
                        {csvData.errors.length > 0 && ` (${csvData.errors.length} errors)`}
                      </p>
                    )}
                  </div>
                  {csvData && csvData.errors.length === 0 && (
                    <CheckCircle2 className="h-5 w-5 mx-auto text-green-500" />
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop CSV or click to upload
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Required column: {identifierType}
                  </p>
                </div>
              )}
            </label>
          </div>

          {csvData && csvData.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">CSV Errors ({csvData.errors.length}):</p>
                  {csvData.errors.slice(0, 5).map((error, idx) => (
                    <p key={idx} className="text-xs">{error}</p>
                  ))}
                  {csvData.errors.length > 5 && (
                    <p className="text-xs">...and {csvData.errors.length - 5} more</p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </Card>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleContinue}>
          Continue to Recipients
        </Button>
      </div>
    </div>
  );
}
