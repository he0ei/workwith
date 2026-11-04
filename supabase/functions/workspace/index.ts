import {handle} from '../_shared/supabase-handler.js';
Deno.serve((request:Request)=>handle(request,{APP_ORIGIN:Deno.env.get('APP_ORIGIN'),SUPABASE_URL:Deno.env.get('SUPABASE_URL'),SUPABASE_SERVICE_ROLE_KEY:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}));
