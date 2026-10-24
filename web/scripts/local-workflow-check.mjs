// Run alongside `next dev --port 3104`; synthetic local user removed afterward.
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
process.loadEnvFile('.env.local');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (new URL(url).hostname !== '127.0.0.1') throw new Error('Local database only');
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, {auth:{persistSession:false}});
const email = `workflow-${crypto.randomUUID()}@example.test`, password = crypto.randomUUID();
const made = await admin.auth.admin.createUser({email,password,email_confirm:true});
if(made.error) throw made.error;
const jar = new Map();
try {
 const db = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(r=>jar.set(r.name,r.value))}});
 const auth = await db.auth.signInWithPassword({email,password}); if(auth.error) throw auth.error;
 const saved = await db.from('moves').insert({renter_name:'Example Renter',address_private:'100 Synthetic Avenue, Unit 4, Example City, CA 94110',address_line1:'100 Synthetic Avenue',address_line2:'Unit 4',city:'Example City',region:'CA',zip:'94110',move_out_date:'2026-11-30',landlord_name:'Example Manager',landlord_email:'manager@example.test',property_management_company:'Example Management',deposit_cents:395000}); if(saved.error)throw saved.error;
 const cookie=[...jar].map(([k,v])=>`${k}=${v}`).join('; ');
 for(const [route,required,excluded] of [
 ['/dashboard',['100 Synthetic Avenue','Example Renter','Example Management','No checklist yet','No listings yet','Your moving assistant'],['1847 Guerrero','Bayline']],
 ['/start',['100 Synthetic Avenue','Example Renter','Unit 4','Example City','Example Management','manager@example.test'],['1847 Guerrero']],
 ['/move',['100 Synthetic Avenue','Example Renter','Unit 4','Example City','Example Management','manager@example.test'],['1847 Guerrero']],
 ['/items',['No items yet'],['Offer pending']],
 ['/demo',['Example move','1847 Guerrero'],['100 Synthetic Avenue']]]){
 const r=await fetch('http://localhost:3104'+route,{headers:{cookie}}); const html=await r.text();
 if(r.status!==200)throw new Error(`${route}: ${r.status}`);
 for(const s of required)if(!html.includes(s))throw new Error(`${route} missing ${s}`);
 for(const s of excluded)if(html.includes(s))throw new Error(`${route} leaked ${s}`);
 console.log(`PASS ${route}: expected account/demo separation`);
 }
 const anonymous=await fetch('http://localhost:3104/dashboard',{redirect:'manual'});
 if(anonymous.status!==307)throw new Error('Anonymous dashboard should redirect');
 console.log('PASS anonymous dashboard requires sign-in');
} finally { const removed=await admin.auth.admin.deleteUser(made.data.user.id); if(removed.error)throw removed.error; }
