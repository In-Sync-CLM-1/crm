/**
 * Type-safe JSON value that can be stored in database JSON columns
 */
export type JSONValue = 
  | string 
  | number 
  | boolean 
  | null 
  | JSONValue[] 
  | { [key: string]: JSONValue };

/**
 * Generic database record with common fields
 */
export interface BaseRecord {
  id: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Generic organization-scoped record
 */
export interface OrgRecord extends BaseRecord {
  org_id: string;
}

/**
 * Generic filter condition for query builders
 */
export interface FilterCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in';
  value: string | number | boolean | null;
}

/**
 * Generic API error response
 */
export interface APIError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Generic form field option
 */
export interface FormFieldOption {
  label: string;
  value: string;
}

/**
 * Activity data for contact interactions
 */
export interface ActivityData {
  contact_id: string;
  user_id: string;
  activity_type: string;
  activity_notes: string;
  disposition_id?: string;
  sub_disposition_id?: string;
  scheduled_at?: string;
  participants?: string[];
  meeting_link?: string;
}

/**
 * Import error details
 */
export interface ImportErrorDetails {
  message: string;
  row?: number;
  field?: string;
  value?: string;
}

/**
 * Import stage details
 */
export interface ImportStageDetails {
  stage: 'parsing' | 'validation' | 'processing' | 'complete';
  current: number;
  total: number;
  errors: string[];
}
