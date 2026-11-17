import type { Connection } from './types';
import { configuredProvider, encryptionConfigured, peekToken, providers, type ProviderId } from './oauth';
export async function getConnections():Promise<Connection[]> {
 const descriptions:Record<ProviderId,string>={canva:'Designs, owned assets and permitted exports',youtube:'Shorts variants up to 3 minutes',facebook:'Authorized Facebook Page Reels',tiktok:'Creator review and ready-to-post handoff'};
 return Promise.all((Object.keys(providers) as ProviderId[]).map(async id=>{
  const provider=providers[id]; const configured=configuredProvider(id); let token; let vaultError=false;
  try{token=await peekToken(id);}catch{vaultError=true;}
  const expired=Boolean(token&&token.expiresAt<=Date.now()&&!token.refreshToken); const connected=Boolean(token&&!expired); let blocker:string|undefined;
  if(vaultError)blocker='The token vault cannot be decrypted. Restore its original TOKEN_ENCRYPTION_KEY or disconnect and reconnect this account.';
  else if(!configured)blocker=`Set ${provider.env}_CLIENT_ID and ${provider.env}_CLIENT_SECRET${encryptionConfigured()?'':' plus TOKEN_ENCRYPTION_KEY'} on the server, and register /api/connections/${id}/callback.`;
  else if(!token)blocker=`Authorize ${provider.name} with the listed scopes.`;
  else if(expired)blocker='Authorization expired. Reconnect this account.';
  else if(id==='canva')blocker='CANVA_CAPABILITY_MISSING: Stock-library search and arbitrary multitrack editing are not assumed. Use permitted design exports or your licensed media.';
  else if(id==='facebook'&&!token?.pageId)blocker='Set META_PAGE_ID to your authorized Facebook Page ID, then reconnect to acquire its Page token.';
  else if(id==='tiktok')blocker='Each post requires fresh creator information, manual privacy selection and explicit consent. Direct Post audit and product eligibility are not verified.';
  else if(process.env.ENABLE_LIVE_PUBLISHING!=='true')blocker='Live publishing is disabled. Review a completed variant and authorize publishing before enabling it.';
  return {id,name:provider.name,description:descriptions[id],configured,connected,status:connected?'CONNECTED':expired?'EXPIRED':'BLOCKED_AUTH',scopes:provider.scopes,blocker,accountName:token?.accountName};
 }));
}
