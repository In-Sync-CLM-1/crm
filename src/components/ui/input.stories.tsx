import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './input';
import { Label } from './label';
import { Mail, Search, Eye } from 'lucide-react';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'search', 'tel', 'url'],
    },
    disabled: {
      control: 'boolean',
    },
    placeholder: {
      control: 'text',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="space-y-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="name@example.com" />
    </div>
  ),
};

export const Types: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="text">Text</Label>
        <Input id="text" type="text" placeholder="Enter text" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="name@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" placeholder="••••••••" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="number">Number</Label>
        <Input id="number" type="number" placeholder="123" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="search">Search</Label>
        <Input id="search" type="search" placeholder="Search..." />
      </div>
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="relative">
        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Email" className="pl-10" />
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search" className="pl-10" />
      </div>
      <div className="relative">
        <Input type="password" placeholder="Password" className="pr-10" />
        <Eye className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
    placeholder: 'Disabled input',
  },
};

export const WithError: Story = {
  render: () => (
    <div className="space-y-2">
      <Label htmlFor="error-input">Email</Label>
      <Input 
        id="error-input" 
        type="email" 
        placeholder="name@example.com"
        className="border-destructive focus-visible:ring-destructive"
      />
      <p className="text-sm text-destructive">Please enter a valid email address</p>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="space-y-4">
      <Input placeholder="Default size" />
      <Input placeholder="Small" className="h-8 text-sm" />
      <Input placeholder="Large" className="h-12 text-base" />
    </div>
  ),
};
