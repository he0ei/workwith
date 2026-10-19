import {LinkStore} from './link-store.js';
// Ordinary shared URL: no invitation token, login, or per-tab access credential.
// The server must explicitly enable public access; the client cannot enable it.
export class WorkspaceStore extends LinkStore{
 constructor(fetcher,storage,config,page,history){super(fetcher,storage,config,page,history,{publicAccess:true});}
}
