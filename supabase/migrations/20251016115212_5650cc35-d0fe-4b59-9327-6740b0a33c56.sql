-- Add referred_by field to contacts table
ALTER TABLE contacts 
ADD COLUMN referred_by text;