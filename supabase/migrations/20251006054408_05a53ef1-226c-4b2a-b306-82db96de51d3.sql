-- Fix the create_default_call_dispositions function
DROP FUNCTION IF EXISTS public.create_default_call_dispositions(uuid);

CREATE OR REPLACE FUNCTION public.create_default_call_dispositions(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _interested_id UUID;
  _not_interested_id UUID;
  _callback_id UUID;
  _no_answer_id UUID;
BEGIN
  -- Insert main dispositions and capture IDs
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'Interested', 'Customer showed interest', 'positive')
    RETURNING id INTO _interested_id;
  
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'Not Interested', 'Customer not interested', 'negative')
    RETURNING id INTO _not_interested_id;
  
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'Callback Requested', 'Customer requested callback', 'follow_up')
    RETURNING id INTO _callback_id;
  
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'No Answer', 'No one answered the call', 'neutral')
    RETURNING id INTO _no_answer_id;
  
  INSERT INTO public.call_dispositions (org_id, name, description, category) VALUES
    (_org_id, 'Wrong Number', 'Incorrect contact number', 'neutral'),
    (_org_id, 'Voicemail', 'Left voicemail message', 'neutral'),
    (_org_id, 'Do Not Call', 'Customer requested no more calls', 'negative');

  -- Insert sub-dispositions
  INSERT INTO public.call_sub_dispositions (disposition_id, org_id, name, description) VALUES
    (_interested_id, _org_id, 'Ready to Buy', 'Customer ready to purchase'),
    (_interested_id, _org_id, 'Needs More Info', 'Interested but needs details'),
    (_interested_id, _org_id, 'Budget Approval', 'Needs budget approval'),
    (_not_interested_id, _org_id, 'Too Expensive', 'Price is too high'),
    (_not_interested_id, _org_id, 'No Need', 'Doesn''t need the product'),
    (_not_interested_id, _org_id, 'Using Competitor', 'Already using competitor'),
    (_callback_id, _org_id, 'Specific Time', 'Call at specific time'),
    (_callback_id, _org_id, 'After Decision', 'Call after internal decision'),
    (_no_answer_id, _org_id, 'Busy', 'Line was busy'),
    (_no_answer_id, _org_id, 'No Pickup', 'Phone rang but no pickup');
END;
$$;