import type { Meta, StoryObj } from '@storybook/react';
import { StatusBadge } from './StatusBadge';

const meta: Meta<typeof StatusBadge> = {
  title: 'Common/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'select',
      options: ['active', 'inactive', 'pending', 'completed', 'failed', 'cancelled'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const Active: Story = {
  args: {
    status: 'active',
  },
};

export const Inactive: Story = {
  args: {
    status: 'inactive',
  },
};

export const Pending: Story = {
  args: {
    status: 'pending',
  },
};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="active" />
      <StatusBadge status="inactive" />
      <StatusBadge status="pending" />
      <StatusBadge status="completed" />
      <StatusBadge status="failed" />
      <StatusBadge status="cancelled" />
    </div>
  ),
};

export const InTable: Story = {
  render: () => (
    <div className="border rounded-lg">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-3 text-left text-sm font-medium">Name</th>
            <th className="p-3 text-left text-sm font-medium">Status</th>
            <th className="p-3 text-left text-sm font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="p-3 text-sm">Campaign A</td>
            <td className="p-3"><StatusBadge status="active" /></td>
            <td className="p-3 text-sm">2024-01-15</td>
          </tr>
          <tr className="border-b">
            <td className="p-3 text-sm">Campaign B</td>
            <td className="p-3"><StatusBadge status="pending" /></td>
            <td className="p-3 text-sm">2024-01-16</td>
          </tr>
          <tr className="border-b">
            <td className="p-3 text-sm">Campaign C</td>
            <td className="p-3"><StatusBadge status="completed" /></td>
            <td className="p-3 text-sm">2024-01-14</td>
          </tr>
          <tr>
            <td className="p-3 text-sm">Campaign D</td>
            <td className="p-3"><StatusBadge status="failed" /></td>
            <td className="p-3 text-sm">2024-01-13</td>
          </tr>
        </tbody>
      </table>
    </div>
  ),
};
