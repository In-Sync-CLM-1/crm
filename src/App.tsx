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
import SignUp from "./pages/SignUp";
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
const ClientHub = lazy(() => import("./pages/ClientHub"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));

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
const CampaignOverview = lazy(() => import("./pages/Campaigns/CampaignOverview"));
const AIInsightsDashboard = lazy(() => import("./pages/Campaigns/AIInsightsDashboard"));
const MarketingDashboard = lazy(() => import("./pages/MarketingDashboard"));
const MarketingAdAnalytics = lazy(() => import("./pages/MarketingAdAnalytics"));
const CampaignManager = lazy(() => import("./pages/CampaignManager"));
const LeadBrowser = lazy(() => import("./pages/LeadBrowser"));
const EnrollmentBrowser = lazy(() => import("./pages/EnrollmentBrowser"));
const TemplateEditor = lazy(() => import("./pages/TemplateEditor"));
const ArohanChat = lazy(() => import("./pages/ArohanChat"));
const EngineConfig = lazy(() => import("./pages/EngineConfig"));
const ProductManagement = lazy(() => import("./pages/ProductManagement"));
const ProductICP = lazy(() => import("./pages/ProductICP"));

// Lazy loaded pages - Admin
const ApprovalMatrix = lazy(() => import("./pages/ApprovalMatrix"));
const WhatsAppSettings = lazy(() => import("./pages/WhatsAppSettings"));
const EmailSettings = lazy(() => import("./pages/EmailSettings"));

// Lazy loaded pages - Other
const BillingSystem = lazy(() => import("./pages/BillingSystem"));
const Accounting = lazy(() => import("./pages/Accounting"));
const SupportTickets = lazy(() => import("./pages/SupportTickets"));
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
          <Route path="/signup" element={<SignUp />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/install" element={<Install />} />
          <Route path="/offline" element={<OfflinePage />} />

          {/* CRM Routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />

          <Route path="/clients" element={
            <ProtectedRoute>
              <ClientHub />
            </ProtectedRoute>
          } />

          <Route path="/clients/:id" element={
            <ProtectedRoute>
              <ClientDetail />
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

          <Route path="/campaigns/overview" element={
            <ProtectedRoute>
              <CampaignOverview />
            </ProtectedRoute>
          } />

          <Route path="/campaigns/insights" element={
            <ProtectedRoute>
              <AIInsightsDashboard />
            </ProtectedRoute>
          } />

          <Route path="/marketing" element={
            <ProtectedRoute>
              <MarketingDashboard />
            </ProtectedRoute>
          } />
          <Route path="/marketing/ad-analytics" element={
            <ProtectedRoute>
              <MarketingAdAnalytics />
            </ProtectedRoute>
          } />
          <Route path="/marketing/campaigns" element={
            <ProtectedRoute>
              <CampaignManager />
            </ProtectedRoute>
          } />
          <Route path="/marketing/leads" element={
            <ProtectedRoute>
              <LeadBrowser />
            </ProtectedRoute>
          } />
          <Route path="/marketing/templates" element={
            <ProtectedRoute>
              <TemplateEditor />
            </ProtectedRoute>
          } />
          <Route path="/marketing/enrollments" element={
            <ProtectedRoute>
              <EnrollmentBrowser />
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

          <Route path="/marketing/arohan" element={
            <ProtectedRoute>
              <ArohanChat />
            </ProtectedRoute>
          } />

          {/* Admin Routes */}
          <Route path="/admin/approval-matrix" element={
            <ProtectedRoute requiredRole="admin">
              <ApprovalMatrix />
            </ProtectedRoute>
          } />

          <Route path="/whatsapp-settings" element={
            <ProtectedRoute requiredRole="admin">
              <WhatsAppSettings />
            </ProtectedRoute>
          } />

          <Route path="/billing-system" element={
            <ProtectedRoute>
              <BillingSystem />
            </ProtectedRoute>
          } />

          <Route path="/accounting" element={
            <ProtectedRoute>
              <Accounting />
            </ProtectedRoute>
          } />

          {/* GST Dashboard is now integrated into main Dashboard */}

          <Route path="/support-tickets" element={
            <ProtectedRoute>
              <SupportTickets />
            </ProtectedRoute>
          } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </OrgContextProvider>
</AuthProvider>
);

export default App;
