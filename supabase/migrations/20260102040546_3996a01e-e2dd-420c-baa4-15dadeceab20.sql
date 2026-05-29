-- Create calendar_shares table for calendar sharing functionality
CREATE TABLE public.calendar_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    owner_id UUID NOT NULL,
    shared_with_id UUID NOT NULL,
    permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(owner_id, shared_with_id)
);

-- Enable Row Level Security
ALTER TABLE public.calendar_shares ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see shares where they are owner or recipient
CREATE POLICY "Users can view their shares"
    ON public.calendar_shares FOR SELECT
    USING (auth.uid() = owner_id OR auth.uid() = shared_with_id);

-- Policy: Users can create shares for their own calendar
CREATE POLICY "Users can share their calendar"
    ON public.calendar_shares FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

-- Policy: Users can update shares they created
CREATE POLICY "Users can update their shares"
    ON public.calendar_shares FOR UPDATE
    USING (auth.uid() = owner_id);

-- Policy: Users can delete shares they created
CREATE POLICY "Users can remove their shares"
    ON public.calendar_shares FOR DELETE
    USING (auth.uid() = owner_id);

-- Create trigger for updated_at
CREATE TRIGGER update_calendar_shares_updated_at
    BEFORE UPDATE ON public.calendar_shares
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();