import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = getSupabaseClient();

    // Verify the request is from an authenticated admin
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Check if user is admin, super_admin, or platform_admin
    const { data: userRole } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single()

    const isAuthorized = 
      profile?.is_platform_admin || 
      userRole?.role === 'super_admin' || 
      userRole?.role === 'admin'

    if (!isAuthorized) {
      throw new Error('Insufficient permissions')
    }

    const { userId } = await req.json()

    if (!userId) {
      throw new Error('User ID is required')
    }

    // Get target user's organization to verify authorization
    const { data: targetProfile } = await supabaseClient
      .from('profiles')
      .select('org_id')
      .eq('id', userId)
      .single()

    if (!targetProfile) {
      throw new Error('User not found')
    }

    // Only platform admins can delete users from other organizations
    if (!profile?.is_platform_admin) {
      const { data: requesterProfile } = await supabaseClient
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()

      if (targetProfile.org_id !== requesterProfile?.org_id) {
        throw new Error('Cannot delete users from other organizations')
      }
    }

    // Delete from all related tables (within organization scope verified above)
    // Order matters due to foreign key constraints
    await supabaseClient.from('user_roles').delete().eq('user_id', userId)
    await supabaseClient.from('contact_activities').delete().eq('created_by', userId)
    await supabaseClient.from('contacts').delete().eq('created_by', userId)
    await supabaseClient.from('contacts').delete().eq('assigned_to', userId)
    await supabaseClient.from('org_invites').delete().eq('invited_by', userId)
    await supabaseClient.from('org_invites').delete().eq('used_by', userId)
    await supabaseClient.from('team_members').delete().eq('user_id', userId)
    await supabaseClient.from('teams').delete().eq('manager_id', userId)
    await supabaseClient.from('profiles').delete().eq('id', userId)
    
    // Finally, delete from auth.users (requires service role)
    const { error: deleteAuthError } = await supabaseClient.auth.admin.deleteUser(userId)
    
    if (deleteAuthError) {
      throw deleteAuthError
    }

    return new Response(
      JSON.stringify({ success: true, message: 'User deleted successfully from all organizations' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
