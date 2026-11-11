export interface ListeningEntry {userId:string;partnerId:string;messageId:string;stationId?:string;expiresAt:number}
type Client={revision:number;seenAt:number;entry:ListeningEntry|null};
/** Short-lived, conversation-scoped presence; at most five devices per account. */
export class ChatListeningRegistry {
 private users=new Map<string,Map<string,Client>>();private nextSweep=0;
 update(userId:string,partnerId:string,messageId:string,clientId:string,revision:number,listening:boolean,now=Date.now(),stationId?:string):boolean{
  this.sweep(now);const clients=this.users.get(userId)||new Map<string,Client>(),previous=clients.get(clientId);if(previous&&revision<=previous.revision)return false;
  if(!previous&&clients.size>=5)clients.delete(clients.keys().next().value!);
  clients.set(clientId,{revision,seenAt:now,entry:listening?{userId,partnerId,messageId,...(stationId?{stationId}:{}),expiresAt:now+35000}:null});this.users.set(userId,clients);return true;
 }
 between(userId:string,partnerId:string,now=Date.now()):ListeningEntry[]{this.sweep(now);return [...(this.users.get(userId)?.values()||[]),...(this.users.get(partnerId)?.values()||[])].flatMap(record=>record.entry&&record.entry.expiresAt>now&&((record.entry.userId===userId&&record.entry.partnerId===partnerId)||(record.entry.userId===partnerId&&record.entry.partnerId===userId))?[record.entry]:[]);}
 removeMessage(messageId:string,userIds:string[]){for(const id of userIds)for(const record of this.users.get(id)?.values()||[])if(record.entry?.messageId===messageId)record.entry=null;}
 private sweep(now:number){if(now<this.nextSweep)return;this.nextSweep=now+30000;for(const [userId,clients]of this.users){for(const [clientId,record]of clients)if(record.seenAt+120000<now)clients.delete(clientId);if(!clients.size)this.users.delete(userId);}}
}
export const chatListening=new ChatListeningRegistry();
