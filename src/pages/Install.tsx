import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Smartphone, Monitor, CheckCircle2, Share, MoreVertical, PlusSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Install() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Detect device type
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));
    setIsAndroid(/Android/.test(ua));
    
    // Check if running as standalone (already installed)
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);

    // Listen for the beforeinstallprompt event (Chrome/Edge)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isStandalone) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-primary/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">You're All Set!</CardTitle>
            <CardDescription>
              In-Sync CRM is already installed on your device
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/dashboard")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-primary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <span className="text-3xl font-bold text-white">IS</span>
          </div>
          <CardTitle className="text-2xl">Install In-Sync CRM</CardTitle>
          <CardDescription>
            Get the full app experience with offline access and faster loading
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Benefits */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Smartphone className="w-4 h-4 text-primary shrink-0" />
              <span>Works Offline</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Monitor className="w-4 h-4 text-primary shrink-0" />
              <span>Fast Loading</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Download className="w-4 h-4 text-primary shrink-0" />
              <span>No App Store</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              <span>Auto Updates</span>
            </div>
          </div>

          {/* Install instructions based on device */}
          {isInstalled ? (
            <div className="text-center p-4 rounded-lg bg-primary/10">
              <CheckCircle2 className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="font-medium text-primary">Successfully Installed!</p>
              <p className="text-sm text-muted-foreground">
                Find In-Sync on your home screen
              </p>
            </div>
          ) : deferredPrompt ? (
            <Button onClick={handleInstallClick} className="w-full gap-2" size="lg">
              <Download className="w-5 h-5" />
              Install Now
            </Button>
          ) : isIOS ? (
            <div className="space-y-3 p-4 rounded-lg bg-muted/30 border">
              <p className="font-medium text-sm">How to install on iOS:</p>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0">1</span>
                  <span>Tap the <Share className="w-4 h-4 inline mx-1" /> Share button in Safari</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0">2</span>
                  <span>Scroll down and tap <PlusSquare className="w-4 h-4 inline mx-1" /> "Add to Home Screen"</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0">3</span>
                  <span>Tap "Add" to confirm</span>
                </li>
              </ol>
            </div>
          ) : isAndroid ? (
            <div className="space-y-3 p-4 rounded-lg bg-muted/30 border">
              <p className="font-medium text-sm">How to install on Android:</p>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0">1</span>
                  <span>Tap the <MoreVertical className="w-4 h-4 inline mx-1" /> menu in Chrome</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0">2</span>
                  <span>Tap "Install app" or "Add to Home screen"</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0">3</span>
                  <span>Tap "Install" to confirm</span>
                </li>
              </ol>
            </div>
          ) : (
            <div className="space-y-3 p-4 rounded-lg bg-muted/30 border">
              <p className="font-medium text-sm">How to install:</p>
              <p className="text-sm text-muted-foreground">
                Look for the install icon in your browser's address bar, or use your browser's menu to add this app to your device.
              </p>
            </div>
          )}

          <Button 
            variant="outline" 
            onClick={() => navigate("/login")} 
            className="w-full"
          >
            Continue to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
