import type { Meta, StoryObj } from '@storybook/react';
import { LoadingState } from './LoadingState';

const meta: Meta<typeof LoadingState> = {
  title: 'Common/LoadingState',
  component: LoadingState,
  tags: ['autodocs'],
  argTypes: {
    message: {
      control: 'text',
      description: 'Custom loading message',
    },
  },
};

export default meta;
type Story = StoryObj<typeof LoadingState>;

export const Default: Story = {
  args: {},
};

export const WithCustomMessage: Story = {
  args: {
    message: 'Please wait while we fetch your data...',
  },
};

export const InCard: Story = {
  render: () => (
    <div className="border rounded-lg p-6 min-h-[200px]">
      <LoadingState message="Loading contacts..." />
    </div>
  ),
};

export const Multiple: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="border rounded-lg p-6">
        <LoadingState message="Loading dashboard..." />
      </div>
      <div className="border rounded-lg p-6">
        <LoadingState message="Fetching analytics..." />
      </div>
      <div className="border rounded-lg p-6">
        <LoadingState />
      </div>
    </div>
  ),
};
