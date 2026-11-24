import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/contexts/AuthProvider";
import { OrgContextProvider } from "@/contexts/OrgContextProvider";
import { ServiceWorkerUpdateHandler } from "@/components/Offline/ServiceWorkerUpdateHandler";

// Static imports - public/auth pages only
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import ProtectedRoute from "./components/Auth/ProtectedRoute";
import Install from "./pages/Install";
import OfflinePage from "./pages/Offline";

// Page loader component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Lazy loaded pages - CRM
const Dashboard = lazy(() => import("./pages/Dashboard"));

// Lazy loaded pages - Campaigns
const Templates = lazy(() => import("./pages/Templates"));
const TemplateBuilder = lazy(() => import("./pages/TemplateBuilder"));
const WhatsAppDashboard = lazy(() => import("./pages/WhatsAppDashboard"));
const BulkWhatsAppSender = lazy(() => import("./pages/BulkWhatsAppSender"));
const WhatsAppCampaigns = lazy(() => import("./pages/WhatsAppCampaigns"));
const WhatsAppCampaignDetail = lazy(() => import("./pages/WhatsAppCampaignDetail"));
const SMSCampaigns = lazy(() => import("./pages/SMSCampaigns"));
const SMSCampaignDetail = lazy(() => import("./pages/SMSCampaignDetail"));
const BulkSMSSender = lazy(() => import("./pages/BulkSMSSender"));
const EmailCampaigns = lazy(() => import("./pages/EmailCampaigns"));
const EmailCampaignDetail = lazy(() => import("./pages/EmailCampaignDetail"));
const BulkEmailSender = lazy(() => import("./pages/BulkEmailSender"));
const EmailAutomations = lazy(() => import("./pages/EmailAutomations"));
const EmailAutomationSettings = lazy(() => import("./pages/EmailAutomationSettings"));
const AdCampaigns = lazy(() => import("./pages/AdCampaigns"));
const FollowCampaigns = lazy(() => import("./pages/FollowCampaigns"));
const TemplateEditor = lazy(() => import("./pages/TemplateEditor"));
const EngineConfig = lazy(() => import("./pages/EngineConfig"));
const ProductManagement = lazy(() => import("./pages/ProductManagement"));
const ProductICP = lazy(() => import("./pages/ProductICP"));
const ContentCalendar = lazy(() => import("./pages/ContentCalendar"));
const BDOutreach = lazy(() => import("./pages/BDOutreach"));
const LinkedInOutreach = lazy(() => import("./pages/LinkedInOutreach"));
const LinkedInMessages = lazy(() => import("./pages/LinkedInMessages"));
const JobSearch = lazy(() => import("./pages/JobSearch"));
const ReleaseBoard = lazy(() => import("./pages/ReleaseBoard"));

// Lazy loaded pages - Admin
const ApprovalMatrix = lazy(() => import("./pages/ApprovalMatrix"));
const EmailSettings = lazy(() => import("./pages/EmailSettings"));

// Lazy loaded pages - Other
// GSTDashboard is now integrated into main Dashboard

const App = () => (
  <AuthProvider>
    <OrgContextProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ServiceWorkerUpdateHandler />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
          {/* Public routes - static imports */}
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          {/* Self sign-up is off (code audit 2026-11-15); accounts are created by an administrator. */}
          <Route path="/signup" element={<Navigate to="/login" replace />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/install" element={<Install />} />
          <Route path="/offline" element={<OfflinePage />} />

          {/* CRM Routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />



          {/* Campaign Routes */}
          <Route path="/templates" element={
            <ProtectedRoute>
              <Templates />
            </ProtectedRoute>
          } />

          <Route path="/templates/create" element={
            <ProtectedRoute>
              <TemplateBuilder />
            </ProtectedRoute>
          } />

          <Route path="/whatsapp-messages" element={
            <ProtectedRoute>
              <WhatsAppDashboard />
            </ProtectedRoute>
          } />

          <Route path="/whatsapp/bulk-send" element={
            <ProtectedRoute>
              <BulkWhatsAppSender />
            </ProtectedRoute>
          } />

          <Route path="/whatsapp/campaigns" element={
            <ProtectedRoute>
              <WhatsAppCampaigns />
            </ProtectedRoute>
          } />

          <Route path="/whatsapp/campaigns/:id" element={
            <ProtectedRoute>
              <WhatsAppCampaignDetail />
            </ProtectedRoute>
          } />

          <Route path="/sms-campaigns" element={
            <ProtectedRoute>
              <SMSCampaigns />
            </ProtectedRoute>
          } />

          <Route path="/sms-campaigns/:id" element={
            <ProtectedRoute>
              <SMSCampaignDetail />
            </ProtectedRoute>
          } />

          <Route path="/bulk-sms" element={
            <ProtectedRoute>
              <BulkSMSSender />
            </ProtectedRoute>
          } />

          <Route path="/email-campaigns" element={
            <ProtectedRoute>
              <EmailCampaigns />
            </ProtectedRoute>
          } />

          <Route path="/email-campaigns/:id" element={
            <ProtectedRoute>
              <EmailCampaignDetail />
            </ProtectedRoute>
          } />

          <Route path="/bulk-email" element={
            <ProtectedRoute>
              <BulkEmailSender />
            </ProtectedRoute>
          } />

          <Route path="/email-automations" element={
            <ProtectedRoute requiredRole="admin">
              <EmailAutomations />
            </ProtectedRoute>
          } />

          <Route path="/email-automations/settings" element={
            <ProtectedRoute requiredRole="admin">
              <EmailAutomationSettings />
            </ProtectedRoute>
          } />

          <Route path="/marketing/ad-campaigns" element={
            <ProtectedRoute>
              <AdCampaigns />
            </ProtectedRoute>
          } />
          <Route path="/marketing/follow-campaigns" element={
            <ProtectedRoute>
              <FollowCampaigns />
            </ProtectedRoute>
          } />
          <Route path="/marketing/templates" element={
            <ProtectedRoute>
              <TemplateEditor />
            </ProtectedRoute>
          } />
          <Route path="/marketing/config" element={
            <ProtectedRoute>
              <EngineConfig />
            </ProtectedRoute>
          } />
          <Route path="/marketing/products" element={
            <ProtectedRoute>
              <ProductManagement />
            </ProtectedRoute>
          } />
          <Route path="/marketing/products/:productKey/icp" element={
            <ProtectedRoute>
              <ProductICP />
            </ProtectedRoute>
          } />

          <Route path="/marketing/content-calendar" element={
            <ProtectedRoute>
              <ContentCalendar />
            </ProtectedRoute>
          } />

          <Route path="/marketing/bd-outreach" element={
            <ProtectedRoute>
              <BDOutreach />
            </ProtectedRoute>
          } />

          <Route path="/marketing/linkedin-outreach" element={
            <ProtectedRoute>
              <LinkedInOutreach />
            </ProtectedRoute>
          } />

          <Route path="/marketing/linkedin-messages" element={
            <ProtectedRoute>
              <LinkedInMessages />
            </ProtectedRoute>
          } />

          <Route path="/release-board" element={
            <ProtectedRoute>
              <ReleaseBoard />
            </ProtectedRoute>
          } />

          <Route path="/job-search" element={
            <ProtectedRoute>
              <JobSearch />
            </ProtectedRoute>
          } />

          {/* Admin Routes */}
          <Route path="/admin/approval-matrix" element={
            <ProtectedRoute requiredRole="admin">
              <ApprovalMatrix />
            </ProtectedRoute>
          } />



          {/* GST Dashboard is now integrated into main Dashboard */}

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </OrgContextProvider>
</AuthProvider>
);

export default App;
