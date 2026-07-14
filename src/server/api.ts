import { createHash, randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import type { PoolClient } from "pg";
import { databaseConfigured, query, transaction } from "./db";
import { ApiError, assertJsonRequest, assertSameOrigin, enforceRateLimit, parseBody, requestIp, schemas } from "./security";

const COOKIE = "ancestors_session";
const json = (value: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
const sha256 = (value: string) => createHash("sha256").update(value).digest();
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const cookieValue = (request: Request) => request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
const sessionCookie = (token: string, maxAge: number) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.SESSION_COOKIE_SECURE === "true" ? "; Secure" : ""}`;

type Session = { id: string; user_id: string; email: string; full_name_en: string; full_name_ar: string };
async function authenticate(request: Request): Promise<Session | null> {
  const token = cookieValue(request); if (!token || !databaseConfigured) return null;
  const result = await query<Session>(`SELECT s.id,s.user_id,u.email,u.full_name_en,u.full_name_ar FROM app.sessions s
    JOIN app.users u ON u.id=s.user_id LEFT JOIN app.password_credentials p ON p.user_id=u.id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now()
      AND u.status='active' AND (p.user_id IS NULL OR p.credential_version=s.credential_version)`, [sha256(token)]);
  return result.rows[0] ?? null;
}

async function body(request: Request) { assertJsonRequest(request); return request.json() as Promise<Record<string, any>>; }
function userDto(s: Session) { return { id:s.user_id,email:s.email,fullNameEn:s.full_name_en,fullNameAr:s.full_name_ar }; }
async function createSession(client: PoolClient, userId: string, version: number, request: Request) {
  const token=randomBytes(32).toString("base64url"), idle=Number(process.env.SESSION_IDLE_HOURS??24), days=Number(process.env.SESSION_ABSOLUTE_DAYS??30);
  await client.query(`INSERT INTO app.sessions(user_id,token_hash,credential_version,idle_expires_at,absolute_expires_at,ip_address,user_agent)
    VALUES($1,$2,$3,now()+($4||' hours')::interval,now()+($5||' days')::interval,$6,$7)`,[userId,sha256(token),version,idle,days,requestIp(request),request.headers.get("user-agent")?.slice(0,1000)]);
  return { token, maxAge: days*86400 };
}

export async function handleApi(request: Request): Promise<Response | null> {
  const url=new URL(request.url); if (!url.pathname.startsWith("/api/")) return null;
  const requestId=randomUUID();
  try {
    assertSameOrigin(request);
    if (url.pathname==="/api/health") return json({status:"ok"});
    if (url.pathname==="/api/ready") {
      if (!databaseConfigured) return json({status:"not_ready",reason:"DATABASE_URL is not configured"},503);
      const r=await query<{count:string}>("SELECT count(*)::text count FROM public.schema_migrations"),required=Number(process.env.REQUIRED_MIGRATIONS??3);
      return Number(r.rows[0]?.count)>=required ? json({status:"ready",migrations:Number(r.rows[0].count)}) : json({status:"not_ready",reason:"migrations missing",required,applied:Number(r.rows[0]?.count??0)},503);
    }
    const publicPreview=url.pathname.match(/^\/api\/previews\/([A-Za-z0-9_-]{40,100})$/);
    if(publicPreview&&request.method==="GET") {
      const token=sha256(publicPreview[1]); const link=await query<{id:string;tree_id:string}>(`UPDATE app.tree_share_links SET usage_count=usage_count+1,last_used_at=now() WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() AND (usage_limit IS NULL OR usage_count<usage_limit) RETURNING id,tree_id`,[token]);
      if(!link.rowCount)return json({code:"NOT_FOUND"},404);
      const members=await query(`SELECT id,name_en,name_ar,gender,extract(year from birth_date)::int birth_year,death_date,citizen_status,is_unknown,subfamily_id,pos_x,pos_y FROM app.family_members WHERE tree_id=$1 AND deleted_at IS NULL`,[link.rows[0].tree_id]);
      const subfamilies=await query(`SELECT id,parent_subfamily_id,linked_male_id,name_en,name_ar,color FROM app.subfamilies WHERE tree_id=$1 AND deleted_at IS NULL`,[link.rows[0].tree_id]);
      await query("INSERT INTO audit.events(tree_id,entity_type,entity_id,action,metadata) VALUES($1,'tree_share_links',$2,'preview_use','{}')",[link.rows[0].tree_id,link.rows[0].id]);
      return json({members:members.rows,subfamilies:subfamilies.rows});
    }
    if (url.pathname==="/api/auth/register" && request.method==="POST") {
      const b=await parseBody(request,schemas.register), email=normalizeEmail(b.email);
      const rate=await enforceRateLimit(request,"login",email,5,30);
      const verificationToken=randomBytes(32).toString("base64url");
      const result=await transaction(null,null,requestId,async c=>{
        const exists=await c.query("SELECT 1 FROM app.users WHERE email=$1",[email]); if(exists.rowCount) throw new Error("EMAIL_EXISTS");
        const u=await c.query<Session>(`INSERT INTO app.users(email,email_verified_at,full_name_en,full_name_ar,status) VALUES($1,NULL,$2,$3,'active')
          RETURNING id AS user_id,email,full_name_en,full_name_ar`,[email,b.fullNameEn.trim(),b.fullNameAr.trim()]);
        await c.query("INSERT INTO app.password_credentials(user_id,password_hash) VALUES($1,$2)",[u.rows[0].user_id,await argon2.hash(b.password,{type:argon2.argon2id})]);
        await c.query("INSERT INTO app.email_verification_tokens(user_id,token_hash,requested_ip,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')",[u.rows[0].user_id,sha256(verificationToken),rate.ip]);
        await c.query("INSERT INTO app.auth_attempts(user_id,attempt_type,identifier_hash,ip_address,succeeded) VALUES($1,'login',$2,$3,true)",[u.rows[0].user_id,rate.hash,rate.ip]);
        return {user:u.rows[0],session:await createSession(c,u.rows[0].user_id,1,request)};
      });
      if(process.env.AUTH_TOKEN_DELIVERY === "console") console.info(`Development email verification token for ${email}: ${verificationToken}`);
      return json({user:userDto(result.user),createdAt:new Date().toISOString()},201,{"set-cookie":sessionCookie(result.session.token,result.session.maxAge)});
    }
    if (url.pathname==="/api/auth/verify-email" && request.method==="POST") {
      const b=await parseBody(request,schemas.emailToken); const rate=await enforceRateLimit(request,"email_verification",b.token,8,30);
      const verified=await transaction(null,null,requestId,async c=>{
        const token=await c.query<{id:string;user_id:string}>(`SELECT id,user_id FROM app.email_verification_tokens WHERE token_hash=$1 AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at>now() FOR UPDATE`,[sha256(b.token)]);
        if(!token.rowCount) return false;
        await c.query("UPDATE app.email_verification_tokens SET consumed_at=now() WHERE id=$1",[token.rows[0].id]);
        await c.query("UPDATE app.users SET email_verified_at=now() WHERE id=$1",[token.rows[0].user_id]); return true;
      });
      await query("INSERT INTO app.auth_attempts(attempt_type,identifier_hash,ip_address,succeeded) VALUES('email_verification',$1,$2,$3)",[rate.hash,rate.ip,verified]);
      return verified?json({ok:true}):json({code:"INVALID_OR_EXPIRED_TOKEN"},400);
    }
    if (url.pathname==="/api/auth/password-reset/request" && request.method==="POST") {
      const b=await parseBody(request,schemas.resetRequest),email=normalizeEmail(b.email); const rate=await enforceRateLimit(request,"password_reset",email,5,30),token=randomBytes(32).toString("base64url");
      const user=await query<{id:string}>("SELECT id FROM app.users WHERE email=$1 AND status='active'",[email]);
      if(user.rowCount) await query("INSERT INTO app.password_reset_tokens(user_id,token_hash,requested_ip,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')",[user.rows[0].id,sha256(token),rate.ip]);
      await query("INSERT INTO app.auth_attempts(user_id,attempt_type,identifier_hash,ip_address,succeeded) VALUES($1,'password_reset',$2,$3,true)",[user.rows[0]?.id??null,rate.hash,rate.ip]);
      if(user.rowCount&&process.env.AUTH_TOKEN_DELIVERY==="console") console.info(`Development password reset token for ${email}: ${token}`);
      return json({ok:true});
    }
    if (url.pathname==="/api/auth/password-reset/confirm" && request.method==="POST") {
      const b=await parseBody(request,schemas.resetConfirm); const rate=await enforceRateLimit(request,"password_reset",b.token,8,30);
      const reset=await transaction(null,null,requestId,async c=>{
        const token=await c.query<{id:string;user_id:string}>(`SELECT id,user_id FROM app.password_reset_tokens WHERE token_hash=$1 AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at>now() FOR UPDATE`,[sha256(b.token)]); if(!token.rowCount)return false;
        await c.query("UPDATE app.password_reset_tokens SET consumed_at=now() WHERE id=$1",[token.rows[0].id]);
        await c.query("UPDATE app.password_credentials SET password_hash=$2,credential_version=credential_version+1,password_changed_at=now() WHERE user_id=$1",[token.rows[0].user_id,await argon2.hash(b.password,{type:argon2.argon2id})]);
        await c.query("UPDATE app.sessions SET revoked_at=now(),revocation_reason='password_reset' WHERE user_id=$1 AND revoked_at IS NULL",[token.rows[0].user_id]); return true;
      });
      await query("INSERT INTO app.auth_attempts(attempt_type,identifier_hash,ip_address,succeeded) VALUES('password_reset',$1,$2,$3)",[rate.hash,rate.ip,reset]);
      return reset?json({ok:true}):json({code:"INVALID_OR_EXPIRED_TOKEN"},400);
    }
    if (url.pathname==="/api/auth/login" && request.method==="POST") {
      const b=await parseBody(request,schemas.login), email=normalizeEmail(b.email);
      const rate=await enforceRateLimit(request,"login",email);
      const found=await query<Session & {password_hash:string;credential_version:number}>(`SELECT u.id user_id,u.email,u.full_name_en,u.full_name_ar,p.password_hash,p.credential_version
        FROM app.users u JOIN app.password_credentials p ON p.user_id=u.id WHERE u.email=$1 AND u.status='active'`,[email]);
      const u=found.rows[0]; const valid=!!u && await argon2.verify(u.password_hash,b.password);
      await query("INSERT INTO app.auth_attempts(user_id,attempt_type,identifier_hash,ip_address,succeeded) VALUES($1,'login',$2,$3,$4)",[u?.user_id??null,rate.hash,rate.ip,valid]);
      if(!valid || !u) return json({code:"INVALID_CREDENTIALS"},401);
      const s=await transaction(u.user_id,null,requestId,c=>createSession(c,u.user_id,u.credential_version,request));
      return json({user:userDto(u),createdAt:new Date().toISOString()},200,{"set-cookie":sessionCookie(s.token,s.maxAge)});
    }
    const session=await authenticate(request);
    if (url.pathname==="/api/auth/session" && request.method==="GET") return json(session?{user:userDto(session),createdAt:new Date().toISOString()}:null);
    if (!session) return json({code:"UNAUTHENTICATED"},401);
    if (url.pathname==="/api/auth/logout" && request.method==="POST") {
      await query("UPDATE app.sessions SET revoked_at=now(),revocation_reason='logout' WHERE id=$1",[session.id]);
      return json({ok:true},200,{"set-cookie":sessionCookie("",0)});
    }
    if (url.pathname==="/api/auth/sessions" && request.method==="GET") {
      const r=await query(`SELECT id,created_at,last_seen_at,idle_expires_at,absolute_expires_at,revoked_at,ip_address,user_agent FROM app.sessions WHERE user_id=$1 ORDER BY created_at DESC`,[session.user_id]); return json(r.rows);
    }
    const revokeSession=url.pathname.match(/^\/api\/auth\/sessions\/([0-9a-f-]+)$/);
    if(revokeSession&&request.method==="DELETE") { await query("UPDATE app.sessions SET revoked_at=now(),revocation_reason='user_revoked' WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL",[revokeSession[1],session.user_id]); return json({ok:true}); }
    if (url.pathname==="/api/trees" && request.method==="GET") {
      const r=await transaction(session.user_id,session.id,requestId,c=>c.query(`SELECT t.id,t.name_en,t.name_ar,coalesce(t.description_en,'') description_en,
        coalesce(t.description_ar,'') description_ar,t.color,t.updated_at FROM app.family_trees t WHERE t.deleted_at IS NULL ORDER BY t.updated_at DESC`));
      return json(r.rows);
    }
    if (url.pathname==="/api/trees" && request.method==="POST") {
      const b=await parseBody(request,schemas.tree); const r=await transaction(session.user_id,session.id,requestId,async c=>{
        const t=await c.query(`INSERT INTO app.family_trees(owner_user_id,name_en,name_ar,description_en,description_ar,color) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[session.user_id,b.name_en,b.name_ar||null,b.description_en||null,b.description_ar||null,b.color||null]);
        await c.query("INSERT INTO app.tree_memberships(tree_id,user_id,role) VALUES($1,$2,'owner')",[t.rows[0].id,session.user_id]); return t.rows[0]; });
      return json(r,201);
    }
    const snapshotMatch=url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/snapshot$/);
    if (snapshotMatch && request.method==="GET") return json(await readSnapshot(session,requestId,snapshotMatch[1]));
    if (snapshotMatch && request.method==="PUT") return json(await importSnapshot(session,requestId,snapshotMatch[1],await body(request)));
    const shareMatch=url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/share-links$/);
    if(shareMatch&&request.method==="POST") {
      const b=await parseBody(request,schemas.shareLink),raw=randomBytes(32).toString("base64url");
      const link=await transaction(session.user_id,session.id,requestId,async c=>{
        const allowed=await c.query("SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2 AND role IN ('owner','administrator') AND revoked_at IS NULL",[shareMatch[1],session.user_id]); if(!allowed.rowCount)throw new Error("FORBIDDEN");
        return (await c.query(`INSERT INTO app.tree_share_links(tree_id,token_hash,created_by,expires_at,usage_limit) VALUES($1,$2,$3,now()+($4||' hours')::interval,$5) RETURNING id,expires_at,usage_limit`,[shareMatch[1],sha256(raw),session.user_id,b.expiresInHours,b.usageLimit??null])).rows[0];
      }); return json({...link,token:raw},201);
    }
    const grantsMatch=url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/branch-grants$/);
    if(grantsMatch&&request.method==="GET") {
      const r=await transaction(session.user_id,session.id,requestId,async c=>{ const allowed=await c.query("SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2 AND role IN ('owner','administrator') AND revoked_at IS NULL",[grantsMatch[1],session.user_id]); if(!allowed.rowCount)throw new Error("FORBIDDEN"); return c.query("SELECT id,user_id,root_subfamily_id,role,can_read_contacts,can_write_contacts,granted_at,expires_at FROM app.branch_grants WHERE tree_id=$1 AND revoked_at IS NULL",[grantsMatch[1]]); }); return json(r.rows);
    }
    if(grantsMatch&&request.method==="POST") {
      const b=await parseBody(request,schemas.branchGrant); const r=await transaction(session.user_id,session.id,requestId,async c=>{ const allowed=await c.query("SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2 AND role IN ('owner','administrator') AND revoked_at IS NULL",[grantsMatch[1],session.user_id]); if(!allowed.rowCount)throw new Error("FORBIDDEN"); return (await c.query(`INSERT INTO app.branch_grants(user_id,tree_id,root_subfamily_id,role,can_read_contacts,can_write_contacts,granted_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[b.userId,grantsMatch[1],b.rootSubfamilyId,b.role,b.canReadContacts,b.canWriteContacts,session.user_id,b.expiresAt??null])).rows[0]; }); return json(r,201);
    }
    const contactsMatch=url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/members\/([0-9a-f-]+)\/contacts$/);
    if(contactsMatch&&request.method==="GET") { const r=await transaction(session.user_id,session.id,requestId,async c=>{ const allowed=await c.query<{allowed:boolean}>("SELECT app.can_read_contacts($1,$2) allowed",[contactsMatch[1],contactsMatch[2]]); if(!allowed.rows[0]?.allowed)throw new Error("FORBIDDEN"); return c.query("SELECT id,contact_type,display_value,label,address,is_primary,verified_at FROM app.member_contacts WHERE tree_id=$1 AND member_id=$2 AND deleted_at IS NULL",[contactsMatch[1],contactsMatch[2]]); }); return json(r.rows); }
    if(contactsMatch&&request.method==="POST") { const b=await parseBody(request,schemas.contact); const r=await transaction(session.user_id,session.id,requestId,async c=>{ const allowed=await c.query<{allowed:boolean}>("SELECT app.can_write_contacts($1,$2) allowed",[contactsMatch[1],contactsMatch[2]]); if(!allowed.rows[0]?.allowed)throw new Error("FORBIDDEN"); return (await c.query(`INSERT INTO app.member_contacts(tree_id,member_id,contact_type,normalized_value,display_value,label,address,is_primary,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id,contact_type,display_value,label,address,is_primary`,[contactsMatch[1],contactsMatch[2],b.contactType,b.normalizedValue??null,b.displayValue,b.label??null,b.address??null,b.isPrimary,session.user_id])).rows[0]; }); return json(r,201); }
    const treeMatch=url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)$/);
    if (treeMatch && request.method==="PATCH") {
      const b=await parseBody(request,schemas.tree); const r=await transaction(session.user_id,session.id,requestId,async c=>{
        const allowed=await c.query("SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2 AND role IN ('owner','administrator') AND revoked_at IS NULL",[treeMatch[1],session.user_id]);
        if(!allowed.rowCount) throw new Error("FORBIDDEN");
        return (await c.query(`UPDATE app.family_trees SET name_en=$2,name_ar=$3,description_en=$4,description_ar=$5 WHERE id=$1 RETURNING *`,[treeMatch[1],b.name_en,b.name_ar||null,b.description_en||null,b.description_ar||null])).rows[0];
      }); return json(r);
    }
    if (treeMatch && request.method==="DELETE") {
      await transaction(session.user_id,session.id,requestId,async c=>{
        const allowed=await c.query("SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2 AND role='owner' AND revoked_at IS NULL",[treeMatch[1],session.user_id]);
        if(!allowed.rowCount) throw new Error("FORBIDDEN");
        await c.query("UPDATE app.family_trees SET deleted_at=now() WHERE id=$1",[treeMatch[1]]);
      }); return json({ok:true});
    }
    if (url.pathname==="/api/migration/status") {
      const r=await query<{count:string}>("SELECT count(*)::text count FROM app.import_id_map WHERE import_batch_id=$1",[url.searchParams.get("batchId")]); return json({mapped:Number(r.rows[0]?.count??0)});
    }
    return json({code:"NOT_FOUND"},404);
  } catch(error) {
    console.error(error); const message=error instanceof Error?error.message:"INTERNAL_ERROR";
    if(error instanceof ApiError) return json({code:error.code,requestId},error.status);
    if(message==="EMAIL_EXISTS") return json({code:message},409);
    if(message==="DATABASE_NOT_CONFIGURED") return json({code:message},503);
    if(message==="FORBIDDEN") return json({code:message},403);
    return json({code:"INTERNAL_ERROR",requestId},500);
  }
}

async function readSnapshot(s:Session,rid:string,treeId:string) {
  return transaction(s.user_id,s.id,rid,async c=>{
    const tree=await c.query<{version:number}>(`SELECT t.version FROM app.family_trees t JOIN app.tree_memberships m ON m.tree_id=t.id AND m.user_id=$2 AND m.revoked_at IS NULL WHERE t.id=$1 AND t.deleted_at IS NULL
      UNION SELECT t.version FROM app.family_trees t JOIN app.branch_grants g ON g.tree_id=t.id AND g.user_id=$2 AND g.revoked_at IS NULL WHERE t.id=$1 AND t.deleted_at IS NULL`,[treeId,s.user_id]);
    if(!tree.rowCount) throw new Error("FORBIDDEN");
    const members=await c.query(`SELECT m.*,f.parent_id father_id,mo.parent_id mother_id FROM app.family_members m
      LEFT JOIN app.parent_child_relationships f ON f.child_id=m.id AND f.parent_role='father' AND f.deleted_at IS NULL
      LEFT JOIN app.parent_child_relationships mo ON mo.child_id=m.id AND mo.parent_role='mother' AND mo.deleted_at IS NULL
      WHERE m.tree_id=$1 AND m.deleted_at IS NULL`,[treeId]);
    const subfamilies=await c.query("SELECT * FROM app.subfamilies WHERE tree_id=$1 AND deleted_at IS NULL",[treeId]);
    const external=await c.query("SELECT * FROM app.external_children WHERE tree_id=$1 AND deleted_at IS NULL",[treeId]);
    const partners=await c.query(`SELECT u.id union_id,u.status,p.member_id,p.display_order FROM app.unions u JOIN app.union_partners p ON p.union_id=u.id WHERE u.tree_id=$1 AND u.deleted_at IS NULL ORDER BY u.display_order,p.display_order`,[treeId]);
    const byUnion=new Map<string,any[]>(); for(const p of partners.rows) byUnion.set(p.union_id,[...(byUnion.get(p.union_id)??[]),p]);
    const spouseMap=new Map<string,string[]>(),divorceMap=new Map<string,string[]>();
    for(const ps of byUnion.values()) if(ps.length===2) for(const [a,b] of [[ps[0],ps[1]],[ps[1],ps[0]]]) {
      spouseMap.set(a.member_id,[...(spouseMap.get(a.member_id)??[]),b.member_id]);
      if(a.status==='divorced') divorceMap.set(a.member_id,[...(divorceMap.get(a.member_id)??[]),b.member_id]);
    }
    return {version:tree.rows[0].version,members:members.rows.map((m:any)=>({...m,spouse_id:spouseMap.get(m.id)?.[0],spouse_ids:spouseMap.get(m.id),divorced_from:divorceMap.get(m.id),external_children:external.rows.filter((x:any)=>x.mother_id===m.id)})),subfamilies:subfamilies.rows};
  });
}

async function importSnapshot(s:Session,rid:string,treeId:string,b:any) {
  return transaction(s.user_id,s.id,rid,async c=>{
    const access=await c.query("SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2 AND role IN ('owner','administrator','editor') AND revoked_at IS NULL",[treeId,s.user_id]);
    if(!access.rowCount) throw new Error("FORBIDDEN");
    const expectedVersion=Number(b.expectedVersion); if(!Number.isInteger(expectedVersion)||expectedVersion<1) throw new ApiError("VERSION_REQUIRED",428);
    const locked=await c.query<{version:number}>("SELECT version FROM app.family_trees WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[treeId]);
    if(!locked.rowCount) throw new ApiError("NOT_FOUND",404); if(locked.rows[0].version!==expectedVersion) throw new ApiError("VERSION_CONFLICT",409);
    const batch=b.batchId||randomUUID(), map=new Map<string,string>(), sfMap=new Map<string,string>();
    await c.query("UPDATE app.family_members SET subfamily_id=NULL WHERE tree_id=$1 AND deleted_at IS NULL",[treeId]);
    await c.query("UPDATE app.parent_child_relationships SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",[treeId]);
    await c.query("UPDATE app.unions SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",[treeId]);
    await c.query("UPDATE app.external_children SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",[treeId]);
    await c.query("UPDATE app.subfamilies SET parent_subfamily_id=NULL,deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",[treeId]);
    await c.query("UPDATE app.family_members SET deleted_at=now() WHERE tree_id=$1 AND deleted_at IS NULL",[treeId]);
    for(const sf of b.subfamilies??[]) { const id=/^[0-9a-f]{8}-/.test(sf.id)?sf.id:randomUUID(); sfMap.set(sf.id,id);
      await c.query(`INSERT INTO app.subfamilies(id,tree_id,name_en,name_ar,notes,color) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(id) DO UPDATE SET name_en=excluded.name_en,name_ar=excluded.name_ar,notes=excluded.notes,color=excluded.color,deleted_at=NULL`,[id,treeId,sf.name_en,sf.name_ar||null,sf.notes||null,sf.color||null]); }
    for(const m of b.members??[]) { const id=/^[0-9a-f]{8}-/.test(m.id)?m.id:randomUUID(); map.set(m.id,id);
      await c.query(`INSERT INTO app.family_members(id,tree_id,name_en,name_ar,gender,birth_date,death_date,citizen_status,notes,is_unknown,pos_x,pos_y,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) ON CONFLICT(id) DO UPDATE SET name_en=excluded.name_en,name_ar=excluded.name_ar,birth_date=excluded.birth_date,death_date=excluded.death_date,citizen_status=excluded.citizen_status,notes=excluded.notes,is_unknown=excluded.is_unknown,pos_x=excluded.pos_x,pos_y=excluded.pos_y,deleted_at=NULL`,
        [id,treeId,m.name_en,m.name_ar,m.gender,m.birth_date||null,m.death_date||null,m.citizen_status||null,m.notes||null,!!m.is_unknown,m.pos_x??null,m.pos_y??null,s.user_id]);
      await c.query(`INSERT INTO app.import_id_map(import_batch_id,entity_type,source_id,target_id,status) VALUES($1,'member',$2,$3,'mapped') ON CONFLICT DO NOTHING`,[batch,m.id,id]); }
    for(const m of b.members??[]) for(const [role,key] of [['father','father_id'],['mother','mother_id']] as const) if(m[key]&&map.get(m[key])) await c.query(`INSERT INTO app.parent_child_relationships(tree_id,child_id,parent_id,parent_role,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[treeId,map.get(m.id),map.get(m[key]),role,s.user_id]);
    const pairs=new Map<string,{a:string;b:string;divorced:boolean;order:number}>();
    for(const [order,m] of (b.members??[]).entries()) for(const spouse of [...(m.spouse_ids??[]),...(m.spouse_id?[m.spouse_id]:[]),...(m.divorced_from??[])]) {
      if(!map.get(spouse)||spouse===m.id) continue; const ids=[map.get(m.id)!,map.get(spouse)!].sort(),key=ids.join(':');
      pairs.set(key,{a:ids[0],b:ids[1],divorced:(m.divorced_from??[]).includes(spouse)||(pairs.get(key)?.divorced??false),order});
    }
    for(const pair of pairs.values()) {
      const existing=await c.query(`SELECT u.id FROM app.unions u JOIN app.union_partners a ON a.union_id=u.id AND a.member_id=$2 JOIN app.union_partners b ON b.union_id=u.id AND b.member_id=$3 WHERE u.tree_id=$1 AND u.deleted_at IS NULL`,[treeId,pair.a,pair.b]);
      if(existing.rowCount) { await c.query("UPDATE app.unions SET status=$2 WHERE id=$1",[existing.rows[0].id,pair.divorced?'divorced':'current']); continue; }
      const union=await c.query("INSERT INTO app.unions(tree_id,status,display_order,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING id",[treeId,pair.divorced?'divorced':'current',pair.order,s.user_id]);
      await c.query("INSERT INTO app.union_partners(union_id,tree_id,member_id,display_order) VALUES($1,$2,$3,0),($1,$2,$4,1)",[union.rows[0].id,treeId,pair.a,pair.b]);
    }
    for(const sf of b.subfamilies??[]) await c.query("UPDATE app.subfamilies SET parent_subfamily_id=$1,linked_male_id=$2 WHERE id=$3",[sf.parent_subfamily_id?sfMap.get(sf.parent_subfamily_id)??null:null,sf.linked_male_id?map.get(sf.linked_male_id)??null:null,sfMap.get(sf.id)]);
    for(const m of b.members??[]) {
      if(m.subfamily_id&&sfMap.get(m.subfamily_id)) await c.query("UPDATE app.family_members SET subfamily_id=$1 WHERE id=$2",[sfMap.get(m.subfamily_id),map.get(m.id)]);
      for(const x of m.external_children??[]) await c.query(`INSERT INTO app.external_children(tree_id,mother_id,name,other_parent_name,birth_year,notes)
        SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS(SELECT 1 FROM app.external_children WHERE tree_id=$1 AND mother_id=$2 AND name=$3 AND deleted_at IS NULL)`,[treeId,map.get(m.id),x.name,x.other_parent_name||null,x.birth_year?Number(x.birth_year):null,x.notes||null]);
    }
    const updated=await c.query<{version:number}>("UPDATE app.family_trees SET version=version+1 WHERE id=$1 RETURNING version",[treeId]);
    return {batchId:batch,mapped:map.size+sfMap.size,reconciled:true,version:updated.rows[0].version};
  });
}
