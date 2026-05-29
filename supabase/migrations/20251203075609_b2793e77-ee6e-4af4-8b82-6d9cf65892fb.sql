-- Make the client-documents bucket public so files can be accessed
UPDATE storage.buckets 
SET public = true 
WHERE id = 'client-documents';