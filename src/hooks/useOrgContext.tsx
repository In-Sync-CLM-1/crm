import { useOrgContextProvider } from "@/contexts/OrgContextProvider";

/**
 * Organization context hook for multi-tenant applications
 * 
 * This hook now delegates to the centralized OrgContextProvider
 * to eliminate duplicate state management and database queries.
 * 
 * @returns Organization context state
 * @property {string | null} userOrgId - User's actual organization ID
 * @property {string | null} effectiveOrgId - Active org ID (considers impersonation)
 * @property {boolean} isPlatformAdmin - Whether user has platform admin privileges
 * @property {boolean} isImpersonating - Whether admin is impersonating another org
 * @property {boolean} isLoading - Loading state during context initialization
 * 
 * @example
 * ```tsx
 * const { effectiveOrgId, isPlatformAdmin } = useOrgContext();
 * if (!effectiveOrgId) return <LoadingState />;
 * ```
 */
export function useOrgContext() {
  const context = useOrgContextProvider();
  
  return {
    userOrgId: context.userOrgId,
    effectiveOrgId: context.effectiveOrgId,
    isPlatformAdmin: context.isPlatformAdmin,
    isImpersonating: context.isImpersonating,
    isLoading: context.isLoading,
  };
}
