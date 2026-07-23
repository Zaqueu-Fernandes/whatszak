import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BulkUser {
  email?: string;
  name?: string;
  password?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Only an actual admin (has_role check, same as the /admin page's own
    // gate) can bulk-create accounts — this endpoint bypasses email
    // confirmation entirely, so it can't be left open to any authenticated
    // user.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsError } = await userClient.auth.getUser();
    if (claimsError || !claims.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: claims.user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { users, defaultPassword } = (await req.json()) as {
      users: BulkUser[];
      defaultPassword?: string;
    };

    if (!Array.isArray(users) || users.length === 0) {
      return new Response(JSON.stringify({ error: "Missing users array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { email: string; ok: boolean; error?: string }[] = [];

    for (const u of users) {
      const email = (u.email ?? "").trim().toLowerCase();
      const name = (u.name ?? "").trim();
      const password = (u.password ?? defaultPassword ?? "").trim();

      if (!email || !name || !password) {
        results.push({ email: email || "(vazio)", ok: false, error: "Faltando email, nome ou senha" });
        continue;
      }

      // email_confirm: true skips the confirmation email + its rate limit
      // entirely — the account is immediately usable. handle_new_user's
      // existing trigger on auth.users picks up raw_user_meta_data.name
      // (set here via user_metadata) and creates the matching profiles row
      // automatically, same as a normal signup does.
      const { error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });

      results.push({ email, ok: !error, error: error?.message });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[bulk-create-users] error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
