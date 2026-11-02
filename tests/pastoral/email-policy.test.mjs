import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNotification, normalizeRecipient, encodeMessage, seal, unseal, runtimeAllowed, validateGoogleIdentity, GMAIL_SCOPES, classifySendFailure } from '../../src/features/email/policy.ts';
const who={samLabel:'1-1',requesterName:'김시리'};
test('submission notifications have one sentence and never include source contents',()=>{
 const privateFields={content:'PRIVATE_PRAYER',reason:'PRIVATE_REASON',attachments:['PRIVATE_FILE']};
 assert.equal(formatNotification('pastoral',{...who,...privateFields}).text,'1-1샘 김시리가 목양지를 제출하였습니다.');
 assert.equal(formatNotification('prayer',who).text,'1-1샘 김시리가 기도요청을 제출했습니다.');
 assert.equal(formatNotification('visit',{...who,visitDate:'2026-11-01',visitTime:'15:00'}).text,'1-1샘 김시리가 11월 1일 오후3시에 심방을 신청했습니다.');
 assert.equal(formatNotification('visit',{...who,samLabel:'1-1샘',visitDate:'2026-11-01',visitTime:'오후 3시 30분'}).text,'1-1샘 김시리가 11월 1일 오후3시30분에 심방을 신청했습니다.');
 assert.equal(formatNotification('prayer',{...who,requesterName:'홍길동'}).text,'1-1샘 홍길동이 기도요청을 제출했습니다.');
 assert.equal(formatNotification('visit',{...who,visitDate:'2026-11-01',visitTime:'PRIVATE_REASON'}).text,'1-1샘 김시리가 11월 1일에 심방을 신청했습니다.');
 assert.equal(formatNotification('prayer',{...who,samLabel:null}).text,'김시리가 기도요청을 제출했습니다.');
});
test('Gmail receiver is a single normalized address with no headers',()=>{
 assert.equal(normalizeRecipient(' Admin@Gmail.com '),'admin@gmail.com');
 for(const x of ['a@b.com\r\nBcc:x@y.com','a@b.com,c@d.com','Name <a@b.com>','',null])assert.throws(()=>normalizeRecipient(x));
});
test('MIME is UTF-8, one recipient and resistant to header injection',()=>{
 const raw=encodeMessage({email:'admin@example.test',subject:'[3D] 알림',text:'한 줄 알림',id:'00000000-0000-4000-8000-000000000001',date:new Date('2026-10-10T00:00:00Z')});
 const mime=Buffer.from(raw,'base64url').toString();
 assert.ok(mime.includes('To: admin@example.test\r\n'));assert.ok(mime.includes('charset=UTF-8'));
 assert.ok(mime.includes(Buffer.from('한 줄 알림').toString('base64')));
 assert.throws(()=>encodeMessage({email:'x@y.test\r\nBcc:z@w.test',subject:'s',text:'t',id:'bad',date:new Date()}));
});
test('mail token encryption is authenticated and separated from PKCE encryption',()=>{
 const key=Buffer.alloc(32,7).toString('base64'),c=seal('TOKEN',key,'token');
 assert.equal(unseal(c,key,'token'),'TOKEN');assert.notEqual(c,seal('TOKEN',key,'token'));
 assert.throws(()=>unseal(c,key,'pkce'));assert.throws(()=>unseal(c,Buffer.alloc(32,8).toString('base64'),'token'));
 assert.throws(()=>unseal(c+'.extra',key,'token'));assert.throws(()=>seal('x','bad','token'));
});
test('OAuth grant only requests send and verified matching identity',()=>{
 assert.deepEqual(GMAIL_SCOPES,['openid','email','https://www.googleapis.com/auth/gmail.send']);
 const p={email:'admin@gmail.com',email_verified:true,nonce:'expected'};
 assert.doesNotThrow(()=>validateGoogleIdentity(p,'admin@gmail.com','expected'));
 for(const q of [{...p,email_verified:false},{...p,email:'other@gmail.com'},{...p,nonce:'wrong'}])assert.throws(()=>validateGoogleIdentity(q,'admin@gmail.com','expected'));
});
test('only the configured production origin may dispatch',()=>{
 const origin='https://app.example.test';
 assert.equal(runtimeAllowed({VERCEL_ENV:'production',NODE_ENV:'production'},origin,origin),true);
 for(const env of [{NODE_ENV:'production'},{VERCEL_ENV:'preview',NODE_ENV:'production'},{VERCEL_ENV:'production',NODE_ENV:'test'}])assert.equal(runtimeAllowed(env,origin,origin),false);
 assert.equal(runtimeAllowed({VERCEL_ENV:'production',NODE_ENV:'production'},'https://preview.example.test',origin),false);
});
test('ambiguous send outcomes are never blindly retried',()=>{
 assert.equal(classifySendFailure(429),'retry');assert.equal(classifySendFailure(403,'rateLimitExceeded'),'retry');
 assert.equal(classifySendFailure(400),'failed');assert.equal(classifySendFailure(403,'insufficientPermissions'),'failed');
 for(const status of [0,500,502,503])assert.equal(classifySendFailure(status),'unknown');
});
