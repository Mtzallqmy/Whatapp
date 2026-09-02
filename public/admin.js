const $ = (id) => document.getElementById(id)
let csrfToken = null
let users = []
let providers = []
let settings = null
let waTimer = null
const routeLabels = {
  chat: ['Chat Model','المحادثة اليومية'],
  advanced: ['Advanced Model','التحليل والملفات'],
  vision: ['Vision Model','تحليل الصور'],
  search: ['Search Model','تلخيص نتائج البحث'],
  image: ['Image Model','توليد الصور']
}

function esc(value=''){return String(value).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(message,error=false){const el=$('toast');el.textContent=message;el.className='toast'+(error?' error':'');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add('hidden'),3500)}
async function api(path, options={}){
  const headers={...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}
  if(csrfToken && options.method && !['GET','HEAD'].includes(options.method)) headers['X-CSRF-Token']=csrfToken
  const res=await fetch('/api/admin'+path,{credentials:'same-origin',...options,headers})
  const json=await res.json().catch(()=>({}))
  if(res.status===401 && path!=='/login'){location.reload();throw new Error('انتهت جلسة الإدارة')}
  if(!res.ok) throw new Error(json.error||'فشل الطلب')
  return json
}
function showTab(name){
  document.querySelectorAll('.nav-item').forEach((b)=>b.classList.toggle('active',b.dataset.tab===name))
  document.querySelectorAll('.panel').forEach((p)=>p.classList.toggle('active',p.dataset.panel===name))
  const titles={dashboard:'الرئيسية',whatsapp:'واتساب',users:'المستخدمون',providers:'المزودون',settings:'النماذج والإعدادات'}
  $('pageTitle').textContent=titles[name]||'لوحة الإدارة'
  if(name==='dashboard') loadDashboard()
  if(name==='whatsapp') loadWhatsapp()
  if(name==='users') loadUsers()
  if(name==='providers') loadProviders()
  if(name==='settings') loadSettings()
}
function setWaBadge(el,status){
  el.className='status-badge '+status
  el.querySelector('span:last-child').textContent=status==='connected'?'Connected':status==='connecting'?'Connecting':'Disconnected'
}
async function boot(){
  const session=await api('/session')
  csrfToken=session.csrfToken
  $('loginView').classList.toggle('hidden',session.authenticated)
  $('appView').classList.toggle('hidden',!session.authenticated)
  if(!session.authenticated)return
  await Promise.all([loadProviders(),loadSettings(),loadUsers(),loadDashboard(),loadWhatsapp()])
  if(waTimer)clearInterval(waTimer)
  waTimer=setInterval(loadWhatsapp,4000)
}
$('loginForm').addEventListener('submit',async(e)=>{e.preventDefault();try{const data=await api('/login',{method:'POST',body:JSON.stringify({password:$('password').value})});csrfToken=data.csrfToken;location.reload()}catch(err){$('loginError').textContent=err.message;$('loginError').classList.remove('hidden')}})
$('logoutBtn').addEventListener('click',async()=>{try{await api('/logout',{method:'POST'});location.reload()}catch(e){toast(e.message,true)}})
$('nav').addEventListener('click',(e)=>{const btn=e.target.closest('[data-tab]');if(btn)showTab(btn.dataset.tab)})
document.addEventListener('click',(e)=>{const btn=e.target.closest('[data-go]');if(btn)showTab(btn.dataset.go)})

async function loadDashboard(){try{const [stats,wa]=await Promise.all([api('/dashboard'),api('/whatsapp')]);$('statUsers').textContent=stats.users;$('statRequests').textContent=stats.requestsToday;$('statTokens').textContent=(stats.inputTokensToday+stats.outputTokensToday).toLocaleString();$('statSearches').textContent=stats.searchesToday;$('statImages').textContent=stats.imagesToday;$('statFiles').textContent=stats.filesToday;$('statCost').textContent='$'+Number(stats.estimatedCostToday).toFixed(4);$('dashWa').textContent=wa.status==='connected'?'متصل':wa.status==='connecting'?'جاري الاتصال':'غير متصل';$('dashNumber').textContent=wa.connectedNumber?('+'+wa.connectedNumber):'غير مرتبط'}catch(e){toast(e.message,true)}}
async function loadWhatsapp(){try{const s=await api('/whatsapp');setWaBadge($('waStatus'),s.status);setWaBadge($('headerWaStatus'),s.status);$('waNumber').textContent=s.connectedNumber?('+'+s.connectedNumber):'—';if(s.qrDataUrl){$('qr').src=s.qrDataUrl;$('qr').classList.remove('hidden');$('qrEmpty').classList.add('hidden')}else{$('qr').classList.add('hidden');$('qr').removeAttribute('src');$('qrEmpty').classList.remove('hidden')}}catch{}}
async function waAction(path,message,confirmText){if(confirmText&&!confirm(confirmText))return;try{await api(path,{method:'POST'});toast(message);setTimeout(loadWhatsapp,500)}catch(e){toast(e.message,true)}}
$('connectWa').addEventListener('click',()=>waAction('/whatsapp/connect','بدأ الاتصال'))
$('reconnectWa').addEventListener('click',()=>waAction('/whatsapp/reconnect','جاري إعادة الاتصال'))
$('logoutWa').addEventListener('click',()=>waAction('/whatsapp/logout','تم تسجيل الخروج وحذف الجلسة','سيتم تسجيل خروج WhatsApp وحذف Session من /data/whatsapp. متابعة؟'))

function clearUserForm(){$('userForm').reset();$('userId').value='';$('userDaily').value='100';$('userEnabled').value='true';$('userRole').value='user';$('permChat').checked=true;$('permSearch').checked=true;$('permImages').checked=true;$('permFiles').checked=false;$('userFormTitle').textContent='إضافة مستخدم'}
$('clearUserForm').addEventListener('click',clearUserForm)
$('userForm').addEventListener('submit',async(e)=>{e.preventDefault();const id=$('userId').value;const payload={name:$('userName').value,phone:$('userPhone').value,role:$('userRole').value,enabled:$('userEnabled').value==='true',dailyLimit:Number($('userDaily').value),monthlyLimit:$('userMonthly').value?Number($('userMonthly').value):null,canChat:$('permChat').checked,canSearch:$('permSearch').checked,canImages:$('permImages').checked,canFiles:$('permFiles').checked};try{await api(id?'/users/'+id:'/users',{method:id?'PATCH':'POST',body:JSON.stringify(payload)});toast('تم حفظ المستخدم');clearUserForm();await loadUsers()}catch(err){toast(err.message,true)}})
async function loadUsers(){try{users=await api('/users');$('usersCount').textContent=users.length+' مستخدم';$('usersList').innerHTML=users.length?users.map((u)=>`<div class="list-item"><div class="list-main"><strong>${esc(u.name||u.phone)} <span class="pill">${esc(u.role)}</span>${u.enabled?'':' <span class="pill off">معطّل</span>'}</strong><small dir="ltr">+${esc(u.phone)}</small><small>اليوم ${u.requests_today}/${u.role==='admin'?'∞':u.daily_limit} · الشهر ${u.requests_month}/${u.role==='admin'?'∞':(u.monthly_limit??'—')} · آخر استخدام: ${u.last_used_at?new Date(u.last_used_at).toLocaleString('ar'):'—'}</small><small>Chat ${u.can_chat?'✓':'×'} · Search ${u.can_search?'✓':'×'} · Images ${u.can_images?'✓':'×'} · Files ${u.can_files?'✓':'×'}</small></div><div class="item-actions"><button class="btn secondary" data-edit-user="${u.id}">تعديل</button><button class="btn danger" data-delete-user="${u.id}">حذف</button></div></div>`).join(''):'<div class="empty">لا يوجد مستخدمون بعد.</div>'}catch(e){toast(e.message,true)}}
$('usersList').addEventListener('click',async(e)=>{const edit=e.target.closest('[data-edit-user]');const del=e.target.closest('[data-delete-user]');if(edit){const u=users.find((x)=>x.id===edit.dataset.editUser);if(!u)return;$('userId').value=u.id;$('userName').value=u.name;$('userPhone').value=u.phone;$('userRole').value=u.role;$('userEnabled').value=String(u.enabled);$('userDaily').value=u.daily_limit;$('userMonthly').value=u.monthly_limit??'';$('permChat').checked=u.can_chat;$('permSearch').checked=u.can_search;$('permImages').checked=u.can_images;$('permFiles').checked=u.can_files;$('userFormTitle').textContent='تعديل المستخدم';window.scrollTo({top:0,behavior:'smooth'})}if(del&&confirm('حذف المستخدم وكل سجل محادثته واستخدامه؟')){try{await api('/users/'+del.dataset.deleteUser,{method:'DELETE'});toast('تم حذف المستخدم');loadUsers()}catch(err){toast(err.message,true)}}})

function clearProviderForm(){$('providerForm').reset();$('providerId').value='';$('providerEnabled').value='true';$('providerDefault').value='false';$('priceInput').value='0';$('priceOutput').value='0';$('priceImage').value='0';$('priceRequest').value='0';$('providerFormTitle').textContent='إضافة مزود'}
$('clearProviderForm').addEventListener('click',clearProviderForm)
$('providerForm').addEventListener('submit',async(e)=>{e.preventDefault();const id=$('providerId').value;const payload={type:$('providerType').value,name:$('providerName').value,baseUrl:$('providerBaseUrl').value||null,enabled:$('providerEnabled').value==='true',isDefault:$('providerDefault').value==='true',providerConfig:{inputCostPer1M:Number($('priceInput').value||0),outputCostPer1M:Number($('priceOutput').value||0),imageCost:Number($('priceImage').value||0),requestCost:Number($('priceRequest').value||0),defaultChatModel:$('providerChatModel').value.trim(),defaultVisionModel:$('providerVisionModel').value.trim(),defaultImageModel:$('providerImageModel').value.trim()}};if($('providerKey').value)payload.apiKey=$('providerKey').value;try{await api(id?'/providers/'+id:'/providers',{method:id?'PATCH':'POST',body:JSON.stringify(payload)});toast('تم حفظ المزود');clearProviderForm();await loadProviders();await loadSettings()}catch(err){toast(err.message,true)}})
async function loadProviders(){try{providers=await api('/providers');$('providersList').innerHTML=providers.length?providers.map((p)=>`<div class="list-item"><div class="list-main"><strong>${esc(p.name)} <span class="pill">${esc(p.type)}</span> <span class="pill">${esc(p.category)}</span>${p.is_default?' <span class="pill">افتراضي</span>':''}${p.enabled?'':' <span class="pill off">معطّل</span>'}</strong><small dir="ltr">${esc(p.key_hint||'••••')} ${p.base_url?'· '+esc(p.base_url):''}</small><small>Input $${Number(p.config?.inputCostPer1M||0)} / 1M · Output $${Number(p.config?.outputCostPer1M||0)} / 1M · Image $${Number(p.config?.imageCost||0)} · Search $${Number(p.config?.requestCost||0)}</small></div><div class="item-actions"><button class="btn secondary" data-edit-provider="${p.id}">تعديل</button><button class="btn danger" data-delete-provider="${p.id}">حذف</button></div></div>`).join(''):'<div class="empty">أضف مزود AI ومزود بحث حسب احتياجك.</div>'}catch(e){toast(e.message,true)}}
$('providersList').addEventListener('click',async(e)=>{const edit=e.target.closest('[data-edit-provider]');const del=e.target.closest('[data-delete-provider]');if(edit){const p=providers.find((x)=>x.id===edit.dataset.editProvider);if(!p)return;$('providerId').value=p.id;$('providerType').value=p.type;$('providerName').value=p.name;$('providerKey').value='';$('providerBaseUrl').value=p.base_url||'';$('providerEnabled').value=String(p.enabled);$('providerDefault').value=String(p.is_default);$('priceInput').value=p.config?.inputCostPer1M||0;$('priceOutput').value=p.config?.outputCostPer1M||0;$('priceImage').value=p.config?.imageCost||0;$('priceRequest').value=p.config?.requestCost||0;$('providerChatModel').value=p.config?.defaultChatModel||'';$('providerVisionModel').value=p.config?.defaultVisionModel||'';$('providerImageModel').value=p.config?.defaultImageModel||'';$('providerFormTitle').textContent='تعديل المزود';window.scrollTo({top:0,behavior:'smooth'})}if(del&&confirm('حذف المزود؟ لن تُحذف سجلات الاستخدام السابقة.')){try{await api('/providers/'+del.dataset.deleteProvider,{method:'DELETE'});toast('تم حذف المزود');await loadProviders();await loadSettings()}catch(err){toast(err.message,true)}}})

function providerOptions(category,selected=''){const list=providers.filter((p)=>p.category===category&&p.enabled);return '<option value="">— تلقائي / غير محدد —</option>'+list.map((p)=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)} (${esc(p.type)})</option>`).join('')}
function renderRoutes(){if(!settings)return;const aiOptions=(selected)=>providerOptions('ai',selected);$('modelRoutes').innerHTML=Object.entries(routeLabels).map(([key,label])=>{const route=settings.modelRoutes[key]||{providerId:'',model:''};return `<div class="route-row"><div><strong>${label[0]}</strong><small>${label[1]}</small></div><select data-route-provider="${key}">${aiOptions(route.providerId)}</select><input data-route-model="${key}" dir="ltr" value="${esc(route.model||'')}" placeholder="اسم النموذج"></div>`}).join('');$('searchProviderRoute').innerHTML=providerOptions('search',settings.modelRoutes.searchProviderId)}
async function loadSettings(){try{if(!providers.length)await loadProviders();settings=await api('/settings');$('unauthorizedBehavior').value=settings.unauthorizedBehavior;$('unauthorizedMessage').value=settings.unauthorizedMessage;renderRoutes()}catch(e){toast(e.message,true)}}
$('settingsForm').addEventListener('submit',async(e)=>{e.preventDefault();const modelRoutes={};Object.keys(routeLabels).forEach((key)=>{modelRoutes[key]={providerId:document.querySelector(`[data-route-provider="${key}"]`).value,model:document.querySelector(`[data-route-model="${key}"]`).value.trim()}});modelRoutes.searchProviderId=$('searchProviderRoute').value;const payload={unauthorizedBehavior:$('unauthorizedBehavior').value,unauthorizedMessage:$('unauthorizedMessage').value.trim(),modelRoutes};try{settings=await api('/settings',{method:'PUT',body:JSON.stringify(payload)});toast('تم حفظ الإعدادات');renderRoutes()}catch(err){toast(err.message,true)}})

boot().catch((e)=>{console.error(e);toast(e.message||'تعذر تحميل اللوحة',true)})
