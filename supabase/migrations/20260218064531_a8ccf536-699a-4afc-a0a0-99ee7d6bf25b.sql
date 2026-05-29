-- Allow admins/super_admins to delete support tickets
CREATE POLICY "Admins can delete support tickets"
ON public.support_tickets
FOR DELETE
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'super_admin')
  )
);

-- Allow admins/super_admins to delete support ticket comments (for cascade delete)
CREATE POLICY "Admins can delete ticket comments"
ON public.support_ticket_comments
FOR DELETE
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'super_admin')
  )
);

-- Allow admins/super_admins to delete support ticket history (for cascade delete)
CREATE POLICY "Admins can delete ticket history"
ON public.support_ticket_history
FOR DELETE
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'super_admin')
  )
);