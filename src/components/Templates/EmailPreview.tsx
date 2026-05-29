import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CTAButton } from "./CTAButtonManager";
import { Attachment } from "./AttachmentManager";

interface EmailPreviewProps {
  subject: string;
  bodyContent: string;
  buttons: CTAButton[];
  attachments: Attachment[];
}

export const EmailPreview = ({ subject, bodyContent, buttons, attachments }: EmailPreviewProps) => {
  // Replace variables with sample data for preview
  const sampleData: Record<string, string> = {
    first_name: "John",
    last_name: "Doe",
    email: "john.doe@example.com",
    phone: "+1 (555) 123-4567",
    company: "Acme Corp",
    job_title: "Marketing Director",
    address: "123 Main St",
    city: "New York",
    state: "NY",
    postal_code: "10001",
    country: "USA",
    website: "https://acme.com",
    linkedin_url: "https://linkedin.com/in/johndoe",
    source: "Website",
    status: "Active",
    notes: "Important client",
    referred_by: "Jane Smith",
  };

  const replaceVariables = (text: string) => {
    let result = text;
    Object.entries(sampleData).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    });
    return result;
  };

  const getButtonStyle = (style: CTAButton['style']): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      display: 'inline-block',
      padding: '12px 24px',
      borderRadius: '6px',
      textDecoration: 'none',
      fontWeight: '500',
      textAlign: 'center',
      margin: '10px 5px',
    };

    switch (style) {
      case 'primary':
        return { ...baseStyle, background: '#2563eb', color: 'white' };
      case 'secondary':
        return { ...baseStyle, background: '#6b7280', color: 'white' };
      case 'outline':
        return { ...baseStyle, background: 'transparent', color: '#2563eb', border: '2px solid #2563eb' };
      default:
        return baseStyle;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg p-4 bg-background">
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-1">Subject:</div>
            <div className="font-medium">{replaceVariables(subject) || "No subject"}</div>
          </div>
          
          <div className="border-t pt-4">
            {attachments.length > 0 && (
              <div className="mb-6 space-y-2">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="rounded overflow-hidden">
                    {attachment.type === 'image' ? (
                      <img 
                        src={attachment.url} 
                        alt={attachment.name}
                        className="max-w-full h-auto rounded"
                      />
                    ) : (
                      <video 
                        src={attachment.url} 
                        controls
                        className="max-w-full rounded"
                      >
                        Your browser does not support the video tag.
                      </video>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: replaceVariables(bodyContent) || "<p>No content</p>" }}
            />

            {buttons.length > 0 && (
              <div className="mt-6 text-center">
                {buttons.map((button) => (
                  <a
                    key={button.id}
                    href={replaceVariables(button.url) || "#"}
                    style={getButtonStyle(button.style)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {button.text || "Button"}
                  </a>
                ))}
              </div>
            )}

            {/* Unsubscribe footer preview */}
            <div className="mt-8 pt-4 border-t text-center">
              <p className="text-xs text-muted-foreground">
                You're receiving this email because you interacted with our platform.<br/>
                <a href="#" className="text-muted-foreground underline" onClick={(e) => e.preventDefault()}>
                  Unsubscribe
                </a> from these emails
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
