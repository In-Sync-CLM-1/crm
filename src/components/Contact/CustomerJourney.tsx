import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/hooks/useNotification";
import { Phone, Mail, Calendar, FileText, CheckCircle2, Clock, Video, MailOpen, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow, format } from "date-fns";
import { CallRecordingPlayer } from "./CallRecordingPlayer";
import { toast } from "@/hooks/use-toast";

interface Activity {
  id: string;
  activity_type: string;
  subject: string | null;
  description: string | null;
  created_at: string;
  call_duration: number | null;
  meeting_link: string | null;
  meeting_duration_minutes: number | null;
  scheduled_at: string | null;
  reminder_sent: boolean | null;
  next_action_date: string | null;
  next_action_notes: string | null;
  call_log_id?: string | null;
  recording_url?: string | null;
  profiles: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  call_dispositions: {
    name: string;
    category: string;
  } | null;
  activity_participants?: Array<{
    id: string;
    name: string;
    email: string;
    response_status: string;
    profiles: {
      first_name: string;
      last_name: string | null;
    } | null;
  }>;
}

interface EmailConversation {
  id: string;
  subject: string | null;
  email_content: string | null;
  sent_at: string;
  direction: string;
  status: string;
  from_email: string;
  to_email: string;
  is_read: boolean;
}

interface TimelineItem {
  id: string;
  type: 'activity' | 'email';
  timestamp: string;
  activity?: Activity;
  email?: EmailConversation;
}

interface CustomerJourneyProps {
  contactId: string;
}

export const CustomerJourney = ({ contactId }: CustomerJourneyProps) => {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const [displayCount, setDisplayCount] = useState(3);
  const [isSyncing, setIsSyncing] = useState(false);
  const notify = useNotification();

  useEffect(() => {
    fetchTimeline();

    const activitiesChannel = supabase
      .channel(`contact_activities_${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contact_activities",
          filter: `contact_id=eq.${contactId}`,
        },
        () => {
          fetchTimeline();
        }
      )
      .subscribe();

    const emailsChannel = supabase
      .channel(`email_conversations_${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "email_conversations",
          filter: `contact_id=eq.${contactId}`,
        },
        () => {
          fetchTimeline();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(activitiesChannel);
      supabase.removeChannel(emailsChannel);
    };
  }, [contactId]);

  const fetchTimeline = async () => {
    try {
      // Fetch activities
      const { data: activitiesData, error: activitiesError } = await supabase
        .from("contact_activities")
        .select(
          `
          id,
          activity_type,
          subject,
          description,
          created_at,
          call_duration,
          meeting_link,
          meeting_duration_minutes,
          scheduled_at,
          reminder_sent,
          next_action_date,
          next_action_notes,
          profiles!contact_activities_created_by_fkey (
            first_name,
            last_name
          ),
          call_dispositions (
            name,
            category
          ),
          activity_participants (
            id,
            name,
            email,
            response_status,
            profiles:user_id (first_name, last_name)
          )
        `
        )
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });

      if (activitiesError) throw activitiesError;

      // Fetch call logs for activities with recordings
      const callActivityIds = (activitiesData || [])
        .filter(a => a.activity_type === 'call')
        .map(a => a.id);
      
      const callLogsMap = new Map<string, { id: string; recording_url: string | null }>();
      
      if (callActivityIds.length > 0) {
        const { data: callLogs } = await supabase
          .from('call_logs')
          .select('id, activity_id, recording_url')
          .in('activity_id', callActivityIds)
          .not('recording_url', 'is', null);
        
        if (callLogs) {
          callLogs.forEach(log => {
            if (log.activity_id) {
              callLogsMap.set(log.activity_id, { id: log.id, recording_url: log.recording_url });
            }
          });
        }
      }

      // Enrich activities with call log data
      const enrichedActivities = (activitiesData || []).map(act => {
        if (act.activity_type === 'call' && callLogsMap.has(act.id)) {
          const callLog = callLogsMap.get(act.id);
          return {
            ...act,
            call_log_id: callLog?.id,
            recording_url: callLog?.recording_url,
          };
        }
        return act;
      });

      // Fetch email conversations
      const { data: emailsData, error: emailsError } = await supabase
        .from("email_conversations")
        .select("id, subject, email_content, sent_at, direction, status, from_email, to_email, is_read")
        .eq("contact_id", contactId)
        .order("sent_at", { ascending: false });

      if (emailsError) throw emailsError;

      // Merge and create unified timeline
      const activityItems: TimelineItem[] = enrichedActivities.map(act => ({
        id: `activity-${act.id}`,
        type: 'activity' as const,
        timestamp: act.created_at,
        activity: act,
      }));

      const emailItems: TimelineItem[] = (emailsData || []).map(email => ({
        id: `email-${email.id}`,
        type: 'email' as const,
        timestamp: email.sent_at,
        email,
      }));

      // Combine and sort by timestamp (newest first)
      const combinedTimeline = [...activityItems, ...emailItems].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setTimeline(combinedTimeline);
    } catch (error: any) {
      console.error("Error fetching timeline:", error);
      notify.error("Error", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncRecordings = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('exotel-sync-call-logs');
      
      if (error) throw error;
      
      toast({
        title: "Recordings synced",
        description: "Call recordings have been synced from Exotel",
      });
      
      // Refetch timeline to show updated recordings
      await fetchTimeline();
    } catch (error) {
      console.error('Error syncing recordings:', error);
      toast({
        title: "Sync failed",
        description: "Failed to sync recordings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleEmailExpansion = (emailId: string) => {
    setExpandedEmails(prev => {
      const newSet = new Set(prev);
      if (newSet.has(emailId)) {
        newSet.delete(emailId);
      } else {
        newSet.add(emailId);
      }
      return newSet;
    });
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "call":
        return Phone;
      case "email":
        return Mail;
      case "meeting":
        return Calendar;
      case "note":
        return FileText;
      default:
        return FileText;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case "call":
        return "bg-blue-500";
      case "email":
        return "bg-purple-500";
      case "meeting":
        return "bg-green-500";
      case "note":
        return "bg-orange-500";
      default:
        return "bg-gray-500";
    }
  };

  const getDispositionColor = (category: string | undefined) => {
    switch (category) {
      case "positive":
        return "text-green-600";
      case "negative":
        return "text-red-600";
      case "follow_up":
        return "text-yellow-600";
      default:
        return "text-gray-600";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <Card className="p-8 text-center">
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">No customer journey yet</p>
      </Card>
    );
  }

  const visibleTimeline = timeline.slice(0, displayCount);
  const hasMore = timeline.length > displayCount;

  const handleLoadMore = () => {
    setDisplayCount(prev => prev + 10);
  };

  return (
    <div className="space-y-4">
      {/* Header with Sync Button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Customer Journey</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncRecordings}
          disabled={isSyncing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync Recordings'}
        </Button>
      </div>

      <div className="relative">
        {/* Vertical timeline line */}
        <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-border" />

      <div className="space-y-6">
        {visibleTimeline.map((item, index) => {
          if (item.type === 'activity' && item.activity) {
            const activity = item.activity;
            const Icon = getActivityIcon(activity.activity_type);
            const colorClass = getActivityColor(activity.activity_type);

            return (
              <div key={item.id} className="relative pl-20">
                {/* Timeline dot and icon */}
                <div className={`absolute left-4 w-8 h-8 rounded-full ${colorClass} flex items-center justify-center shadow-lg`}>
                  <Icon className="h-4 w-4 text-white" />
                </div>

                {/* Activity card */}
                <Card className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-sm capitalize flex items-center gap-2">
                        {activity.activity_type}
                        {activity.call_dispositions && (
                          <CheckCircle2 className={`h-4 w-4 ${getDispositionColor(activity.call_dispositions.category)}`} />
                        )}
                      </h4>
                      {activity.subject && (
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm text-foreground">{activity.subject}</p>
                          {activity.activity_type === 'email' && activity.subject?.startsWith('Reply:') && (
                            <Badge variant="default" className="text-xs">Received</Badge>
                          )}
                          {activity.activity_type === 'email' && !activity.subject?.startsWith('Reply:') && (
                            <Badge variant="secondary" className="text-xs">Sent</Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="text-xs font-medium text-foreground">
                        {format(new Date(activity.created_at), 'MMM d, yyyy')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>

                  {activity.description && (
                    <p className="text-sm text-muted-foreground mb-2">{activity.description}</p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {activity.profiles && (
                      <span>
                        By {activity.profiles.first_name} {activity.profiles.last_name}
                      </span>
                    )}
                    {activity.call_duration && (
                      <span>Duration: {Math.floor(activity.call_duration / 60)}:{(activity.call_duration % 60).toString().padStart(2, "0")}</span>
                    )}
                    {activity.call_dispositions && (
                      <span className={getDispositionColor(activity.call_dispositions.category)}>
                        {activity.call_dispositions.name}
                      </span>
                    )}
                  </div>

                  {/* Callback Reminder */}
                  {activity.next_action_date && (
                    <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-yellow-700 dark:text-yellow-300">Callback Scheduled</span>
                            <Badge variant="secondary" className="bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 text-xs">
                              {format(new Date(activity.next_action_date), 'MMM d, yyyy h:mm a')}
                            </Badge>
                          </div>
                          {activity.next_action_notes && (
                            <p className="text-xs text-yellow-600 dark:text-yellow-400">{activity.next_action_notes}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Call Recording Player */}
                  {activity.activity_type === 'call' && activity.call_log_id && activity.recording_url && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Recording:</span>
                      <CallRecordingPlayer callLogId={activity.call_log_id} variant="outline" size="sm" />
                    </div>
                  )}

                  {activity.activity_type === 'meeting' && (
                    <div className="mt-3 space-y-2">
                      {activity.meeting_link && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(activity.meeting_link!, '_blank')}
                            className="flex items-center gap-2"
                          >
                            <Video className="h-4 w-4" />
                            Join Google Meet
                          </Button>
                          {activity.scheduled_at && new Date(activity.scheduled_at) > new Date() && (
                            <Badge variant="secondary">
                              {format(new Date(activity.scheduled_at), 'MMM d, h:mm a')}
                            </Badge>
                          )}
                        </div>
                      )}
                      
                      {activity.activity_participants && activity.activity_participants.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {activity.activity_participants.map(p => (
                            <Badge key={p.id} variant="outline" className="text-xs">
                              {p.profiles ? `${p.profiles.first_name} ${p.profiles.last_name || ''}` : p.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      {activity.reminder_sent && (
                        <Badge variant="secondary" className="text-xs">
                          Reminder sent
                        </Badge>
                      )}
                    </div>
                  )}
                </Card>

                {/* Connector line to next item */}
                {index < timeline.length - 1 && (
                  <div className="absolute left-8 top-12 w-0.5 h-6 bg-border" />
                )}
              </div>
            );
          }

          // Email conversation rendering
          if (item.type === 'email' && item.email) {
            const email = item.email;
            const isInbound = email.direction === 'inbound';
            const isExpanded = expandedEmails.has(email.id);
            const emailPreview = email.email_content?.substring(0, 150) || '';

            return (
              <div key={item.id} className="relative pl-20">
                {/* Timeline dot and icon */}
                <div className={`absolute left-4 w-8 h-8 rounded-full ${isInbound ? 'bg-green-500' : 'bg-blue-500'} flex items-center justify-center shadow-lg`}>
                  <Mail className="h-4 w-4 text-white" />
                </div>

                {/* Email card */}
                <Card className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-sm">Email</h4>
                        <Badge variant={isInbound ? "default" : "secondary"} className="text-xs">
                          {isInbound ? 'Received' : 'Sent'}
                        </Badge>
                        {email.status && email.status !== 'sent' && (
                          <Badge variant="outline" className="text-xs">
                            {email.status}
                          </Badge>
                        )}
                        {isInbound && !email.is_read && (
                          <div className="w-2 h-2 rounded-full bg-blue-500" title="Unread" />
                        )}
                      </div>
                      {email.subject && (
                        <p className="text-sm text-foreground font-medium">{email.subject}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{isInbound ? 'From' : 'To'}:</span>
                        <span className="font-mono">{isInbound ? email.from_email : email.to_email}</span>
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap ml-4">
                      <div className="text-xs font-medium text-foreground">
                        {format(new Date(email.sent_at), 'MMM d, yyyy')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(email.sent_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>

                  {email.email_content && (
                    <div className="mt-3">
                      <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded border">
                        {isExpanded ? (
                          <div className="whitespace-pre-wrap">{email.email_content}</div>
                        ) : (
                          <div>{emailPreview}{email.email_content.length > 150 && '...'}</div>
                        )}
                      </div>
                      {email.email_content.length > 150 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleEmailExpansion(email.id)}
                          className="mt-2 h-8 text-xs"
                        >
                          {isExpanded ? 'Show less' : 'Read more'}
                        </Button>
                      )}
                    </div>
                  )}
                </Card>

                {/* Connector line to next item */}
                {index < visibleTimeline.length - 1 && (
                  <div className="absolute left-8 top-12 w-0.5 h-6 bg-border" />
                )}
              </div>
            );
          }

          return null;
        })}

        {/* Load More Button */}
        {hasMore && (
          <div className="relative pl-20">
            <Card className="p-4 text-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                className="w-full"
              >
                Load More ({timeline.length - displayCount} more activities)
              </Button>
            </Card>
          </div>
        )}
      </div>
    </div>
    </div>
  );
};
