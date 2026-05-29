-- Add delete policies for support_ticket_notifications
CREATE POLICY "Admins can delete ticket notifications"
ON public.support_ticket_notifications
FOR DELETE
USING (
  org_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

-- Add delete policy for support_ticket_escalations
CREATE POLICY "Admins can delete ticket escalations"
ON public.support_ticket_escalations
FOR DELETE
USING (
  org_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);