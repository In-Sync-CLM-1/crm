-- Fix storage RLS policy for import-files bucket to use org_id instead of user_id

-- Drop the old policy that checks user_id
DROP POLICY IF EXISTS "Users can upload their own import files" ON storage.objects;

-- Create new policy that allows uploads to org folder
CREATE POLICY "Users can upload import files to their org"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'import-files' 
  AND (storage.foldername(name))[1] = (
    SELECT org_id::text 
    FROM public.profiles 
    WHERE id = auth.uid()
  )
);

-- Also update the SELECT policy to use org_id
DROP POLICY IF EXISTS "Users can read their own import files" ON storage.objects;

CREATE POLICY "Users can read import files in their org"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'import-files' 
  AND (storage.foldername(name))[1] = (
    SELECT org_id::text 
    FROM public.profiles 
    WHERE id = auth.uid()
  )
);

-- Update DELETE policy similarly
DROP POLICY IF EXISTS "System can delete import files" ON storage.objects;

CREATE POLICY "Users can delete import files in their org"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'import-files' 
  AND (storage.foldername(name))[1] = (
    SELECT org_id::text 
    FROM public.profiles 
    WHERE id = auth.uid()
  )
);