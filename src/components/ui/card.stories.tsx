import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';
import { Button } from './button';
import { Bell, Check } from 'lucide-react';

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here</CardDescription>
      </CardHeader>
      <CardContent>
        <p>This is the card content area where you can place any content.</p>
      </CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Create Project</CardTitle>
        <CardDescription>Deploy your new project in one-click</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Click the button below to create your new project.
        </p>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline">Cancel</Button>
        <Button>Deploy</Button>
      </CardFooter>
    </Card>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Bell className="h-5 w-5 text-primary" />
          <CardTitle>Notifications</CardTitle>
        </div>
        <CardDescription>You have 3 unread messages</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Check className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm">Your call has been confirmed</p>
          </div>
          <div className="flex items-center space-x-2">
            <Check className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm">You have a new message</p>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
};

export const Interactive: Story = {
  render: () => (
    <Card className="cursor-pointer transition-colors hover:bg-accent">
      <CardHeader>
        <CardTitle>Clickable Card</CardTitle>
        <CardDescription>This card has hover effects</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Hover over this card to see the effect.
        </p>
      </CardContent>
    </Card>
  ),
};

export const Grid: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <CardTitle>Card {i + 1}</CardTitle>
            <CardDescription>Card description</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Content for card {i + 1}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  ),
};

export const WithVariants: Story = {
  render: () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Default Card</CardTitle>
        </CardHeader>
        <CardContent>Standard card with default styling</CardContent>
      </Card>
      
      <Card className="border-primary">
        <CardHeader>
          <CardTitle>Primary Border</CardTitle>
        </CardHeader>
        <CardContent>Card with primary color border</CardContent>
      </Card>
      
      <Card className="bg-muted">
        <CardHeader>
          <CardTitle>Muted Background</CardTitle>
        </CardHeader>
        <CardContent>Card with muted background color</CardContent>
      </Card>
    </div>
  ),
};
