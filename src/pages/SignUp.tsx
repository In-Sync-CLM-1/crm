import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/Auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotification } from "@/hooks/useNotification";
import { Eye, EyeOff } from "lucide-react";

export default function SignUp() {
  const navigate = useNavigate();
  const notify = useNotification();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite");
  const [loading, setLoading] = useState(false);
  const [inviteData, setInviteData] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    organizationName: "",
    organizationSlug: "",
  });

  useEffect(() => {
    if (inviteCode) {
      fetchInviteDetails();
    }
  }, [inviteCode]);

  const fetchInviteDetails = async () => {
    try {
      const { data, error } = await supabase
        .from("org_invites")
        .select("*, organizations(name, slug)")
        .eq("invite_code", inviteCode)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (error) throw error;

      if (data) {
        setInviteData(data);
        if (data.email) {
          setFormData(prev => ({ ...prev, email: data.email }));
        }
      } else {
        notify.error("Invalid invite", new Error("This invite link is invalid or has expired"));
      }
    } catch (error: any) {
      notify.error("Error", new Error("Failed to load invite details"));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Auto-generate slug from organization name
    if (name === "organizationName") {
      const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      setFormData(prev => ({ ...prev, organizationSlug: slug }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      notify.error("Passwords don't match", new Error("Please make sure your passwords match"));
      return;
    }

    if (formData.password.length < 6) {
      notify.error("Password too short", new Error("Password must be at least 6 characters"));
      return;
    }

    setLoading(true);
    let createdUserId: string | null = null;

    try {
      if (inviteData) {
        // Join existing organization via invite
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              first_name: formData.firstName,
              last_name: formData.lastName,
              org_id: inviteData.org_id,
            },
          },
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("No user returned");

        // Mark invite as used
        await supabase
          .from("org_invites")
          .update({ 
            used_at: new Date().toISOString(),
            used_by: authData.user.id 
          })
          .eq("id", inviteData.id);

        notify.success("Account created!", `Welcome to ${inviteData.organizations.name}`);
      } else {
        // Create new organization using secure database function
        
        // Step 1: Create auth user
        console.log("Creating auth user...");
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              first_name: formData.firstName,
              last_name: formData.lastName,
            },
          },
        });

        if (authError) {
          console.error("Auth error:", authError);
          throw new Error(`Failed to create account: ${authError.message}`);
        }
        if (!authData.user) throw new Error("No user returned from signup");

        createdUserId = authData.user.id;
        console.log("Auth user created successfully:", createdUserId);

        // Wait for profile trigger to complete
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Step 2: Create organization and all related data using secure function
        console.log("Creating organization:", formData.organizationName);
        const { data: orgId, error: orgError } = await supabase.rpc(
          "create_organization_for_user",
          {
            p_user_id: authData.user.id,
            p_org_name: formData.organizationName,
            p_org_slug: formData.organizationSlug,
          }
        );

        if (orgError) {
          console.error("Organization creation error:", orgError);
          
          // Cleanup: Delete the auth user we just created
          console.log("Cleaning up orphaned user account...");
          await supabase.rpc("cleanup_orphaned_profile", { user_id: createdUserId });
          
          throw new Error(orgError.message || "Failed to create organization");
        }

        console.log("Organization and setup completed successfully! Org ID:", orgId);
        notify.success("Account created!", "Welcome to In-Sync");
      }

      navigate("/dashboard");
    } catch (error: any) {
      console.error("Signup error:", error);
      
      notify.error("Sign up failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout 
      title={inviteData ? `Join ${inviteData.organizations.name}` : "Create your account"} 
      subtitle={inviteData ? "Complete your registration to join the team" : "Start your journey with In-Sync"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {inviteData && (
          <div className="bg-primary/10 p-3 rounded-md text-sm">
            You're joining <strong>{inviteData.organizations.name}</strong> as a{" "}
            <strong>{inviteData.role.replace("_", " ")}</strong>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            disabled={inviteData?.email}
            required
          />
        </div>

        {!inviteData && (
          <>
            <div className="space-y-2">
              <Label htmlFor="organizationName">Organization Name</Label>
              <Input
                id="organizationName"
                name="organizationName"
                value={formData.organizationName}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="organizationSlug">Organization ID (URL)</Label>
              <Input
                id="organizationSlug"
                name="organizationSlug"
                value={formData.organizationSlug}
                onChange={handleChange}
                required
              />
              <p className="text-xs text-muted-foreground">
                Your organization URL will be: insync.app/{formData.organizationSlug}
              </p>
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={handleChange}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account..." : "Create Account"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}