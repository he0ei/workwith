import {handleViewer} from '../../../server/viewer-handler.js';
// Deployed from the bundle scripts/build-functions.mjs writes to _shared/viewer.ts.
Deno.serve((request:Request)=>handleViewer(request,{SUPABASE_URL:Deno.env.get('SUPABASE_URL'),SUPABASE_SERVICE_ROLE_KEY:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),VIEWER_SECRET:Deno.env.get('VIEWER_SECRET')}));
