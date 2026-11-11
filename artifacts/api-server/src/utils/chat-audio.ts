/** Only containers emitted by the app recorder. MIME alone is not trusted. */
export function chatAudioExtension(bytes: Buffer): 'webm' | 'm4a' | 'ogg' | null {
  if(bytes.length<12)return null;
  if(bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)return 'webm';
  if(bytes.toString('ascii',4,8)==='ftyp'&&['M4A ','isom','mp42','mp41'].includes(bytes.toString('ascii',8,12)))return 'm4a';
  if(bytes.toString('ascii',0,4)==='OggS')return 'ogg';
  return null;
}
export const validChatAudioPath=(value:unknown):value is string=>typeof value==='string'&&/^\/uploads\/chat\/voice-[a-z0-9_-]+\.(?:m4a|webm|ogg)$/i.test(value);
