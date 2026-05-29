import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Linkedin, Twitter, Github, Facebook, Briefcase, Building2, 
  GraduationCap, MapPin, Calendar 
} from "lucide-react";
import { format } from "date-fns";

interface EnrichedFieldsSectionProps {
  contact: {
    linkedin_url?: string | null;
    twitter_url?: string | null;
    github_url?: string | null;
    facebook_url?: string | null;
    photo_url?: string | null;
    headline?: string | null;
    seniority?: string | null;
    departments?: string[] | null;
    person_locations?: any;
    employment_history?: any[] | null;
    education?: any[] | null;
    phone_numbers?: any[] | null;
    organization_name?: string | null;
    organization_founded_year?: number | null;
    organization_industry?: string | null;
    organization_keywords?: string[] | null;
    last_enriched_at?: string | null;
    enrichment_status?: string | null;
  };
}

export function EnrichedFieldsSection({ contact }: EnrichedFieldsSectionProps) {
  const hasEnrichedData = contact.linkedin_url || contact.twitter_url || contact.github_url || 
                          contact.facebook_url || contact.headline || contact.employment_history;

  if (!hasEnrichedData) {
    return null;
  }

  const getSeverityColor = (seniority?: string | null) => {
    if (!seniority) return "bg-muted";
    const lower = seniority.toLowerCase();
    if (lower.includes("c-level") || lower.includes("vp")) return "bg-purple-500";
    if (lower.includes("director") || lower.includes("head")) return "bg-blue-500";
    if (lower.includes("manager") || lower.includes("lead")) return "bg-green-500";
    return "bg-muted";
  };

  return (
    <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Apollo Enriched Data
              {contact.enrichment_status === "enriched" && (
                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                  Verified
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {contact.last_enriched_at && (
                <span className="text-xs">
                  Last enriched: {format(new Date(contact.last_enriched_at), "MMM d, yyyy")}
                </span>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Professional Information */}
        {(contact.headline || contact.seniority || contact.departments) && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Professional Information
            </h3>
            {contact.headline && (
              <p className="text-sm text-muted-foreground">{contact.headline}</p>
            )}
            <div className="flex gap-2 flex-wrap">
              {contact.seniority && (
                <Badge className={getSeverityColor(contact.seniority)}>
                  {contact.seniority}
                </Badge>
              )}
              {contact.departments?.map((dept, i) => (
                <Badge key={i} variant="outline">{dept}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Social Profiles */}
        {(contact.linkedin_url || contact.twitter_url || contact.github_url || contact.facebook_url) && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Social Profiles</h3>
              <div className="flex flex-wrap gap-3">
                {contact.linkedin_url && (
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm hover:underline text-blue-600"
                  >
                    <Linkedin className="h-4 w-4" />
                    LinkedIn
                  </a>
                )}
                {contact.twitter_url && (
                  <a
                    href={contact.twitter_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm hover:underline text-blue-400"
                  >
                    <Twitter className="h-4 w-4" />
                    Twitter
                  </a>
                )}
                {contact.github_url && (
                  <a
                    href={contact.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm hover:underline"
                  >
                    <Github className="h-4 w-4" />
                    GitHub
                  </a>
                )}
                {contact.facebook_url && (
                  <a
                    href={contact.facebook_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm hover:underline text-blue-700"
                  >
                    <Facebook className="h-4 w-4" />
                    Facebook
                  </a>
                )}
              </div>
            </div>
          </>
        )}

        {/* Company Information */}
        {(contact.organization_name || contact.organization_industry) && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Current Company
              </h3>
              {contact.organization_name && (
                <div>
                  <p className="font-medium">{contact.organization_name}</p>
                  {contact.organization_founded_year && (
                    <p className="text-xs text-muted-foreground">
                      Founded: {contact.organization_founded_year}
                    </p>
                  )}
                </div>
              )}
              {contact.organization_industry && (
                <Badge variant="secondary">{contact.organization_industry}</Badge>
              )}
              {contact.organization_keywords && contact.organization_keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {contact.organization_keywords.slice(0, 5).map((keyword, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Employment History */}
        {contact.employment_history && contact.employment_history.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Employment History
              </h3>
              <div className="space-y-3">
                {contact.employment_history.slice(0, 3).map((job: any, i: number) => (
                  <div key={i} className="border-l-2 border-muted pl-3">
                    <p className="font-medium text-sm">{job.title}</p>
                    <p className="text-sm text-muted-foreground">{job.organization_name}</p>
                    {job.start_date && (
                      <p className="text-xs text-muted-foreground">
                        {job.start_date} - {job.end_date || "Present"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Education */}
        {contact.education && contact.education.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                Education
              </h3>
              <div className="space-y-2">
                {contact.education.slice(0, 2).map((edu: any, i: number) => (
                  <div key={i}>
                    <p className="font-medium text-sm">{edu.school_name}</p>
                    {edu.degree && (
                      <p className="text-sm text-muted-foreground">
                        {edu.degree} {edu.field_of_study && `in ${edu.field_of_study}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Location */}
        {contact.person_locations && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location
              </h3>
              <p className="text-sm text-muted-foreground">
                {[
                  contact.person_locations.city,
                  contact.person_locations.state,
                  contact.person_locations.country,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
