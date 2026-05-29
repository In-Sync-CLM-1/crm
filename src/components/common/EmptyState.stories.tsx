import type { Meta, StoryObj } from '@storybook/react';
import { EmptyState } from './EmptyState';
import { Button } from '@/components/ui/button';
import { Plus, Mail, Users, FileText } from 'lucide-react';

const meta: Meta<typeof EmptyState> = {
  title: 'Common/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: 'text',
      description: 'Main heading text',
    },
    message: {
      control: 'text',
      description: 'Supporting message text',
    },
  },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    title: 'No items found',
    message: 'Get started by creating your first item',
  },
};

export const WithIcon: Story = {
  render: () => (
    <EmptyState
      title="No contacts yet"
      message="Add your first contact to get started"
      icon={<Users className="h-12 w-12 text-muted-foreground" />}
    />
  ),
};

export const WithAction: Story = {
  render: () => (
    <EmptyState
      title="No campaigns"
      message="Create your first email campaign to reach your audience"
      icon={<Mail className="h-12 w-12 text-muted-foreground" />}
      action={
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Campaign
        </Button>
      }
    />
  ),
};

export const DifferentIcons: Story = {
  render: () => (
    <div className="space-y-8">
      <EmptyState
        title="No emails"
        message="Your inbox is empty"
        icon={<Mail className="h-12 w-12 text-muted-foreground" />}
      />
      <EmptyState
        title="No documents"
        message="Upload your first document"
        icon={<FileText className="h-12 w-12 text-muted-foreground" />}
      />
      <EmptyState
        title="No team members"
        message="Invite people to join your team"
        icon={<Users className="h-12 w-12 text-muted-foreground" />}
      />
    </div>
  ),
};

export const WithMultipleActions: Story = {
  render: () => (
    <EmptyState
      title="No data available"
      message="Import data or create manually"
      icon={<FileText className="h-12 w-12 text-muted-foreground" />}
      action={
        <div className="flex gap-2">
          <Button variant="outline">
            Import
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create New
          </Button>
        </div>
      }
    />
  ),
};

export const InCard: Story = {
  render: () => (
    <div className="border rounded-lg p-6 min-h-[300px]">
      <EmptyState
        title="No results"
        message="Try adjusting your search criteria"
        icon={<FileText className="h-12 w-12 text-muted-foreground" />}
      />
    </div>
  ),
};
