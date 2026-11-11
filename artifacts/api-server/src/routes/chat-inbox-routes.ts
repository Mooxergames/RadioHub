import {CacheManager} from '../cache';
import type {Express,RequestHandler} from 'express';
import {rateLimit} from 'express-rate-limit';
import {getPostgresPool} from '../postgres-runtime';
import {chatService} from '../services/chat-service';
import {logger} from '../utils/logger';
export const inboxActions=['archive','unarchive','mute','unmute','unread','read','clear','delete'] as const;
export function inboxInput(body:any){
 if(!body||!['direct','group'].includes(body.kind)||typeof body.targetId!=='string'||!/^[a-f0-9]{24}$/.test(body.targetId)||!inboxActions.includes(body.action))throw Object.assign(Error('Invalid inbox action'),{status:400});
 return body as {kind:'direct'|'group';targetId:string;action:typeof inboxActions[number]};
}
export function registerChatInboxRoutes(app:Express,auth:RequestHandler){
 const limit=rateLimit({windowMs:60000,max:40,keyGenerator:(req:any)=>req.session?.user?.userId||req.session?.userId||'unauthenticated',standardHeaders:true,legacyHeaders:false});
 const actor=(req:any)=>req.session?.user?.userId||req.session?.userId;
 app.get('/api/messages/inbox-state',auth,async(req,res)=>{res.setHeader('Cache-Control','private, no-store');try{const id=actor(req);if(!id)return void res.sendStatus(401);res.json({states:(await getPostgresPool().query('SELECT kind,target_id AS "targetId",archived,muted,marked_unread AS "markedUnread",deleted FROM chat_inbox_state WHERE user_id=$1',[id])).rows});}catch(error){logger.error('Inbox read failed',error);res.status(500).json({error:'Unable to load inbox preferences'});}});
 app.post('/api/messages/inbox-state',auth,limit,async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');let db:any;
  try{
   const id=actor(req);if(!id)return void res.sendStatus(401);const {kind,targetId,action}=inboxInput(req.body);if(id===targetId)throw Object.assign(Error('Invalid target'),{status:400});
   db=await getPostgresPool().connect();await db.query('BEGIN');
   // Serialize preferences for one actor/target, including an initially absent row.
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${id}:${kind}:${targetId}`]);
   if(kind==='group'){
    const member=(await db.query('SELECT status FROM chat_group_members WHERE group_id=$1 AND user_id=$2 FOR UPDATE',[targetId,id])).rows[0];
    if(!member||!['active','invited','left'].includes(member.status))throw Object.assign(Error('Group unavailable'),{status:404});
    if(action==='delete'&&member.status!=='left')throw Object.assign(Error('Leave the group before deleting its conversation'),{status:409});
    if(action==='clear'&&member.status==='invited')throw Object.assign(Error('Join the group first'),{status:403});
   }else{
    const allowed=await db.query('SELECT 1 FROM users u WHERE u.id=$2 AND (EXISTS(SELECT 1 FROM direct_messages WHERE (from_user_id=$1 AND to_user_id=$2) OR (from_user_id=$2 AND to_user_id=$1)) OR EXISTS(SELECT 1 FROM user_follows WHERE (follower_id=$1 AND following_id=$2) OR (following_id=$1 AND follower_id=$2)))',[id,targetId]);
    if(!allowed.rows.length)throw Object.assign(Error('Conversation unavailable'),{status:404});
   }
   await db.query('INSERT INTO chat_inbox_state(user_id,kind,target_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,kind,targetId]);
   const column=action==='archive'||action==='unarchive'?'archived':action==='mute'||action==='unmute'?'muted':action==='unread'||action==='read'?'marked_unread':null;
   if(column)await db.query(`UPDATE chat_inbox_state SET ${column}=$4,updated_at=now() WHERE user_id=$1 AND kind=$2 AND target_id=$3`,[id,kind,targetId,['archive','mute','unread'].includes(action)]);
   if(action==='read'){
    if(kind==='direct')await db.query('UPDATE direct_messages SET is_read=true,read_at=COALESCE(read_at,now()) WHERE from_user_id=$2 AND to_user_id=$1 AND NOT ($1=ANY(hidden_for))',[id,targetId]);
    else await db.query('UPDATE chat_group_members SET read_at=now() WHERE group_id=$2 AND user_id=$1',[id,targetId]);
   }
   if(action==='clear'||action==='delete'){
    if(kind==='direct')await db.query('UPDATE direct_messages SET hidden_for=array_append(hidden_for,$1) WHERE ((from_user_id=$1 AND to_user_id=$2) OR (from_user_id=$2 AND to_user_id=$1)) AND NOT ($1=ANY(hidden_for))',[id,targetId]);
    else await db.query('UPDATE chat_group_messages SET hidden_for=array_append(hidden_for,$1) WHERE group_id=$2 AND NOT ($1=ANY(hidden_for))',[id,targetId]);
    await db.query("UPDATE chat_inbox_state SET deleted=$4,marked_unread=false,updated_at=now() WHERE user_id=$1 AND kind=$2 AND target_id=$3",[id,kind,targetId,action==='delete']);
    if(kind==='direct')await db.query("UPDATE user_notifications SET is_read=true,read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND type='new_message' AND from_user_id=$2",[id,targetId]);
   }
   const states=(await db.query('SELECT kind,target_id AS "targetId",archived,muted,marked_unread AS "markedUnread",deleted FROM chat_inbox_state WHERE user_id=$1',[id])).rows;
   await db.query('COMMIT');if(['read','clear','delete'].includes(action))await CacheManager.clearByPattern(`notifications:postgres:${id}:`).catch(()=>{});res.json({states});if(action==='read'&&kind==='direct')chatService.sendToUser(targetId,{type:'chat:read',byUserId:id});chatService.sendToUser(id,{type:'chat:inbox-updated',kind,targetId,action});
  }catch(error:any){await db?.query('ROLLBACK').catch(()=>{});if(!error.status)logger.error('Inbox action failed',error);res.status(error.status||500).json({error:error.status?error.message:'Unable to update conversation'});}finally{db?.release();}
 });
}
