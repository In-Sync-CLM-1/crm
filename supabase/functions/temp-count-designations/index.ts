import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

serve(async (_req) => {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return new Response(JSON.stringify({ error: "no db url" }), { status: 500, headers: { "Content-Type": "application/json" } });
  const sql = postgres(dbUrl, { max: 1 });
  try {
    // Count all native contacts with marketing or founder/CEO designations
    const result = await sql`
      SELECT
        COUNT(*) FILTER (WHERE LOWER(designation) ILIKE ANY(ARRAY[
          '%marketing%','%brand%','%growth%','%digital%','%campaign%',
          '%communications%','%content%','%pr %','%public relation%'
        ])) AS marketing_count,
        COUNT(*) FILTER (WHERE LOWER(designation) ILIKE ANY(ARRAY[
          '%founder%','%ceo%','%chief executive%','%cmo%','%chief marketing%',
          '%co-founder%','%cofounder%','%proprietor%','%propietor%','%owner%'
        ])) AS founder_ceo_count,
        COUNT(*) FILTER (WHERE LOWER(designation) ILIKE ANY(ARRAY[
          '%marketing%','%brand%','%growth%','%digital%','%campaign%',
          '%communications%','%content%','%pr %','%public relation%',
          '%founder%','%ceo%','%chief executive%','%cmo%','%chief marketing%',
          '%co-founder%','%cofounder%','%proprietor%','%propietor%','%owner%'
        ])) AS total_combined,
        COUNT(*) AS grand_total
      FROM mkt_native_contacts
    `;

    // Top designation breakdown
    const breakdown = await sql`
      SELECT designation, COUNT(*) AS cnt
      FROM mkt_native_contacts
      WHERE LOWER(designation) ILIKE ANY(ARRAY[
        '%marketing%','%brand%','%growth%','%digital%','%campaign%',
        '%communications%','%content%',
        '%founder%','%ceo%','%chief executive%','%cmo%','%chief marketing%',
        '%co-founder%','%cofounder%','%proprietor%','%propietor%','%owner%'
      ])
      GROUP BY designation
      ORDER BY cnt DESC
      LIMIT 40
    `;

    // How many are ALREADY in contacts (already sourced for any product)
    const alreadyImported = await sql`
      SELECT COUNT(*) AS cnt
      FROM mkt_native_contacts nc
      WHERE LOWER(nc.designation) ILIKE ANY(ARRAY[
        '%marketing%','%brand%','%growth%','%digital%','%campaign%',
        '%communications%','%content%',
        '%founder%','%ceo%','%chief executive%','%cmo%','%chief marketing%',
        '%co-founder%','%cofounder%','%proprietor%','%propietor%','%owner%'
      ])
      AND EXISTS (
        SELECT 1 FROM contacts c
        WHERE c.mkt_native_contact_id::uuid = nc.id
          AND c.status NOT IN ('converted','customer','opportunity','qualified','demo_done','negotiation')
      )
    `;

    return new Response(JSON.stringify({
      summary: result[0],
      already_imported: alreadyImported[0].cnt,
      fresh_available: Number(result[0].total_combined) - Number(alreadyImported[0].cnt),
      top_designations: breakdown,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  } finally {
    await sql.end();
  }
});
