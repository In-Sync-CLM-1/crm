import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './badge';
import { Check, X, AlertCircle } from 'lucide-react';

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: {
    children: 'Badge',
  },
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">
        <Check className="mr-1 h-3 w-3" />
        Success
      </Badge>
      <Badge variant="destructive">
        <X className="mr-1 h-3 w-3" />
        Error
      </Badge>
      <Badge variant="secondary">
        <AlertCircle className="mr-1 h-3 w-3" />
        Warning
      </Badge>
    </div>
  ),
};

export const StatusBadges: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>
        <Badge className="bg-yellow-500 hover:bg-yellow-600">Pending</Badge>
        <Badge className="bg-red-500 hover:bg-red-600">Inactive</Badge>
        <Badge className="bg-blue-500 hover:bg-blue-600">Draft</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="border-green-500 text-green-700">Completed</Badge>
        <Badge variant="outline" className="border-yellow-500 text-yellow-700">In Progress</Badge>
        <Badge variant="outline" className="border-red-500 text-red-700">Failed</Badge>
      </div>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Badge className="text-xs px-1.5 py-0.5">Small</Badge>
      <Badge>Default</Badge>
      <Badge className="text-sm px-3 py-1">Large</Badge>
    </div>
  ),
};

export const Interactive: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge className="cursor-pointer">
        Clickable
        <X className="ml-1 h-3 w-3" />
      </Badge>
      <Badge variant="secondary" className="cursor-pointer">
        Remove
        <X className="ml-1 h-3 w-3" />
      </Badge>
    </div>
  ),
};

export const Numbers: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">1</Badge>
      <Badge variant="secondary">99+</Badge>
      <Badge variant="outline">NEW</Badge>
      <Badge variant="destructive">!</Badge>
    </div>
  ),
};
