/* The Send Cambodia CRM — single-page app. Talks to /api/* (netlify/functions/api.mjs). */
(() => {
'use strict';

/* ---------- reference lists (keys match api.mjs) ---------- */
const PROVINCES = [
  ['phnom-penh','Phnom Penh','ភ្នំពេញ'],['banteay-meanchey','Banteay Meanchey','បន្ទាយមានជ័យ'],['battambang','Battambang','បាត់ដំបង'],
  ['kampong-cham','Kampong Cham','កំពង់ចាម'],['kampong-chhnang','Kampong Chhnang','កំពង់ឆ្នាំង'],['kampong-speu','Kampong Speu','កំពង់ស្ពឺ'],
  ['kampong-thom','Kampong Thom','កំពង់ធំ'],['kampot','Kampot','កំពត'],['kandal','Kandal','កណ្ដាល'],['kep','Kep','កែប'],
  ['koh-kong','Koh Kong','កោះកុង'],['kratie','Kratie','ក្រចេះ'],['mondulkiri','Mondulkiri','មណ្ឌលគិរី'],['oddar-meanchey','Oddar Meanchey','ឧត្ដរមានជ័យ'],
  ['pailin','Pailin','ប៉ៃលិន'],['preah-sihanouk','Preah Sihanouk','ព្រះសីហនុ'],['preah-vihear','Preah Vihear','ព្រះវិហារ'],['prey-veng','Prey Veng','ព្រៃវែង'],
  ['pursat','Pursat','ពោធិ៍សាត់'],['ratanakiri','Ratanakiri','រតនគិរី'],['siem-reap','Siem Reap','សៀមរាប'],['stung-treng','Stung Treng','ស្ទឹងត្រែង'],
  ['svay-rieng','Svay Rieng','ស្វាយរៀង'],['takeo','Takeo','តាកែវ'],['tbong-khmum','Tbong Khmum','ត្បូងឃ្មុំ'],['outside','Outside Cambodia','ក្រៅប្រទេសកម្ពុជា'],
];
const ROLES = [['attendee','Attendee','អ្នកចូលរួម'],['volunteer','Volunteer','អ្នកស្ម័គ្រចិត្ត'],['pastor','Pastor','គ្រូគង្វាល'],
  ['church-contact','Church contact','អ្នកទំនាក់ទំនងក្រុមជំនុំ'],['donor','Donor','អ្នកឧបត្ថម្ភ'],['responder','Responder','អ្នកឆ្លើយតប'],['staff','Staff','បុគ្គលិក']];
const STAGES = [['invited','Invited','បានអញ្ជើញ'],['interested','Interested','ចាប់អារម្មណ៍'],['committed','Committed','បានប្តេជ្ញា'],['bringing-group','Bringing a group','នាំក្រុមមក']];
const AGE = [['u18','Under 18','ក្រោម ១៨'],['18-25','18–25','១៨–២៥'],['26-35','26–35','២៦–៣៥'],['36-50','36–50','៣៦–៥០'],['50+','50+','៥០+']];
const SIZES = [['<50','Under 50','ក្រោម ៥០'],['50-150','50–150','៥០–១៥០'],['150-500','150–500','១៥០–៥០០'],['500+','500+','៥០០+']];
const LANGS = [['km','Khmer','ខ្មែរ'],['en','English','អង់គ្លេស'],['both','Both','ទាំងពីរ']];

/* ---------- state ---------- */
const LS = { get:k=>{try{return localStorage.getItem(k)}catch(e){return null}}, set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}, del:k=>{try{localStorage.removeItem(k)}catch(e){}} };
let lang = LS.get('crm_lang') || 'km';
let code = LS.get('crm_code') || '', user = LS.get('crm_user') || '', role = null;
let people = [], churches = [], loaded = false;
let pFilter = { q:'', role:'', province:'', church:'' }, pShow = 100, churchView = 'board';
let importRows = null, importResult = null;

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t = (en, km) => lang === 'km' ? km : en;
const label = (list, k) => { const r = list.find(x => x[0] === k); return r ? t(r[1], r[2]) : ''; };
const opts = (list, val, blank) => (blank ? `<option value="">${esc(blank)}</option>` : '') + list.map(r => `<option value="${esc(r[0])}" ${r[0]===val?'selected':''}>${esc(t(r[1],r[2]))}</option>`).join('');
const nameOf = r => r ? (lang === 'km' ? (r.nameKm || r.nameEn) : (r.nameEn || r.nameKm)) || t('No name','គ្មានឈ្មោះ') : '';
const otherName = r => lang === 'km' ? (r.nameKm && r.nameEn ? r.nameEn : '') : (r.nameKm && r.nameEn ? r.nameKm : '');
const initials = r => { const n = (r.nameEn || r.nameKm || '?').trim(); const w = n.split(/\s+/); return (/[ក-៿]/.test(n) ? Array.from(n)[0] : (w[0][0] + (w.length > 1 ? w[w.length-1][0] : ''))).toUpperCase(); };
const fmtPhone = p => !p ? '' : p.startsWith('+855') ? '0' + p.slice(4).replace(/^(\d{2})(\d{3})(\d+)$/, '$1 $2 $3') : p;
const churchOf = id => churches.find(c => c.id === id);
// Same rule as the server: 012 345 678 / 855… / +855… all become +855…
function normPhone(raw){ let s=String(raw??'').replace(/[\s\-().]/g,''); if(!s) return ''; if(s.startsWith('00')) s='+'+s.slice(2);
  if(!s.startsWith('+')) s = s.startsWith('855') ? '+'+s : '+855'+(s.startsWith('0')?s.slice(1):s); if(s.startsWith('+8550')) s='+855'+s.slice(5);
  if(!/^\+\d{8,15}$/.test(s)) return null; if(s.startsWith('+855') && !/^\+855\d{8,9}$/.test(s)) return null; return s; }
function toast(msg){ const d=document.createElement('div'); d.className='toast'; d.textContent=msg; document.body.appendChild(d); setTimeout(()=>d.remove(),2600); }
const LOGO = '<svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="66" fill="none" stroke="#E8382D" stroke-width="16"/><path d="M42 80 H114 M88 54 L114 80 L88 106" fill="none" stroke="#E8382D" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ERR = { bad_phone:['That phone number doesn’t look right. Use a Cambodian number like 012 345 678, or include the country code.','លេខទូរស័ព្ទនោះមិនត្រឹមត្រូវ។ សូមប្រើលេខកម្ពុជា ដូចជា 012 345 678 ឬបញ្ចូលលេខកូដប្រទេស។'],
  no_name:['Add a name in Khmer or English.','សូមបញ្ចូលឈ្មោះជាភាសាខ្មែរ ឬអង់គ្លេស។'], forbidden:['Only an admin can do that.','មានតែអ្នកគ្រប់គ្រងទេដែលអាចធ្វើបាន។'],
  network:['Couldn’t reach the server. Check your connection and try again.','មិនអាចភ្ជាប់ទៅម៉ាស៊ីនមេបានទេ។ សូមពិនិត្យការតភ្ជាប់ ហើយព្យាយាមម្តងទៀត។'] };
const errMsg = e => { const m = ERR[e] || ERR.network; return t(m[0], m[1]); };

async function api(path, opts = {}) {
  let res;
  try { res = await fetch('/api/' + path, { ...opts, headers: { 'content-type':'application/json', 'x-crm-code':code, 'x-crm-user':encodeURIComponent(user), ...(opts.headers||{}) } }); }
  catch (e) { throw Object.assign(new Error('network'), { code:'network' }); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { role = null; LS.del('crm_code'); render(); throw Object.assign(new Error('bad_code'), { code:'bad_code' }); }
  if (!res.ok) throw Object.assign(new Error(data.error || 'error'), { code:data.error || 'error', data });
  return data;
}
async function load(){ const d = await api('data'); role = d.role; people = d.people; churches = d.churches; loaded = true; }

/* ---------- routing ---------- */
const route = () => (location.hash.slice(1) || 'dashboard').split('/');
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
const go = h => { if (location.hash === '#' + h) render(); else location.hash = h; };

/* ---------- shell ---------- */
function shell(body){
  const [r] = route();
  const nav = [['dashboard','Dashboard','ផ្ទាំងសង្ខេប'],['people','People','មនុស្ស'],['churches','Churches','ក្រុមជំនុំ'],['import','Import','នាំចូល']];
  return `<header class="bar"><div class="bar-in">
    <button class="logo" data-go="dashboard" aria-label="Home">${LOGO}<span><b>THE SEND</b><small>CAMBODIA · CRM</small></span></button>
    <div class="sp"></div>
    <div class="lang" role="group" aria-label="Language"><button data-lang="km" aria-pressed="${lang==='km'}">ខ្មែរ</button><button data-lang="en" aria-pressed="${lang==='en'}">EN</button></div>
    <button class="who" data-act="signout" title="${esc(user)} · ${t('Sign out','ចាកចេញ')}">${esc(initials({nameEn:user}))}</button>
  </div><nav class="nav">${nav.map(n=>`<a href="#${n[0]}" ${r===n[0]?'aria-current="page"':''}>${t(n[1],n[2])}</a>`).join('')}</nav></header>
  <main>${body}</main>`;
}
const H1 = (en, km) => `<h1 class="${lang==='km'?'km':''}">${esc(t(en,km))}</h1>`;
const H2 = (en, km) => `<h2 class="${lang==='km'?'km':''}">${esc(t(en,km))}</h2>`;

function gate(failed){
  return `<div class="gate"><form id="gateForm">
    <div class="logo" style="gap:14px">${LOGO.replace('<svg','<svg style="width:56px;height:56px"')}<span><b style="font-size:22px">THE SEND</b><small>CAMBODIA · CRM</small></span></div>
    <h1>${t('Sign in','ចូល')}</h1>
    <label class="f" for="gName">${t('Your name','ឈ្មោះរបស់អ្នក')}</label><input id="gName" type="text" autocomplete="name" value="${esc(user)}" required maxlength="60">
    <label class="f" for="gCode">${t('Team access code','លេខកូដចូលក្រុម')}</label><input id="gCode" type="password" autocomplete="current-password" required>
    <div class="err">${failed?t('That code didn’t work.','លេខកូដនោះមិនត្រឹមត្រូវ។'):''}</div>
    <button class="btn" type="submit">${t('Continue','បន្ត')}</button>
    <div class="lang" style="align-self:flex-start"><button type="button" data-lang="km" aria-pressed="${lang==='km'}">ខ្មែរ</button><button type="button" data-lang="en" aria-pressed="${lang==='en'}">EN</button></div>
  </form></div>`;
}

/* ---------- dashboard ---------- */
function vDashboard(){
  const count = r => people.filter(p => (p.roles||[]).includes(r)).length;
  const byStage = STAGES.map(s => [s, churches.filter(c => c.stage === s[0]).length]);
  const maxStage = Math.max(1, ...byStage.map(x => x[1]));
  const prov = {}; people.forEach(p => { if (p.province) prov[p.province] = (prov[p.province]||0) + 1; });
  const provTop = Object.entries(prov).sort((a,b) => b[1]-a[1]).slice(0, 8), maxProv = Math.max(1, ...provTop.map(x => x[1]));
  const recent = [...people].sort((a,b) => (b.createdAt||0)-(a.createdAt||0)).slice(0, 6);
  const noPhone = people.filter(p => !p.phone).length;
  return `<p class="eyebrow">${t('The Send Cambodia','The Send កម្ពុជា')}</p>${H1('Dashboard','ផ្ទាំងសង្ខេប')}
  <div class="tiles">
    ${[[people.length,'People','មនុស្ស'],[count('volunteer'),'Volunteers','អ្នកស្ម័គ្រចិត្ត'],[count('pastor'),'Pastors','គ្រូគង្វាល'],[count('responder'),'Responders','អ្នកឆ្លើយតប'],
      [churches.length,'Churches','ក្រុមជំនុំ'],[churches.filter(c=>c.stage==='committed'||c.stage==='bringing-group').length,'Churches committed','ក្រុមជំនុំបានប្តេជ្ញា']]
      .map(x=>`<div class="tile"><b>${x[0]}</b><span>${t(x[1],x[2])}</span></div>`).join('')}
  </div>
  <div class="grid2">
    <div class="card">${H2('Church partners by stage','ដៃគូក្រុមជំនុំតាមដំណាក់កាល')}
      ${byStage.map(([s,n])=>`<div class="hbar"><span>${esc(t(s[1],s[2]))}</span><i style="width:${n/maxStage*100}%"></i><em>${n}</em></div>`).join('')}
      <div class="row" style="margin-top:12px"><a class="btn small ghost" href="#churches">${t('Open the board','បើកផ្ទាំង')}</a></div></div>
    <div class="card">${H2('People by province','មនុស្សតាមខេត្ត')}
      ${provTop.length ? provTop.map(([k,n])=>`<div class="hbar"><span>${esc(label(PROVINCES,k))}</span><i style="width:${n/maxProv*100}%"></i><em>${n}</em></div>`).join('') : `<p class="muted">${t('No people yet.','មិនទាន់មានមនុស្សទេ។')}</p>`}
      ${noPhone?`<p class="muted" style="font-size:13px">${t(`${noPhone} without a phone number.`,`${noPhone} នាក់ គ្មានលេខទូរស័ព្ទ។`)}</p>`:''}</div>
  </div>
  <div class="card" style="margin-top:16px">${H2('Recently added','បានបន្ថែមថ្មីៗ')}
    ${recent.length ? `<ul class="list">${recent.map(personRow).join('')}</ul>` : `<p class="muted">${t('Start by adding a person or importing a spreadsheet.','ចាប់ផ្តើមដោយបន្ថែមមនុស្ស ឬនាំចូលឯកសារ។')}</p>`}
    <div class="row" style="margin-top:12px"><a class="btn" href="#people/new">${t('Add a person','បន្ថែមមនុស្ស')}</a><a class="btn ghost" href="#import">${t('Import a spreadsheet','នាំចូលឯកសារ')}</a></div></div>`;
}

/* ---------- people ---------- */
function personRow(p){
  const ch = churchOf(p.churchId);
  return `<li><a href="#people/${esc(p.id)}"><span class="av">${esc(initials(p))}</span><span class="grow"><b>${esc(nameOf(p))}${otherName(p)?` <small>· ${esc(otherName(p))}</small>`:''}</b>
    <small>${esc(fmtPhone(p.phone)) || t('No phone','គ្មានលេខទូរស័ព្ទ')}${p.province?' · '+esc(label(PROVINCES,p.province)):''}${ch?' · '+esc(nameOf(ch)):''}</small><br>
    ${(p.roles||[]).map(r=>`<span class="pill">${esc(label(ROLES,r))}</span>`).join('')}</span></a></li>`;
}
function filteredPeople(){
  const q = pFilter.q.trim().toLowerCase(), qd = q.replace(/\D/g,'');
  return people.filter(p => (!pFilter.role || (p.roles||[]).includes(pFilter.role)) && (!pFilter.province || p.province === pFilter.province) && (!pFilter.church || p.churchId === pFilter.church)
    && (!q || [p.nameKm,p.nameEn,p.telegram,p.email].some(v => (v||'').toLowerCase().includes(q)) || (qd.length >= 3 && (p.phone||'').replace(/\D/g,'').includes(qd.replace(/^0/,'')))))
    .sort((a,b) => nameOf(a).localeCompare(nameOf(b)));
}
function vPeople(){
  const list = filteredPeople();
  return `<div class="row" style="justify-content:space-between">${H1('People','មនុស្ស')}<a class="btn" href="#people/new">${t('Add a person','បន្ថែមមនុស្ស')}</a></div>
  <div class="toolbar">
    <input type="search" id="pq" placeholder="${t('Search name, phone or Telegram','ស្វែងរកឈ្មោះ លេខទូរស័ព្ទ ឬ Telegram')}" value="${esc(pFilter.q)}" aria-label="Search">
    <select id="prole" aria-label="Role">${opts(ROLES, pFilter.role, t('All roles','តួនាទីទាំងអស់'))}</select>
    <select id="pprov" aria-label="Province">${opts(PROVINCES, pFilter.province, t('All provinces','ខេត្តទាំងអស់'))}</select>
  </div>
  ${pFilter.church?`<p class="note">${t('Showing people from','បង្ហាញមនុស្សពី')} <b>${esc(nameOf(churchOf(pFilter.church)))}</b> · <a href="#" data-act="clear-church">${t('show everyone','បង្ហាញទាំងអស់')}</a></p>`:''}
  <p class="muted" style="margin:4px 0">${list.length} ${t(list.length===1?'person':'people','នាក់')}</p>
  <ul class="list">${list.slice(0, pShow).map(personRow).join('')}</ul>
  ${list.length > pShow ? `<div class="row" style="margin-top:12px"><button class="btn ghost" data-act="more">${t('Show more','បង្ហាញបន្ថែម')}</button></div>` : ''}
  ${role==='admin' && people.length ? `<div class="row" style="margin-top:20px"><button class="btn small ghost" data-act="export">${t('Download people (CSV)','ទាញយកមនុស្ស (CSV)')}</button></div>` : ''}`;
}
function vPerson(id){
  const isNew = id === 'new', p = isNew ? { roles:[], churchId: new URLSearchParams(location.hash.split('?')[1]||'').get('church')||'' } : people.find(x => x.id === id);
  if (!p) return `${H1('Not found','រកមិនឃើញ')}<a class="btn ghost" href="#people">${t('Back to people','ត្រឡប់ទៅមនុស្ស')}</a>`;
  const sortedCh = [...churches].sort((a,b) => nameOf(a).localeCompare(nameOf(b)));
  return `<p class="eyebrow"><a href="#people">‹ ${t('People','មនុស្ស')}</a></p>${isNew ? H1('Add a person','បន្ថែមមនុស្ស') : `<h1 class="${lang==='km'?'km':''}">${esc(nameOf(p))}</h1>`}
  <form id="personForm" class="card" data-id="${isNew?'':esc(p.id)}">
    <div id="formMsg"></div>
    <div class="fields">
      <div><label class="f" for="nameKm">${t('Name in Khmer','ឈ្មោះជាភាសាខ្មែរ')}</label><input id="nameKm" type="text" lang="km" value="${esc(p.nameKm)}" maxlength="80"></div>
      <div><label class="f" for="nameEn">${t('Name in English letters','ឈ្មោះជាអក្សរឡាតាំង')}</label><input id="nameEn" type="text" value="${esc(p.nameEn)}" maxlength="80"></div>
      <div><label class="f" for="phone">${t('Phone','លេខទូរស័ព្ទ')}</label><input id="phone" type="tel" inputmode="tel" value="${esc(fmtPhone(p.phone))}" placeholder="012 345 678"></div>
      <div><label class="f" for="telegram">Telegram</label><input id="telegram" type="text" value="${esc(p.telegram)}" placeholder="@username"></div>
      <div><label class="f" for="province">${t('Province','ខេត្ត')}</label><select id="province">${opts(PROVINCES, p.province, '—')}</select></div>
      <div><label class="f" for="district">${t('District','ស្រុក/ខណ្ឌ')}</label><input id="district" type="text" value="${esc(p.district)}" maxlength="60"></div>
      <div><label class="f" for="churchId">${t('Church','ក្រុមជំនុំ')}</label><select id="churchId"><option value="">—</option>${sortedCh.map(c=>`<option value="${esc(c.id)}" ${c.id===p.churchId?'selected':''}>${esc(nameOf(c))}</option>`).join('')}</select></div>
      <div><label class="f" for="email">${t('Email (optional)','អ៊ីមែល (មិនចាំបាច់)')}</label><input id="email" type="email" value="${esc(p.email)}" maxlength="120"></div>
      <div><label class="f" for="ageBand">${t('Age','អាយុ')}</label><select id="ageBand">${opts(AGE, p.ageBand, '—')}</select></div>
      <div><label class="f" for="gender">${t('Gender','ភេទ')}</label><select id="gender">${opts([['m','Male','ប្រុស'],['f','Female','ស្រី']], p.gender, '—')}</select></div>
      <div><label class="f" for="plang">${t('Preferred language','ភាសាដែលចូលចិត្ត')}</label><select id="plang">${opts(LANGS, p.lang, '—')}</select></div>
    </div>
    <label class="f">${t('Roles','តួនាទី')}</label>
    <div class="checks">${ROLES.map(r=>`<label class="chip"><input type="checkbox" name="roles" value="${r[0]}" ${(p.roles||[]).includes(r[0])?'checked':''}>${esc(t(r[1],r[2]))}</label>`).join('')}</div>
    <label class="f">${t('Consent','ការយល់ព្រម')}</label>
    <div class="checks">
      <label class="chip"><input type="checkbox" id="consentMsg" ${p.consentMsg?'checked':''}>${t('Agreed to receive messages','យល់ព្រមទទួលសារ')}</label>
      <label class="chip ${p.ageBand==='u18'?'':'hide'}" id="guardianWrap"><input type="checkbox" id="guardianConsent" ${p.guardianConsent?'checked':''}>${t('Parent or guardian agreed (under 18)','ឪពុកម្តាយ ឬអាណាព្យាបាលយល់ព្រម (ក្រោម ១៨)')}</label>
    </div>
    <label class="f" for="notes">${t('Notes','កំណត់ចំណាំ')}</label><textarea id="notes" maxlength="2000">${esc(p.notes)}</textarea>
    <div class="row" style="margin-top:16px"><button class="btn" type="submit">${t('Save','រក្សាទុក')}</button><a class="btn ghost" href="#people">${t('Cancel','បោះបង់')}</a>
      ${!isNew && role==='admin' ? `<span class="grow"></span><button type="button" class="btn danger" data-act="del-person">${t('Delete','លុប')}</button>` : ''}</div>
    ${!isNew ? `<p class="muted" style="font-size:13px;margin-top:14px">${t('Added','បានបន្ថែម')} ${new Date(p.createdAt||0).toLocaleDateString()} · ${esc(decodeURIComponent(p.createdBy||''))} · ${t('last change','កែចុងក្រោយ')} ${new Date(p.updatedAt||0).toLocaleDateString()} · ${esc(decodeURIComponent(p.updatedBy||''))}</p>` : ''}
  </form>`;
}
async function savePerson(form){
  const val = id => form.querySelector('#'+id).value;
  const phone = normPhone(val('phone'));
  const msg = form.querySelector('#formMsg');
  if (phone === null) { msg.innerHTML = `<p class="note warn">${errMsg('bad_phone')}</p>`; return; }
  const body = { nameKm:val('nameKm'), nameEn:val('nameEn'), phone, telegram:val('telegram'), email:val('email'), province:val('province'), district:val('district'),
    churchId:val('churchId'), ageBand:val('ageBand'), gender:val('gender'), lang:val('plang'), notes:val('notes'),
    roles:[...form.querySelectorAll('input[name=roles]:checked')].map(i=>i.value), consentMsg:form.querySelector('#consentMsg').checked, guardianConsent:form.querySelector('#guardianConsent').checked };
  const id = form.dataset.id;
  try {
    const out = await api('people' + (id ? '?id=' + encodeURIComponent(id) : ''), { method:'PUT', body:JSON.stringify(body) });
    await load(); toast(t('Saved','បានរក្សាទុក')); go('people/' + out.id);
  } catch (e) {
    if (e.code === 'duplicate') { const d = people.find(x => x.id === e.data.id);
      msg.innerHTML = `<p class="note warn">${t('Someone already has this phone number:','មានគេប្រើលេខទូរស័ព្ទនេះរួចហើយ៖')} <a href="#people/${esc(e.data.id)}"><b>${esc(nameOf(d) || e.data.id)}</b></a>. ${t('Open that record instead of adding a second one.','សូមបើកកំណត់ត្រានោះ ជំនួសឲ្យការបន្ថែមថ្មី។')}</p>`; }
    else msg.innerHTML = `<p class="note warn">${errMsg(e.code)}</p>`;
    msg.scrollIntoView({ block:'center' });
  }
}

/* ---------- churches ---------- */
function vChurches(){
  const n = id => people.filter(p => p.churchId === id).length;
  const card = c => `<a href="#churches/${esc(c.id)}"><b>${esc(nameOf(c))}</b><small>${c.province?esc(label(PROVINCES,c.province)):''}${c.pastorName?' · '+esc(c.pastorName):''}</small><small>${n(c.id)} ${t('people','នាក់')}</small></a>`;
  const sorted = [...churches].sort((a,b) => nameOf(a).localeCompare(nameOf(b)));
  return `<div class="row" style="justify-content:space-between">${H1('Churches','ក្រុមជំនុំ')}<a class="btn" href="#churches/new">${t('Add a church','បន្ថែមក្រុមជំនុំ')}</a></div>
  <div class="checks" style="margin-bottom:12px" role="group"><button class="chip" data-cview="board" aria-pressed="${churchView==='board'}">${t('Board','ផ្ទាំង')}</button><button class="chip" data-cview="list" aria-pressed="${churchView==='list'}">${t('List','បញ្ជី')}</button></div>
  ${!churches.length ? `<p class="muted">${t('No churches yet.','មិនទាន់មានក្រុមជំនុំទេ។')}</p>` : churchView === 'board'
    ? `<div class="board">${STAGES.map(s => { const cs = sorted.filter(c => c.stage === s[0]); return `<div class="col"><h3><span>${esc(t(s[1],s[2]))}</span><span>${cs.length}</span></h3>${cs.map(card).join('')}</div>`; }).join('')}</div>`
    : `<ul class="list">${sorted.map(c=>`<li><a href="#churches/${esc(c.id)}"><span class="av">${esc(initials(c))}</span><span class="grow"><b>${esc(nameOf(c))}</b><small>${esc(label(STAGES,c.stage))}${c.province?' · '+esc(label(PROVINCES,c.province)):''} · ${n(c.id)} ${t('people','នាក់')}</small></span></a></li>`).join('')}</ul>`}`;
}
function vChurch(id){
  const isNew = id === 'new', c = isNew ? { stage:'invited' } : churches.find(x => x.id === id);
  if (!c) return `${H1('Not found','រកមិនឃើញ')}<a class="btn ghost" href="#churches">${t('Back to churches','ត្រឡប់ទៅក្រុមជំនុំ')}</a>`;
  const members = isNew ? [] : people.filter(p => p.churchId === c.id).sort((a,b) => nameOf(a).localeCompare(nameOf(b)));
  return `<p class="eyebrow"><a href="#churches">‹ ${t('Churches','ក្រុមជំនុំ')}</a></p>${isNew ? H1('Add a church','បន្ថែមក្រុមជំនុំ') : `<h1 class="${lang==='km'?'km':''}">${esc(nameOf(c))}</h1>`}
  <form id="churchForm" class="card" data-id="${isNew?'':esc(c.id)}">
    <div id="formMsg"></div>
    <label class="f">${t('Stage','ដំណាក់កាល')}</label>
    <div class="checks">${STAGES.map(s=>`<label class="chip"><input type="radio" name="stage" value="${s[0]}" ${c.stage===s[0]?'checked':''}>${esc(t(s[1],s[2]))}</label>`).join('')}</div>
    <div class="fields">
      <div><label class="f" for="nameKm">${t('Church name in Khmer','ឈ្មោះក្រុមជំនុំជាភាសាខ្មែរ')}</label><input id="nameKm" type="text" lang="km" value="${esc(c.nameKm)}" maxlength="120"></div>
      <div><label class="f" for="nameEn">${t('Church name in English','ឈ្មោះក្រុមជំនុំជាភាសាអង់គ្លេស')}</label><input id="nameEn" type="text" value="${esc(c.nameEn)}" maxlength="120"></div>
      <div><label class="f" for="pastorName">${t('Lead pastor','គ្រូគង្វាលនាំមុខ')}</label><input id="pastorName" type="text" value="${esc(c.pastorName)}" maxlength="80"></div>
      <div><label class="f" for="phone">${t('Church phone','លេខទូរស័ព្ទក្រុមជំនុំ')}</label><input id="phone" type="tel" value="${esc(fmtPhone(c.phone))}" placeholder="012 345 678"></div>
      <div><label class="f" for="province">${t('Province','ខេត្ត')}</label><select id="province">${opts(PROVINCES, c.province, '—')}</select></div>
      <div><label class="f" for="district">${t('District','ស្រុក/ខណ្ឌ')}</label><input id="district" type="text" value="${esc(c.district)}" maxlength="60"></div>
      <div><label class="f" for="network">${t('Network or denomination','បណ្តាញ ឬនិកាយ')}</label><input id="network" type="text" value="${esc(c.network)}" maxlength="80"></div>
      <div><label class="f" for="size">${t('Sunday attendance','ចំនួនអ្នកចូលរួមថ្ងៃអាទិត្យ')}</label><select id="size">${opts(SIZES, c.size, '—')}</select></div>
    </div>
    <label class="f" for="notes">${t('Notes','កំណត់ចំណាំ')}</label><textarea id="notes" maxlength="2000">${esc(c.notes)}</textarea>
    <div class="row" style="margin-top:16px"><button class="btn" type="submit">${t('Save','រក្សាទុក')}</button><a class="btn ghost" href="#churches">${t('Cancel','បោះបង់')}</a>
      ${!isNew && role==='admin' ? `<span class="grow"></span><button type="button" class="btn danger" data-act="del-church">${t('Delete','លុប')}</button>` : ''}</div>
  </form>
  ${isNew ? '' : `<div class="card" style="margin-top:16px"><div class="row" style="justify-content:space-between">${H2('People from this church','មនុស្សពីក្រុមជំនុំនេះ')}<a class="btn small" href="#people/new?church=${esc(c.id)}">${t('Add a person','បន្ថែមមនុស្ស')}</a></div>
    ${members.length ? `<ul class="list">${members.map(personRow).join('')}</ul>` : `<p class="muted">${t('Nobody linked yet.','មិនទាន់មាននរណាម្នាក់ភ្ជាប់ទេ។')}</p>`}</div>`}`;
}
async function saveChurch(form){
  const val = id => form.querySelector('#'+id).value, msg = form.querySelector('#formMsg');
  const phone = normPhone(val('phone'));
  if (phone === null) { msg.innerHTML = `<p class="note warn">${errMsg('bad_phone')}</p>`; return; }
  const body = { nameKm:val('nameKm'), nameEn:val('nameEn'), pastorName:val('pastorName'), phone, province:val('province'), district:val('district'),
    network:val('network'), size:val('size'), notes:val('notes'), stage:(form.querySelector('input[name=stage]:checked')||{}).value };
  try { const out = await api('churches' + (form.dataset.id ? '?id=' + encodeURIComponent(form.dataset.id) : ''), { method:'PUT', body:JSON.stringify(body) });
    await load(); toast(t('Saved','បានរក្សាទុក')); go('churches/' + out.id); }
  catch (e) { msg.innerHTML = `<p class="note warn">${errMsg(e.code)}</p>`; }
}

/* ---------- import ---------- */
const TEMPLATE_COLS = ['name_km','name_en','phone','telegram','email','province','district','gender','age_band','roles','church','notes','consent'];
function parseCSV(text){
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"') { if (text[i+1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i+1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch; }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}
const matchList = (list, v) => { const s = String(v||'').trim().toLowerCase(); if (!s) return ''; const r = list.find(x => x[0] === s || x[1].toLowerCase() === s || x[2] === String(v).trim()); return r ? r[0] : null; };
function buildImport(text){
  const rows = parseCSV(text); if (rows.length < 2) return { error:t('The file needs a header row and at least one person.','ឯកសារត្រូវមានជួរចំណងជើង និងយ៉ាងហោចណាស់មនុស្សម្នាក់។') };
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g,'_'));
  const col = k => head.indexOf(k);
  if (col('phone') < 0 || (col('name_km') < 0 && col('name_en') < 0)) return { error:t('Use the template: it needs name_km or name_en, and phone.','សូមប្រើគំរូ៖ ត្រូវមាន name_km ឬ name_en និង phone។') };
  const seen = new Map();
  const out = rows.slice(1).map((r, i) => {
    const g = k => col(k) >= 0 ? (r[col(k)] || '').trim() : '';
    const problems = [];
    const phone = normPhone(g('phone')); if (phone === null) problems.push(t('phone','ទូរស័ព្ទ'));
    if (!g('name_km') && !g('name_en')) problems.push(t('name','ឈ្មោះ'));
    const province = matchList(PROVINCES, g('province')); if (province === null) problems.push(t('province','ខេត្ត'));
    const roles = g('roles').split(/[;,|]/).map(x => matchList(ROLES, x)).filter(Boolean);
    const chName = g('church').toLowerCase(); const ch = chName ? churches.find(c => [c.nameKm,c.nameEn].some(n => (n||'').toLowerCase() === chName)) : null;
    const ageMap = { 'under 18':'u18','<18':'u18' }; const age = matchList(AGE, ageMap[g('age_band').toLowerCase()] || g('age_band'));
    const person = { nameKm:g('name_km'), nameEn:g('name_en'), phone:phone||'', telegram:g('telegram'), email:g('email'), province:province||'', district:g('district'),
      gender:{m:'m',male:'m','ប្រុស':'m',f:'f',female:'f','ស្រី':'f'}[g('gender').toLowerCase()]||'', ageBand:age||'', roles, churchId:ch?ch.id:'', notes:g('notes'),
      consentMsg:/^(y|yes|true|1|បាទ|ចាស|ព្រម)$/i.test(g('consent')) };
    let status = problems.length ? 'skip' : (phone && people.some(p => p.phone === phone)) || (phone && seen.has(phone)) ? 'merge' : 'new';
    if (phone && !seen.has(phone)) seen.set(phone, i);
    return { n:i+2, person, problems, status, churchMissing: chName && !ch ? g('church') : '' };
  });
  return { rows:out };
}
function vImport(){
  const csvTemplate = 'data:text/csv;charset=utf-8,' + encodeURIComponent('﻿' + TEMPLATE_COLS.join(',') + '\nសុខា ចាន់,Sokha Chan,012 345 678,sokhachan,,Phnom Penh,Chamkar Mon,f,18-25,attendee;volunteer,,Met at youth night,yes\n');
  let body = '';
  if (importResult) body = `<div class="note">${t(`Done: ${importResult.created} added, ${importResult.merged} merged into existing records, ${importResult.skipped} skipped.`,`រួចរាល់៖ បានបន្ថែម ${importResult.created} បញ្ចូលទៅកំណត់ត្រាដែលមានស្រាប់ ${importResult.merged} រំលង ${importResult.skipped}។`)}</div>`;
  if (importRows?.error) body += `<p class="note warn">${esc(importRows.error)}</p>`;
  else if (importRows) { const r = importRows.rows, c = s => r.filter(x => x.status === s).length;
    body += `<div class="tiles"><div class="tile"><b>${c('new')}</b><span>${t('New people','មនុស្សថ្មី')}</span></div><div class="tile"><b>${c('merge')}</b><span>${t('Same phone: fill in the existing record','លេខដូចគ្នា៖ បំពេញកំណត់ត្រាដែលមានស្រាប់')}</span></div><div class="tile" style="border-top-color:var(--red)"><b>${c('skip')}</b><span>${t('Need fixing, will be skipped','ត្រូវកែ នឹងត្រូវរំលង')}</span></div></div>
    <div class="tablewrap"><table class="prev"><tr><th>${t('Row','ជួរ')}</th><th>${t('Name','ឈ្មោះ')}</th><th>${t('Phone','ទូរស័ព្ទ')}</th><th>${t('Result','លទ្ធផល')}</th></tr>
    ${r.slice(0, 200).map(x=>`<tr><td>${x.n}</td><td>${esc(x.person.nameKm || x.person.nameEn)}</td><td>${esc(fmtPhone(x.person.phone))}</td><td>${x.status==='skip'?`<span class="pill red">${t('Fix','កែ')}: ${esc(x.problems.join(', '))}</span>`:x.status==='merge'?`<span class="pill">${t('Merge','បញ្ចូល')}</span>`:`<span class="pill">${t('New','ថ្មី')}</span>`}${x.churchMissing?` <small class="muted">${t('church not found','រកមិនឃើញក្រុមជំនុំ')}: ${esc(x.churchMissing)}</small>`:''}</td></tr>`).join('')}</table></div>
    <div class="row" style="margin-top:16px"><button class="btn" data-act="do-import" ${c('new')+c('merge')?'':'disabled'}>${t(`Import ${c('new')+c('merge')} people`,`នាំចូល ${c('new')+c('merge')} នាក់`)}</button><button class="btn ghost" data-act="reset-import">${t('Start over','ចាប់ផ្តើមម្តងទៀត')}</button></div>`; }
  return `${H1('Import a spreadsheet','នាំចូលឯកសារ')}
  <div class="card"><p>${t('For paper sign-ups and church group lists. Fill in the template in Excel or Google Sheets, save it as CSV, then upload it here. Nothing is saved until you press Import.','សម្រាប់ការចុះឈ្មោះលើក្រដាស និងបញ្ជីក្រុមពីក្រុមជំនុំ។ បំពេញគំរូក្នុង Excel ឬ Google Sheets រក្សាទុកជា CSV រួចផ្ទុកឡើងនៅទីនេះ។ គ្មានអ្វីត្រូវបានរក្សាទុក រហូតដល់អ្នកចុច នាំចូល។')}</p>
    <ul class="muted" style="font-size:14px"><li>${t('Phone numbers can be written any way: 012 345 678 or +855 12 345 678.','លេខទូរស័ព្ទអាចសរសេរតាមរបៀបណាក៏បាន៖ 012 345 678 ឬ +855 12 345 678។')}</li>
    <li>${t('If a phone number is already in the CRM, the row fills in that person’s empty fields instead of making a copy.','បើលេខទូរស័ព្ទមានក្នុង CRM រួចហើយ ជួរនោះនឹងបំពេញព័ត៌មានដែលនៅទំនេររបស់អ្នកនោះ ជំនួសឲ្យការបង្កើតច្បាប់ចម្លង។')}</li>
    <li>${t('roles: separate with ; (attendee;volunteer). church: the church name exactly as in the CRM.','roles៖ បំបែកដោយ ; (attendee;volunteer)។ church៖ ឈ្មោះក្រុមជំនុំដូចក្នុង CRM។')}</li></ul>
    <div class="row"><a class="btn ghost small" href="${csvTemplate}" download="send-cambodia-import-template.csv">${t('Download the template','ទាញយកគំរូ')}</a>
    <label class="btn small">${t('Choose CSV file','ជ្រើសឯកសារ CSV')}<input type="file" id="csvFile" accept=".csv,text/csv" class="hide"></label></div></div>
  ${body}`;
}
async function doImport(){
  const rows = importRows.rows.filter(r => r.status !== 'skip').map(r => r.person);
  const total = { created:0, merged:0, skipped:importRows.rows.filter(r => r.status === 'skip').length };
  const btn = $('[data-act="do-import"]'); if (btn) { btn.disabled = true; btn.textContent = t('Importing…','កំពុងនាំចូល…'); }
  try { for (let i = 0; i < rows.length; i += 200) { const out = await api('import', { method:'POST', body:JSON.stringify({ people:rows.slice(i, i+200) }) });
      total.created += out.created; total.merged += out.merged; total.skipped += out.skipped.length; }
    importResult = total; importRows = null; await load(); render(); }
  catch (e) { toast(errMsg(e.code)); if (btn) btn.disabled = false; }
}

/* ---------- export ---------- */
function exportCSV(){
  const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const head = ['Name (Khmer)','Name (English)','Phone','Telegram','Email','Province','District','Gender','Age','Language','Roles','Church','Consent to messages','Guardian consent','Notes','Added','Added by'];
  const rows = people.map(p => [p.nameKm,p.nameEn,p.phone,p.telegram,p.email,PROVINCES.find(x=>x[0]===p.province)?.[1]||'',p.district,p.gender,p.ageBand,p.lang,(p.roles||[]).join(';'),
    (churchOf(p.churchId)||{}).nameEn||(churchOf(p.churchId)||{}).nameKm||'',p.consentMsg?'yes':'no',p.guardianConsent?'yes':'',p.notes,new Date(p.createdAt||0).toISOString().slice(0,10),decodeURIComponent(p.createdBy||'')].map(q).join(','));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + [head.map(q).join(','), ...rows].join('\n')], { type:'text/csv;charset=utf-8' }));
  a.download = 'send-cambodia-people.csv'; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- render + events ---------- */
function render(){
  document.documentElement.lang = lang;
  const root = $('#root');
  if (!role) { root.innerHTML = gate(false); return; }
  if (!loaded) { root.innerHTML = shell(`<p class="muted">${t('Loading…','កំពុងផ្ទុក…')}</p>`); return; }
  const [r, id] = route();
  const view = r === 'people' ? (id ? vPerson(id.split('?')[0]) : vPeople()) : r === 'churches' ? (id ? vChurch(id) : vChurches()) : r === 'import' ? vImport() : vDashboard();
  root.innerHTML = shell(view);
}
document.addEventListener('submit', async e => {
  if (e.target.id === 'gateForm') { e.preventDefault();
    user = $('#gName').value.trim().slice(0, 60); code = $('#gCode').value.trim();
    try { const me = await api('me'); role = me.role; LS.set('crm_code', code); LS.set('crm_user', user); render(); await load(); render(); }
    catch (err) { $('#root').innerHTML = gate(true); }
  }
  if (e.target.id === 'personForm') { e.preventDefault(); await savePerson(e.target); }
  if (e.target.id === 'churchForm') { e.preventDefault(); await saveChurch(e.target); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'pq') { pFilter.q = e.target.value; pShow = 100; const pos = e.target.selectionStart; render(); const q = $('#pq'); q.focus(); q.setSelectionRange(pos, pos); }
});
document.addEventListener('change', async e => {
  if (e.target.id === 'prole') { pFilter.role = e.target.value; render(); }
  if (e.target.id === 'pprov') { pFilter.province = e.target.value; render(); }
  if (e.target.id === 'ageBand') $('#guardianWrap')?.classList.toggle('hide', e.target.value !== 'u18');
  if (e.target.id === 'csvFile' && e.target.files[0]) { importResult = null; importRows = buildImport(await e.target.files[0].text()); render(); }
});
document.addEventListener('click', async e => {
  const el = e.target.closest('button,a'); if (!el) return;
  if (el.dataset.lang) { lang = el.dataset.lang; LS.set('crm_lang', lang); if (role) render(); else $('#root').innerHTML = gate(false); return; }
  if (el.dataset.go) { go(el.dataset.go); return; }
  if (el.dataset.cview) { churchView = el.dataset.cview; render(); return; }
  const act = el.dataset.act; if (!act) return;
  if (act === 'signout') { if (confirm(t('Sign out on this device?','ចាកចេញនៅលើឧបករណ៍នេះ?'))) { LS.del('crm_code'); role = null; loaded = false; people = []; churches = []; render(); } }
  if (act === 'more') { pShow += 100; render(); }
  if (act === 'clear-church') { e.preventDefault(); pFilter.church = ''; render(); }
  if (act === 'export') exportCSV();
  if (act === 'reset-import') { importRows = null; importResult = null; render(); }
  if (act === 'do-import') await doImport();
  if (act === 'del-person' || act === 'del-church') {
    const form = el.closest('form'), kind = act === 'del-person' ? 'people' : 'churches';
    if (!confirm(t('Delete this record? This cannot be undone.','លុបកំណត់ត្រានេះ? មិនអាចត្រឡប់វិញបានទេ។'))) return;
    try { await api(kind + '?id=' + encodeURIComponent(form.dataset.id), { method:'DELETE' }); await load(); toast(t('Deleted','បានលុប')); go(kind); }
    catch (err) { toast(errMsg(err.code)); }
  }
});

/* ---------- start ---------- */
(async () => {
  render();
  if (!code) return;
  try { const me = await api('me'); role = me.role; render(); await load(); render(); }
  catch (e) { render(); }
})();
})();
