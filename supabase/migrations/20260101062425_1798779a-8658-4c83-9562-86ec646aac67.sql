-- Add reminder tracking columns to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_sent boolean DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS morning_reminder_sent boolean DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pre_action_reminder_sent boolean DEFAULT false;