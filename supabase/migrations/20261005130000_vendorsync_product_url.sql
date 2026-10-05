-- Vendorsync lives at vendor.in-sync.co.in; the vendorverification subdomain was removed.
UPDATE public.mkt_products SET product_url = 'https://vendor.in-sync.co.in'
 WHERE product_key = 'vendorsync' AND product_url ~ 'vendorverification\.in-sync\.co\.in';
