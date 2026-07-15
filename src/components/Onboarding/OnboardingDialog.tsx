import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/hooks/useNotification";

interface OnboardingStep {
  title: string;
  description: string;
  action?: {
    label: string;
    path: string;
  };
}

const roleSteps: Record<string, OnboardingStep[]> = {
  super_admin: [
    {
      title: "Welcome, Super Admin!",
      description: "You have full access to all system features. Let's get you started with the key areas you'll manage.",
    },
    {
      title: "Review Your Dashboard",
      description: "Monitor revenue, billing, and marketing performance at a glance.",
      action: { label: "View Dashboard", path: "/dashboard" },
    },
  ],
  admin: [
    {
      title: "Welcome, Admin!",
      description: "You have administrative access to manage billing, marketing, and key system configurations.",
    },
    {
      title: "Review Your Dashboard",
      description: "Monitor revenue, billing, and marketing performance at a glance.",
      action: { label: "View Dashboard", path: "/dashboard" },
    },
  ],
  sales_manager: [
    {
      title: "Welcome!",
      description: "You're set up to track performance and drive results.",
    },
    {
      title: "Review Your Dashboard",
      description: "Monitor key metrics and revenue trends at a glance.",
      action: { label: "View Dashboard", path: "/dashboard" },
    },
  ],
  support_manager: [
    {
      title: "Welcome, Support Manager!",
      description: "You're ready to lead your support team and ensure customer satisfaction.",
    },
    {
      title: "Review Your Dashboard",
      description: "Track support metrics and daily activity at a glance.",
      action: { label: "View Dashboard", path: "/dashboard" },
    },
  ],
  sales_agent: [
    {
      title: "Welcome!",
      description: "You're all set to get started.",
    },
    {
      title: "Explore Your Dashboard",
      description: "View your metrics and performance at a glance.",
      action: { label: "View Dashboard", path: "/dashboard" },
    },
  ],
  support_agent: [
    {
      title: "Welcome, Support Agent!",
      description: "You're ready to provide excellent customer support and build lasting relationships.",
    },
    {
      title: "Check Your Dashboard",
      description: "See your assigned tickets and daily activity summary.",
      action: { label: "View Dashboard", path: "/dashboard" },
    },
  ],
};

interface OnboardingDialogProps {
  open: boolean;
  userRole: string;
  onComplete: () => void;
}

export function OnboardingDialog({ open, userRole, onComplete }: OnboardingDialogProps) {
  const notify = useNotification();
  const [currentStep, setCurrentStep] = useState(0);
  const [completing, setCompleting] = useState(false);
  
  const steps = roleSteps[userRole] || roleSteps.sales_agent;
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase
          .from("profiles")
          .update({ onboarding_completed: true })
          .eq("id", user.id);

        if (error) throw error;

        notify.success("Welcome aboard! 🎉", "You're all set to start using the platform.");
        
        onComplete();
      }
    } catch (error: any) {
      console.error("Error completing onboarding:", error);
      notify.error("Error", error);
    } finally {
      setCompleting(false);
    }
  };

  const handleActionClick = () => {
    handleComplete();
  };

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <DialogTitle className="text-2xl">
              {currentStep === 0 ? "Welcome to In-Sync!" : currentStepData.title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-base">
            {currentStepData.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Step {currentStep + 1} of {steps.length}</span>
              <span>{Math.round(progress)}% Complete</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Step Indicators */}
          <div className="flex justify-between">
            {steps.map((_, index) => (
              <div key={index} className="flex flex-col items-center gap-1">
                {index < currentStep ? (
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                ) : index === currentStep ? (
                  <Circle className="h-6 w-6 text-primary fill-primary" />
                ) : (
                  <Circle className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>

          {/* Action Button for steps with actions */}
          {currentStepData.action && (
            <Button
              onClick={handleActionClick}
              className="w-full"
              size="lg"
              variant="outline"
            >
              {currentStepData.action.label}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          {isLastStep ? (
            <Button onClick={handleComplete} disabled={completing}>
              {completing ? "Finishing..." : "Get Started"}
            </Button>
          ) : (
            <Button onClick={handleNext}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
