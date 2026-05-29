-- Drop existing DELETE policy on contacts
DROP POLICY IF EXISTS "Admins and managers can delete contacts" ON contacts;

-- Create updated DELETE policy that includes sales_agent
CREATE POLICY "Authorized users can delete contacts"
ON contacts FOR DELETE
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN (
      'admin', 
      'super_admin', 
      'sales_manager', 
      'support_manager', 
      'sales_agent'
    )
  )
);