import type { Meta, StoryObj } from '@storybook/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Button } from './button';

const meta: Meta<typeof Tabs> = {
  title: 'UI/Tabs',
  component: Tabs,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <p className="text-sm text-muted-foreground">
          Make changes to your account here.
        </p>
      </TabsContent>
      <TabsContent value="password">
        <p className="text-sm text-muted-foreground">
          Change your password here.
        </p>
      </TabsContent>
    </Tabs>
  ),
};

export const WithCards: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-full max-w-2xl">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>
              View your account overview and recent activity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">
              <strong>Total Users:</strong> 1,234
            </div>
            <div className="text-sm">
              <strong>Active Sessions:</strong> 456
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="analytics">
        <Card>
          <CardHeader>
            <CardTitle>Analytics</CardTitle>
            <CardDescription>
              Detailed analytics and performance metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">Analytics content goes here.</div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="reports">
        <Card>
          <CardHeader>
            <CardTitle>Reports</CardTitle>
            <CardDescription>
              Generate and download reports.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button>Generate Report</Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
};

export const Vertical: Story = {
  render: () => (
    <Tabs defaultValue="profile" className="flex gap-4 w-full max-w-2xl">
      <TabsList className="flex-col h-fit">
        <TabsTrigger value="profile" className="w-full">Profile</TabsTrigger>
        <TabsTrigger value="security" className="w-full">Security</TabsTrigger>
        <TabsTrigger value="notifications" className="w-full">Notifications</TabsTrigger>
        <TabsTrigger value="billing" className="w-full">Billing</TabsTrigger>
      </TabsList>
      <div className="flex-1">
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Manage your profile information.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Configure security options.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Choose what notifications you receive.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Billing Information</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Manage your billing and subscriptions.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </div>
    </Tabs>
  ),
};

export const FullWidth: Story = {
  render: () => (
    <Tabs defaultValue="all" className="w-full">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="completed">Completed</TabsTrigger>
        <TabsTrigger value="archived">Archived</TabsTrigger>
      </TabsList>
      <TabsContent value="all">
        <div className="border rounded-lg p-4">
          <p className="text-sm">All items displayed here</p>
        </div>
      </TabsContent>
      <TabsContent value="active">
        <div className="border rounded-lg p-4">
          <p className="text-sm">Active items displayed here</p>
        </div>
      </TabsContent>
      <TabsContent value="completed">
        <div className="border rounded-lg p-4">
          <p className="text-sm">Completed items displayed here</p>
        </div>
      </TabsContent>
      <TabsContent value="archived">
        <div className="border rounded-lg p-4">
          <p className="text-sm">Archived items displayed here</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};
