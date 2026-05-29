import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Mail, Clock, CheckCircle2, XCircle, 
  AlertCircle, Send, Eye, MousePointer,
  TrendingUp, ArrowRight 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface EmailAutomationJourneyProps {
  contactId: string;
  orgId: string;
}

export function EmailAutomationJourney({ contactId, orgId }: EmailAutomationJourneyProps) {
  const { data: executions, isLoading } = useQuery({
    queryKey: ['email-automation-journey', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_automation_executions')
        .select(`
          *,
          rule:email_automation_rules(name, trigger_type),
          email:email_conversations(
            subject,
            opened_at,
            first_clicked_at,
            open_count,
            click_count
          )
        `)
        .eq('contact_id', contactId)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Automation Journey
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Loading journey...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!executions || executions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Automation Journey
          </CardTitle>
          <CardDescription>
            Track automated emails sent to this contact
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No automated emails sent yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Automation Journey
        </CardTitle>
        <CardDescription>
          {executions.length} automated email{executions.length !== 1 ? 's' : ''} 
          {' '}in timeline
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-4">
            {executions.map((execution, index) => (
              <div key={execution.id} className="relative">
                {index !== executions.length - 1 && (
                  <div className="absolute left-[19px] top-12 h-full w-px bg-border" />
                )}
                <JourneyItem execution={execution} />
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function JourneyItem({ execution }: { execution: any }) {
  const getStatusIcon = () => {
    switch (execution.status) {
      case 'sent':
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'scheduled':
        return <Clock className="h-5 w-5 text-warning" />;
      case 'pending':
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
      default:
        return <Mail className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusColor = () => {
    switch (execution.status) {
      case 'sent':
        return 'default';
      case 'failed':
        return 'destructive';
      case 'scheduled':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const hasEngagement = execution.email && (
    execution.email.opened_at || execution.email.first_clicked_at
  );

  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 mt-1">
        <div className="p-2 rounded-full bg-background border">
          {getStatusIcon()}
        </div>
      </div>
      
      <div className="flex-1 space-y-2 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{execution.rule?.name || 'Unknown Rule'}</span>
              <Badge variant={getStatusColor()}>
                {execution.status}
              </Badge>
              {execution.ab_variant_name && (
                <Badge variant="outline" className="text-xs">
                  Variant: {execution.ab_variant_name}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {execution.trigger_type} trigger
            </p>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDistanceToNow(new Date(execution.created_at), { addSuffix: true })}
          </span>
        </div>

        {execution.email_subject && (
          <div className="text-sm">
            <span className="text-muted-foreground">Subject: </span>
            <span>{execution.email_subject}</span>
          </div>
        )}

        {execution.status === 'sent' && execution.sent_at && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Send className="h-3 w-3" />
            Sent {formatDistanceToNow(new Date(execution.sent_at), { addSuffix: true })}
          </div>
        )}

        {execution.status === 'scheduled' && execution.scheduled_for && (
          <div className="flex items-center gap-2 text-sm text-warning">
            <Clock className="h-3 w-3" />
            Scheduled for {new Date(execution.scheduled_for).toLocaleString()}
          </div>
        )}

        {execution.status === 'failed' && execution.error_message && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <XCircle className="h-3 w-3" />
            {execution.error_message}
            {execution.retry_count > 0 && (
              <span className="text-xs">
                (Retry {execution.retry_count}/{execution.max_retries})
              </span>
            )}
          </div>
        )}

        {hasEngagement && (
          <div className="mt-2 p-3 bg-muted/50 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-primary" />
              Email Engagement
            </div>
            {execution.email.opened_at && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Eye className="h-3 w-3" />
                Opened {execution.email.open_count}x
                <span className="text-xs">
                  (first: {formatDistanceToNow(new Date(execution.email.opened_at), { addSuffix: true })})
                </span>
              </div>
            )}
            {execution.email.first_clicked_at && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MousePointer className="h-3 w-3" />
                Clicked {execution.email.click_count}x
                <span className="text-xs">
                  (first: {formatDistanceToNow(new Date(execution.email.first_clicked_at), { addSuffix: true })})
                </span>
              </div>
            )}
          </div>
        )}

        {execution.converted_at && (
          <div className="mt-2 p-3 bg-success/10 rounded-lg">
            <div className="flex items-center gap-2 text-sm font-medium text-success">
              <CheckCircle2 className="h-4 w-4" />
              Converted
              <ArrowRight className="h-3 w-3" />
              {execution.conversion_type?.replace('_', ' ')}
            </div>
            {execution.conversion_value && (
              <div className="text-sm text-muted-foreground mt-1">
                Value: ${execution.conversion_value}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
