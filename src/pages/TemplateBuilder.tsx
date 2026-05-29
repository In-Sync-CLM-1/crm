import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useNotification } from "@/hooks/useNotification";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Plus, Trash2, Upload } from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";

interface Button {
  type: string;
  text: string;
  url?: string;
  phone_code?: string;
  phone_number?: string;
}

export default function TemplateBuilder() {
  const navigate = useNavigate();
  const notify = useNotification();
  const { effectiveOrgId } = useOrgContext();
  
  const [loading, setLoading] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [category, setCategory] = useState("marketing");
  const [language, setLanguage] = useState("en");
  const [headerType, setHeaderType] = useState<string>("none");
  const [headerContent, setHeaderContent] = useState("");
  const [bodyContent, setBodyContent] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<Button[]>([]);
  const [sampleHeader, setSampleHeader] = useState<string[]>([]);
  const [sampleBody, setSampleBody] = useState<string[]>([]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // Auto-sync sample values with body content variables
  useEffect(() => {
    const bodyVars = (bodyContent.match(/\{\{(\d+)\}\}/g) || [])
      .map(v => parseInt(v.replace(/[{}]/g, '')))
      .filter(n => !isNaN(n));
    
    const maxBodyVar = bodyVars.length > 0 ? Math.max(...bodyVars) : 0;
    
    if (maxBodyVar !== sampleBody.length) {
      const newSampleBody = Array(maxBodyVar).fill('').map((_, idx) => 
        sampleBody[idx] || ''
      );
      setSampleBody(newSampleBody);
    }
  }, [bodyContent]);

  // Auto-sync sample values with header content variables
  useEffect(() => {
    const headerVars = (headerContent.match(/\{\{(\d+)\}\}/g) || [])
      .map(v => parseInt(v.replace(/[{}]/g, '')))
      .filter(n => !isNaN(n));
    
    const maxHeaderVar = headerVars.length > 0 ? Math.max(...headerVars) : 0;
    
    if (maxHeaderVar !== sampleHeader.length) {
      const newSampleHeader = Array(maxHeaderVar).fill('').map((_, idx) => 
        sampleHeader[idx] || ''
      );
      setSampleHeader(newSampleHeader);
    }
  }, [headerContent]);

  const insertVariable = (location: 'header' | 'body') => {
    if (location === 'header') {
      const currentVars = (headerContent.match(/{{(\d+)}}/g) || []).length;
      const newVar = `{{${currentVars + 1}}}`;
      setHeaderContent(headerContent + newVar);
      setSampleHeader([...sampleHeader, ""]);
    } else {
      const currentVars = (bodyContent.match(/{{(\d+)}}/g) || []).length;
      const newVar = `{{${currentVars + 1}}}`;
      setBodyContent(bodyContent + newVar);
      setSampleBody([...sampleBody, ""]);
    }
  };

  const addButton = (type: string) => {
    if (buttons.length >= 3) {
      notify.error("Button Limit Reached", "You can add a maximum of 3 buttons");
      return;
    }

    setButtons([
      ...buttons,
      {
        type,
        text: "",
        ...(type === "URL" && { url: "" }),
        ...(type === "PHONE_NUMBER" && { phone_code: "+1", phone_number: "" }),
      },
    ]);
  };

  const updateButton = (index: number, field: string, value: string) => {
    const newButtons = [...buttons];
    newButtons[index] = { ...newButtons[index], [field]: value };
    setButtons(newButtons);
  };

  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type based on header type
    const validTypes: Record<string, string[]> = {
      image: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
      video: ['video/mp4', 'video/3gpp'],
      document: ['application/pdf']
    };

    if (headerType !== 'none' && headerType !== 'text') {
      const allowedTypes = validTypes[headerType] || [];
      if (!allowedTypes.includes(file.type)) {
        notify.error("Invalid File Type", `Please upload a valid ${headerType} file`);
        return;
      }
    }

    // Validate file size (max 5MB for images, 16MB for videos, 100MB for documents)
    const maxSizes: Record<string, number> = {
      image: 5 * 1024 * 1024,
      video: 16 * 1024 * 1024,
      document: 100 * 1024 * 1024
    };

    const maxSize = maxSizes[headerType] || 5 * 1024 * 1024;
    if (file.size > maxSize) {
      notify.error("File Too Large", `File size must be less than ${maxSize / (1024 * 1024)}MB`);
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${effectiveOrgId}/${Date.now()}.${fileExt}`;
      const filePath = `template-media/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('whatsapp-templates')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('whatsapp-templates')
        .getPublicUrl(filePath);

      setMediaUrl(publicUrl);

      notify.success("Upload Successful", "File uploaded successfully");
    } catch (error: any) {
      console.error('Error uploading file:', error);
      notify.error("Upload Failed", error);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!templateName || !bodyContent) {
      notify.error("Validation Error", "Template name and body content are required");
      return;
    }

    // Validate buttons have required text
    const invalidButtons = buttons.filter(btn => !btn.text?.trim());
    if (invalidButtons.length > 0) {
      notify.error("Validation Error", "All buttons must have button text");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-exotel-whatsapp-template', {
        body: {
          template_name: templateName,
          category,
          language,
          header_type: headerType === 'none' ? null : headerType,
          header_content: headerType === 'text' ? headerContent : (headerType !== 'none' ? mediaUrl : null),
          body_content: bodyContent,
          footer_text: footerText || null,
          buttons: buttons.length > 0 ? buttons.map(btn => ({
            ...btn,
            ...(btn.type === "PHONE_NUMBER" && { 
              phone_number: (btn.phone_code || "+1") + (btn.phone_number || ""),
              phone_code: undefined 
            }),
          })) : null,
          sample_values: {
            ...(sampleHeader.length > 0 && { header: sampleHeader }),
            ...(sampleBody.length > 0 && { body: sampleBody }),
          },
        },
      });

      if (error) throw error;

      // Save template to local database immediately so it appears in the list
      const { data: profile } = await supabase.from('profiles').select('org_id').single();
      if (profile?.org_id) {
        const templateData = {
          org_id: profile.org_id,
          template_id: data.template_id || templateName,
          template_name: templateName,
          template_type: 'whatsapp' as const,
          content: bodyContent,
          category: category,
          language: language,
          status: 'pending',
          submission_status: 'pending',
          header_type: headerType === 'none' ? null : headerType,
          header_content: headerType === 'text' ? headerContent : (headerType !== 'none' ? mediaUrl : null),
          footer_text: footerText || null,
          buttons: buttons.length > 0 ? buttons as unknown as import("@/integrations/supabase/types").Json : null,
          variables: (bodyContent.match(/\{\{[^}]+\}\}/g) || []) as unknown as import("@/integrations/supabase/types").Json,
          submitted_at: new Date().toISOString(),
        };
        await supabase.from('communication_templates').insert(templateData);
      }

      notify.success("Template Submitted", data.message || "Template submitted successfully for WhatsApp approval");

      navigate('/templates');
    } catch (error: any) {
      console.error('Error submitting template:', error);
      notify.error("Submission Failed", error);
    } finally {
      setLoading(false);
    }
  };

  const renderPreview = () => {
    return (
      <div className="bg-muted p-4 rounded-lg max-w-sm">
        <div className="bg-background rounded-lg p-4 shadow-md">
          {headerType !== 'none' && (
            <div className="mb-3">
              {headerType === 'text' ? (
                <p className="font-semibold text-lg">{headerContent || "Header text here"}</p>
              ) : (
                <div className="bg-muted h-32 rounded flex items-center justify-center text-muted-foreground">
                  {headerType.toUpperCase()} Preview
                </div>
              )}
            </div>
          )}
          
          <div className="mb-3 whitespace-pre-wrap">
            {bodyContent || "Your message body will appear here. Use variables like {{1}} for dynamic content."}
          </div>
          
          {footerText && (
            <div className="text-sm text-muted-foreground mb-3">
              {footerText}
            </div>
          )}
          
          {buttons.length > 0 && (
            <div className="space-y-2">
              {buttons.map((btn, idx) => (
                <div key={idx} className="border border-primary rounded py-2 px-3 text-center text-primary hover:bg-primary/10 cursor-pointer transition-colors">
                  {btn.text || `Button ${idx + 1}`}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Create WhatsApp Template</h1>
            <p className="text-muted-foreground">Design and submit templates for WhatsApp approval</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form Section */}
          <div className="space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>Template name, category, and language settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="templateName">Template Name *</Label>
                  <Input
                    id="templateName"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    placeholder="welcome_message"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Use lowercase letters, numbers, and underscores only</p>
                </div>

                <div>
                  <Label htmlFor="category">Category *</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="utility">Utility</SelectItem>
                      <SelectItem value="authentication">Authentication</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="language">Language *</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger id="language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="en_US">English (US)</SelectItem>
                      <SelectItem value="hi">Hindi</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="pt_BR">Portuguese (BR)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Header */}
            <Card>
              <CardHeader>
                <CardTitle>Header (Optional)</CardTitle>
                <CardDescription>Add a header with text or media</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="headerType">Header Type</Label>
                  <Select value={headerType} onValueChange={setHeaderType}>
                    <SelectTrigger id="headerType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="image">Image</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="document">Document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {headerType === 'text' && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <Label htmlFor="headerContent">Header Text</Label>
                      <Button type="button" variant="outline" size="sm" onClick={() => insertVariable('header')}>
                        Insert Variable
                      </Button>
                    </div>
                    <Input
                      id="headerContent"
                      value={headerContent}
                      onChange={(e) => setHeaderContent(e.target.value)}
                      placeholder="Welcome to our service!"
                    />
                    
                    {sampleHeader.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <Label>Sample Values</Label>
                        {sampleHeader.map((_, idx) => (
                          <Input
                            key={idx}
                            placeholder={`Sample value for {{${idx + 1}}}`}
                            value={sampleHeader[idx]}
                            onChange={(e) => {
                              const newSamples = [...sampleHeader];
                              newSamples[idx] = e.target.value;
                              setSampleHeader(newSamples);
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {headerType !== 'none' && headerType !== 'text' && (
                  <div className="space-y-3">
                    <Label htmlFor="mediaUpload">Upload {headerType}</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id="mediaUpload"
                        type="file"
                        onChange={handleFileUpload}
                        accept={
                          headerType === 'image' ? 'image/jpeg,image/png,image/jpg,image/webp' :
                          headerType === 'video' ? 'video/mp4,video/3gpp' :
                          headerType === 'document' ? 'application/pdf' : ''
                        }
                        className="hidden"
                        disabled={uploading}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById('mediaUpload')?.click()}
                        disabled={uploading}
                        className="w-full"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {uploading ? 'Uploading...' : mediaUrl ? 'Change File' : 'Upload File'}
                      </Button>
                    </div>
                    {mediaUrl && (
                      <p className="text-xs text-muted-foreground">
                        ✓ File uploaded successfully
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Body */}
            <Card>
              <CardHeader>
                <CardTitle>Body Content *</CardTitle>
                <CardDescription>The main message content</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label htmlFor="bodyContent">Message Text</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => insertVariable('body')}>
                      Insert Variable
                    </Button>
                  </div>
                  <Textarea
                    id="bodyContent"
                    value={bodyContent}
                    onChange={(e) => setBodyContent(e.target.value)}
                    placeholder="Hello {{1}}, your order {{2}} is confirmed!"
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Use variables like {"{{1}}"}, {"{{2}}"} for dynamic content</p>
                </div>

                {sampleBody.length > 0 && (
                  <div className="space-y-2">
                    <Label>Sample Values</Label>
                    {sampleBody.map((_, idx) => (
                      <Input
                        key={idx}
                        placeholder={`Sample value for {{${idx + 1}}}`}
                        value={sampleBody[idx]}
                        onChange={(e) => {
                          const newSamples = [...sampleBody];
                          newSamples[idx] = e.target.value;
                          setSampleBody(newSamples);
                        }}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Footer */}
            <Card>
              <CardHeader>
                <CardTitle>Footer (Optional)</CardTitle>
                <CardDescription>Add a footer text</CardDescription>
              </CardHeader>
              <CardContent>
                <div>
                  <Label htmlFor="footerText">Footer Text</Label>
                  <Input
                    id="footerText"
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    placeholder="Thank you for your business"
                    maxLength={60}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Maximum 60 characters</p>
                </div>
              </CardContent>
            </Card>

            {/* Buttons */}
            <Card>
              <CardHeader>
                <CardTitle>Buttons (Optional)</CardTitle>
                <CardDescription>Add call-to-action or quick reply buttons (max 3)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => addButton("URL")} disabled={buttons.length >= 3}>
                    <Plus className="h-4 w-4 mr-2" />
                    URL Button
                  </Button>
                  <Button type="button" variant="outline" onClick={() => addButton("PHONE_NUMBER")} disabled={buttons.length >= 3}>
                    <Plus className="h-4 w-4 mr-2" />
                    Phone Button
                  </Button>
                  <Button type="button" variant="outline" onClick={() => addButton("QUICK_REPLY")} disabled={buttons.length >= 3}>
                    <Plus className="h-4 w-4 mr-2" />
                    Quick Reply
                  </Button>
                </div>

                {buttons.map((btn, idx) => (
                  <Card key={idx}>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <Label>Button {idx + 1} - {btn.type.replace('_', ' ')}</Label>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeButton(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        placeholder="Button text *"
                        value={btn.text}
                        onChange={(e) => updateButton(idx, 'text', e.target.value)}
                        maxLength={25}
                        required
                      />
                      {btn.type === "URL" && (
                        <Input
                          placeholder="https://example.com"
                          value={btn.url || ""}
                          onChange={(e) => updateButton(idx, 'url', e.target.value)}
                        />
                      )}
                      {btn.type === "PHONE_NUMBER" && (
                        <div className="flex gap-2">
                          <Select 
                            value={btn.phone_code || "+1"}
                            onValueChange={(code) => {
                              updateButton(idx, 'phone_code', code);
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue placeholder="Code" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="+1">🇺🇸 +1</SelectItem>
                              <SelectItem value="+44">🇬🇧 +44</SelectItem>
                              <SelectItem value="+91">🇮🇳 +91</SelectItem>
                              <SelectItem value="+86">🇨🇳 +86</SelectItem>
                              <SelectItem value="+81">🇯🇵 +81</SelectItem>
                              <SelectItem value="+49">🇩🇪 +49</SelectItem>
                              <SelectItem value="+33">🇫🇷 +33</SelectItem>
                              <SelectItem value="+61">🇦🇺 +61</SelectItem>
                              <SelectItem value="+55">🇧🇷 +55</SelectItem>
                              <SelectItem value="+971">🇦🇪 +971</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="1234567890"
                            type="tel"
                            value={btn.phone_number || ""}
                            onChange={(e) => {
                              const cleanedValue = e.target.value.replace(/\D/g, '');
                              updateButton(idx, 'phone_number', cleanedValue);
                            }}
                            className="flex-1"
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>

            <div className="flex gap-4">
              <Button onClick={handleSubmit} disabled={loading} className="flex-1">
                {loading ? "Submitting..." : "Submit Template for Approval"}
              </Button>
              <Button variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
            </div>
          </div>

          {/* Preview Section */}
          <div className="space-y-6">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>How your template will appear on WhatsApp</CardDescription>
              </CardHeader>
              <CardContent>
                {renderPreview()}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
