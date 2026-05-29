// Utility to trigger org context updates across the application
// Use this instead of polling to update org context

export const triggerOrgContextChange = () => {
  // Dispatch custom event for same-tab updates
  window.dispatchEvent(new Event("orgContextChange"));
  
  // For cross-tab communication, use storage event by updating sessionStorage
  // (will trigger storage event in other tabs)
  const currentValue = sessionStorage.getItem("platform_admin_impersonation");
  sessionStorage.setItem("platform_admin_impersonation", currentValue || "");
};

export const setImpersonation = (orgId: string, orgName: string) => {
  sessionStorage.setItem(
    "platform_admin_impersonation",
    JSON.stringify({ org_id: orgId, org_name: orgName })
  );
  triggerOrgContextChange();
};

export const clearImpersonation = () => {
  sessionStorage.removeItem("platform_admin_impersonation");
  triggerOrgContextChange();
};
