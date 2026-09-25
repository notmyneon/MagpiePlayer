'use strict';

const $ = id => document.getElementById(id);
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const clean = v => String(v ?? '').trim();
const fmt = (v,d=2) => Number.isFinite(Number(v)) ? Number(v).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}) : '—';
const whole = v => Number.isFinite(Number(v)) ? Math.round(Number(v)).toLocaleString() : '—';
const esc = s => clean(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const displaySeason = y => clean(y) ? `${y}-${String(Number(y)+1).slice(-2)}` : '—';
const fullSeason = y => clean(y) ? `${y}-${Number(y)+1}` : '—';
const teamNames = {ANA:'Anaheim Ducks',ARI:'Arizona Coyotes',ATL:'Atlanta Thrashers',BOS:'Boston Bruins',BUF:'Buffalo Sabres',CAR:'Carolina Hurricanes',CBJ:'Columbus Blue Jackets',CGY:'Calgary Flames',CHI:'Chicago Blackhawks',COL:'Colorado Avalanche',DAL:'Dallas Stars',DET:'Detroit Red Wings',EDM:'Edmonton Oilers',FLA:'Florida Panthers',LAK:'Los Angeles Kings',MIN:'Minnesota Wild',MTL:'Montréal Canadiens',NJD:'New Jersey Devils',NSH:'Nashville Predators',NYI:'New York Islanders',NYR:'New York Rangers',OTT:'Ottawa Senators',PHI:'Philadelphia Flyers',PIT:'Pittsburgh Penguins',SEA:'Seattle Kraken',SJS:'San Jose Sharks',STL:'St. Louis Blues',TBL:'Tampa Bay Lightning',TOR:'Toronto Maple Leafs',UTA:'Utah Mammoth',VAN:'Vancouver Canucks',VGK:'Vegas Golden Knights',WPG:'Winnipeg Jets',WSH:'Washington Capitals'};

const state = {
  rawCore: [], rows: [], byKey: new Map(), byPlayer: new Map(), seasons: [], teamsBySeason: new Map(),
  fullSeasonCache: new Map(), fullManifest: null, teamAddedKey:'', teamRemoved:new Set(), rosterSelected:{}, rosterSlotSeasons:{},
  roleConfig:null, showPlayerLogo:true
};

function parseCSV(text){
  const rows=[]; let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){ if(ch==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else q=false; } else cell+=ch; }
    else if(ch==='"') q=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
    else cell+=ch;
  }
  if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row)}
  return rows;
}
function csvObjects(text){const rows=parseCSV(text);if(!rows.length)return[];const h=rows[0];return rows.slice(1).filter(r=>r.some(x=>clean(x))).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}

function magpie(r){
  const numerator=num(r.hits)+num(r.blocked)+num(r.takeaways);
  const rate=num(r.avgtoi)>0?num(r.shotsAgainst)/num(r.avgtoi):0;
  const denominator=rate+num(r.goalsAgainst)+num(r.minors);
  return denominator>0?(numerator/denominator)*10:0;
}

function normalizeCore(r){
  return {
    season:clean(r.season),player:clean(r.player),team:clean(r.team),position:clean(r.position)==='D'?'D':'F',
    gp:num(r.gp),avgtoi:num(r.avgtoi),hits:num(r.hits),takeaways:num(r.takeaways),blocked:num(r.blocked),minors:num(r.minors),
    shotsAgainst:num(r.shots_against),goalsAgainst:num(r.goals_against),shotsFor:num(r.shots_for),goalsFor:num(r.goals_for)
  };
}

function aggregateCore(raw){
  const m=new Map();
  for(const x of raw){
    const r=normalizeCore(x); if(!r.player||!r.season)continue;
    const key=`${r.player.toLowerCase()}|${r.season}|${r.position}`;
    if(!m.has(key))m.set(key,{key,player:r.player,season:r.season,position:r.position,teams:new Set(),gp:0,totalTOI:0,hits:0,takeaways:0,blocked:0,minors:0,shotsAgainst:0,goalsAgainst:0,shotsFor:0,goalsFor:0});
    const a=m.get(key); if(r.team)a.teams.add(r.team); a.gp+=r.gp;a.totalTOI+=r.avgtoi*r.gp;a.hits+=r.hits;a.takeaways+=r.takeaways;a.blocked+=r.blocked;a.minors+=r.minors;a.shotsAgainst+=r.shotsAgainst;a.goalsAgainst+=r.goalsAgainst;a.shotsFor+=r.shotsFor;a.goalsFor+=r.goalsFor;
  }
  return [...m.values()].map(a=>{a.avgtoi=a.gp?a.totalTOI/a.gp:0;a.team=[...a.teams].join(', ');a.score=magpie(a);delete a.teams;return a;});
}

async function init(){
  try{
    const manifestResp=await fetch('data/manifest.json',{cache:'no-store'});
    if(!manifestResp.ok)throw new Error(`manifest.json ${manifestResp.status}`);
    state.fullManifest=await manifestResp.json();
    const coreFiles=['2008','2009','2010','2011','2012','2013','2014','2015','2016','2017','2018','2019','2020','2021a','2021b','2022','2023','2024','2025'];
    const coreResponses=await Promise.all(coreFiles.map(name=>fetch(`data/core/${name}.csv`,{cache:'no-store'})));
    const bad=coreResponses.find(r=>!r.ok); if(bad)throw new Error(`Core season file failed: ${bad.status}`);
    const coreTexts=await Promise.all(coreResponses.map(r=>r.text()));
    state.rawCore=coreTexts.flatMap(csvObjects); state.rows=aggregateCore(state.rawCore);
    buildIndexes(); populateAllControls(); bindEvents(); renderAll();
    $('dataStatus').className='data-status ready'; $('dataStatus').lastElementChild.textContent=`${state.rows.length.toLocaleString()} player seasons ready`;
  }catch(err){console.error(err);$('dataStatus').className='data-status error';$('dataStatus').lastElementChild.textContent='Data failed to load';}
}

function buildIndexes(){
  state.seasons=[...new Set(state.rows.map(r=>r.season))].sort((a,b)=>num(b)-num(a));
  for(const r of state.rows){state.byKey.set(r.key,r);if(!state.byPlayer.has(r.player))state.byPlayer.set(r.player,[]);state.byPlayer.get(r.player).push(r);}
  for(const arr of state.byPlayer.values())arr.sort((a,b)=>num(a.season)-num(b.season));
  for(const s of state.seasons){const teams=new Set();state.rows.filter(r=>r.season===s).forEach(r=>r.team.split(',').map(clean).filter(Boolean).forEach(t=>teams.add(t)));state.teamsBySeason.set(s,[...teams].sort());}
}
function opt(v,label=v){return `<option value="${esc(v)}">${esc(label)}</option>`}
function playerNames(){return [...state.byPlayer.keys()].sort((a,b)=>a.localeCompare(b))}
function setOptions(el,html,preferred){if(!el)return;el.innerHTML=html;if(preferred&&[...el.options].some(o=>o.value===preferred))el.value=preferred;}
function populatePlayerSelect(el,preferred){setOptions(el,playerNames().map(p=>opt(p)).join(''),preferred||playerNames()[0]);}
function seasonsForPlayer(p){return (state.byPlayer.get(p)||[]).map(r=>r.season).sort((a,b)=>num(b)-num(a));}
function nhlLogoTeam(team){const parts=clean(team).split(',').map(clean).filter(Boolean);const raw=(parts[parts.length-1]||'').toUpperCase();return ({'L.A':'LAK','T.B':'TBL','N.J':'NJD','S.J':'SJS',LA:'LAK',TB:'TBL',NJ:'NJD',SJ:'SJS'})[raw]||raw}
function teamName(team,season){const code=nhlLogoTeam(team);return code==='UTA'&&Number(season)===2024?'Utah Hockey Club':teamNames[code]||code}
function setTeamLogo(img,team,enabled=true){if(!img)return;const code=nhlLogoTeam(team);if(!enabled||!code){img.classList.add('hidden');img.removeAttribute('src');img.alt='';return}img.alt=`${teamName(code)} logo`;img.onerror=()=>img.classList.add('hidden');img.src=`https://assets.nhle.com/logos/nhl/svg/${encodeURIComponent(code)}_light.svg`;img.classList.remove('hidden')}
function applyMagpieLogos(){let saved='';try{saved=localStorage.getItem('magpie-score-player-magpie-logo-v1')||''}catch(_){}const src=/^data:image\/(png|jpeg|webp|svg\+xml);base64,/i.test(saved)?saved:'assets/magpie-hockey.png';document.querySelectorAll('.magpie-logo').forEach(img=>{img.src=src;img.onerror=()=>{if(img.src!==new URL('assets/magpie-hockey.png',location.href).href)img.src='assets/magpie-hockey.png'}})}
function updatePlayerLogo(r){
  const toggle=$('showPlayerLogo');if(!toggle)return;
  state.showPlayerLogo=toggle.checked;
  try{localStorage.setItem('magpieShowPlayerLogo',state.showPlayerLogo?'1':'0')}catch(_){}
  for(const id of ['playerTeamLogo','timelineTeamLogo'])setTeamLogo($(id),r?.team,state.showPlayerLogo);
}

function populateAllControls(){
  const names=playerNames(); const first=names.find(x=>x==='Cale Makar')||names[0];
  populatePlayerSelect($('playerSelect'),first); syncPlayerSeason();
  try{state.showPlayerLogo=localStorage.getItem('magpieShowPlayerLogo')!=='0'}catch(_){state.showPlayerLogo=true}
  if($('showPlayerLogo'))$('showPlayerLogo').checked=state.showPlayerLogo;
  populatePlayerSelect($('comparePlayerA'),first); populatePlayerSelect($('comparePlayerB'),names.find(x=>x==='Brady Tkachuk')||names[1]); syncCompareSeasons('A');syncCompareSeasons('B');
  const yearHtml=state.seasons.map(s=>opt(s,displaySeason(s))).join(''); setOptions($('teamSeason'),yearHtml,state.seasons[0]); setOptions($('rosterSeason'),yearHtml,state.seasons[0]);
  syncTeamList(); syncRosterTeamList();
  const logoTeams=[...new Set([...state.teamsBySeason.values()].flat().map(nhlLogoTeam))].filter(Boolean).sort((a,b)=>teamName(a).localeCompare(teamName(b)));
  setOptions($('rosterCardTeamLogo'),'<option value="">No team logo</option>'+logoTeams.map(t=>opt(t,teamName(t))).join(''),'');
  try{$('rosterCustomTitle').value=localStorage.getItem('magpieRosterTitle')||'Projected Lineup';$('rosterCardTeamLogo').value=localStorage.getItem('magpieRosterLogo')||''}catch(_){}
  applyMagpieLogos();buildRoleSettings(); buildLineupEditor();
}

function bindEvents(){
  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  $('playerSearch').addEventListener('input',()=>{const q=clean($('playerSearch').value).toLowerCase();const names=playerNames().filter(p=>p.toLowerCase().includes(q));const prev=$('playerSelect').value;setOptions($('playerSelect'),names.slice(0,250).map(n=>opt(n)).join(''),names.includes(prev)?prev:names[0]);syncPlayerSeason();renderPlayer();});
  $('playerSelect').addEventListener('change',()=>{syncPlayerSeason();renderPlayer();});$('playerSeason').addEventListener('change',renderPlayer);$('timelineMetric').addEventListener('change',renderTimeline);
  $('showPlayerLogo').addEventListener('change',()=>updatePlayerLogo(currentPlayerRow()));
  $('comparePlayerA').addEventListener('change',()=>{syncCompareSeasons('A');renderCompare()});$('comparePlayerB').addEventListener('change',()=>{syncCompareSeasons('B');renderCompare()});$('compareSeasonA').addEventListener('change',renderCompare);$('compareSeasonB').addEventListener('change',renderCompare);
  $('showCompareTimeline').addEventListener('change',renderCompareTimeline);$('compareTimelineMetric').addEventListener('change',renderCompareTimeline);
  $('teamSeason').addEventListener('change',()=>{state.teamAddedKey='';state.teamRemoved.clear();syncTeamList();renderTeamCard()});$('teamSelect').addEventListener('change',()=>{state.teamAddedKey='';state.teamRemoved.clear();renderTeamCard()});['teamMinGP','teamPosition'].forEach(id=>$(id).addEventListener('input',renderTeamCard));['teamHighlightA','teamHighlightB'].forEach(id=>$(id).addEventListener('change',renderTeamTable));$('teamAddSearch').addEventListener('input',renderTeamAdjusters);$('teamRemoveSearch').addEventListener('input',renderTeamAdjusters);$('resetTeamChanges').addEventListener('click',()=>{state.teamAddedKey='';state.teamRemoved.clear();renderTeamCard()});
  $('rosterSeason').addEventListener('change',()=>{state.rosterSelected={};state.rosterSlotSeasons={};syncRosterTeamList();buildLineupEditor();renderRosterCard()});$('rosterTeam').addEventListener('change',()=>{buildLineupEditor();renderRosterCard()});$('rosterMinGP').addEventListener('input',()=>{buildLineupEditor();renderRosterCard()});$('clearRosterBtn').addEventListener('click',()=>{state.rosterSelected={};state.rosterSlotSeasons={};buildLineupEditor();renderRosterCard()});$('autoTeamBtn').addEventListener('click',autoLoadTeam);$('autoBestBtn').addEventListener('click',autoFillLineup);$('resetRoleBtn').addEventListener('click',()=>{state.roleConfig=defaultRoleConfig();buildRoleSettings();buildLineupEditor();renderRosterCard()});
  $('rosterCustomTitle').addEventListener('input',()=>{try{localStorage.setItem('magpieRosterTitle',$('rosterCustomTitle').value)}catch(_){}renderRosterCard()});
  $('rosterCardTeamLogo').addEventListener('change',()=>{try{localStorage.setItem('magpieRosterLogo',$('rosterCardTeamLogo').value)}catch(_){}renderRosterCard()});
  window.addEventListener('hashchange',()=>{const v=location.hash.slice(1);if(['players','compare','teams','roster'].includes(v))switchView(v,false)});
}
function switchView(v,setHash=true){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.dataset.viewPanel===v));document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.view===v));if(setHash)history.replaceState(null,'',`#${v}`);if(v==='players')renderPlayer();if(v==='compare')renderCompare();if(v==='teams')renderTeamCard();if(v==='roster')renderRosterCard();}
function renderAll(){const hash=location.hash.slice(1);if(['players','compare','teams','roster'].includes(hash))switchView(hash,false);else switchView('players',false);renderPlayer();renderCompare();renderTeamCard();renderRosterCard();}

function syncPlayerSeason(){const p=$('playerSelect').value;const seasons=seasonsForPlayer(p);setOptions($('playerSeason'),seasons.map(s=>opt(s,displaySeason(s))).join(''),seasons[0]);}
function currentPlayerRow(){const p=$('playerSelect').value,s=$('playerSeason').value;return (state.byPlayer.get(p)||[]).find(r=>r.season===s)||null}
function poolForRow(r){return state.rows.filter(x=>x.season===r.season&&x.position===r.position)}
function rankOf(r,field){const pool=poolForRow(r).slice().sort((a,b)=>num(b[field])-num(a[field]));const idx=pool.findIndex(x=>x.key===r.key);return idx>=0?{rank:idx+1,n:pool.length}:null}
function rankText(r,field){const x=rankOf(r,field);return x?`#${x.rank} of ${x.n} ${r.position==='D'?'D':'F'}`:'—'}
function renderPlayer(){
  const r=currentPlayerRow();if(!r)return;
  $('playerCardSeason').textContent=displaySeason(r.season);$('playerCardName').textContent=r.player;$('playerCardMeta').textContent=`${r.position==='D'?'Defence':'Forward'} • ${whole(r.gp)} GP`;updatePlayerLogo(r);$('playerScore').textContent=fmt(r.score);$('playerRank').textContent=rankText(r,'score');$('playerHits').textContent=whole(r.hits);$('playerBlocks').textContent=whole(r.blocked);$('playerTakeaways').textContent=whole(r.takeaways);$('playerHitsRank').textContent=rankText(r,'hits');$('playerBlocksRank').textContent=rankText(r,'blocked');$('playerTakeawaysRank').textContent=rankText(r,'takeaways');$('playerGF').textContent=whole(r.goalsFor);$('playerSF').textContent=whole(r.shotsFor);$('playerGA').textContent=whole(r.goalsAgainst);$('playerSA').textContent=whole(r.shotsAgainst);$('playerTOI').textContent=fmt(r.avgtoi,1);
  renderTimeline();
}
function metricVal(r,m){return m==='score'?r.score:num(r[m])}
function metricLabel(m){return ({score:'Magpie Score',hits:'Hits',blocked:'Blocked Shots',takeaways:'Takeaways'})[m]||m}
function svg(tag,attrs={}){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));return e}
function renderTimeline(){
  const p=$('playerSelect').value,m=$('timelineMetric').value,arr=(state.byPlayer.get(p)||[]).slice().sort((a,b)=>num(a.season)-num(b.season)),chart=$('timelineChart');chart.innerHTML='';$('timelineTitle').textContent=`${p} • ${metricLabel(m)}`;
  if(!arr.length){chart.append($('emptyChartTemplate').content.cloneNode(true));return}
  const pts=arr.map(r=>({r,v:metricVal(r,m),avg:average(state.rows.filter(x=>x.season===r.season&&x.position===r.position).map(x=>metricVal(x,m)))}));let max=Math.max(...pts.flatMap(x=>[x.v,x.avg]),1)*1.12;let min=0;const W=1000,H=420,L=70,R=25,T=28,B=55;const x=i=>L+(pts.length===1?(W-L-R)/2:i*(W-L-R)/(pts.length-1));const y=v=>T+(max-v)/(max-min)*(H-T-B);
  for(let i=0;i<=4;i++){const yy=T+i*(H-T-B)/4;chart.append(svg('line',{x1:L,y1:yy,x2:W-R,y2:yy,class:'chart-grid'}));const tx=svg('text',{x:L-12,y:yy+4,'text-anchor':'end',class:'chart-axis'});tx.textContent=fmt(max-(max-min)*i/4,m==='score'?1:0);chart.append(tx)}
  pts.forEach((pt,i)=>{const tx=svg('text',{x:x(i),y:H-22,'text-anchor':'middle',class:'chart-axis'});tx.textContent=pt.r.season;chart.append(tx)});
  const pathFor=key=>pts.map((pt,i)=>`${i?'L':'M'} ${x(i)} ${y(pt[key])}`).join(' ');chart.append(svg('path',{d:pathFor('avg'),class:'chart-average'}));chart.append(svg('path',{d:pathFor('v'),class:'chart-player'}));pts.forEach((pt,i)=>{const c=svg('circle',{cx:x(i),cy:y(pt.v),r:5,class:'chart-dot'});const title=svg('title');title.textContent=`${displaySeason(pt.r.season)}: ${fmt(pt.v,m==='score'?2:0)}`;c.append(title);chart.append(c)});
  const best=pts.reduce((a,b)=>b.v>a.v?b:a,pts[0]),latest=pts[pts.length-1];$('timelineSummary').innerHTML=`<span class="summary-pill">Seasons <strong>${pts.length}</strong></span><span class="summary-pill">Peak <strong>${fmt(best.v,m==='score'?2:0)}</strong> (${displaySeason(best.r.season)})</span><span class="summary-pill">Latest <strong>${fmt(latest.v,m==='score'?2:0)}</strong></span>`;
}
function average(a){return a.length?a.reduce((s,v)=>s+num(v),0)/a.length:0}


function syncCompareSeasons(side){const p=$(`comparePlayer${side}`).value;const seasons=seasonsForPlayer(p);setOptions($(`compareSeason${side}`),seasons.map(s=>opt(s,displaySeason(s))).join(''),seasons[0])}
function compareRow(side){const p=$(`comparePlayer${side}`).value,s=$(`compareSeason${side}`).value;return (state.byPlayer.get(p)||[]).find(r=>r.season===s)||null}
function percentile(r,field){const pool=poolForRow(r).map(x=>num(x[field])).sort((a,b)=>a-b);if(!pool.length)return 0;const v=num(r[field]);let below=0,equal=0;for(const x of pool){if(x<v)below++;else if(x===v)equal++}return ((below+.5*equal)/pool.length)*100}
function renderCompare(){const a=compareRow('A'),b=compareRow('B');if(!a||!b)return;$('compareNameA').textContent=`${a.player} • ${displaySeason(a.season)}`;$('compareNameB').textContent=`${b.player} • ${displaySeason(b.season)}`;setTeamLogo($('compareLogoA'),a.team);setTeamLogo($('compareLogoB'),b.team);const metrics=[['Games Played','gp',false,0],['Magpie Score','score',true,2],['Hits','hits',true,0],['Blocked Shots','blocked',true,0],['Takeaways','takeaways',true,0],['Goals For','goalsFor',true,0],['Shots For','shotsFor',true,0],['Goals Against','goalsAgainst',false,0],['Shots Against','shotsAgainst',false,0],['Avg TOI','avgtoi',true,1]];$('comparisonBody').innerHTML=metrics.map(([label,key,higher,d])=>{const av=num(a[key]),bv=num(b[key]),leadA=higher?av>bv:av<bv,leadB=higher?bv>av:bv<av;const pa=key==='gp'?'':`${Math.round(percentile(a,key))}th pct`;const pb=key==='gp'?'':`${Math.round(percentile(b,key))}th pct`;return `<div class="compare-row"><div class="compare-value ${leadA?'lead':''}">${fmt(av,d)} <span class="percentile">${pa}</span></div><div class="compare-label">${esc(label)}</div><div class="compare-value right ${leadB?'lead':''}"><span class="percentile">${pb}</span> ${fmt(bv,d)}</div></div>`}).join('');renderCompareTimeline()}

function renderCompareTimeline(){const card=$('compareTimelineCard');card.classList.toggle('hidden',!$('showCompareTimeline').checked);if(!$('showCompareTimeline').checked)return;const a=compareRow('A'),b=compareRow('B');if(!a||!b)return;const metric=$('compareTimelineMetric').value,years=[...new Set([...(state.byPlayer.get(a.player)||[]),...(state.byPlayer.get(b.player)||[])].map(r=>Number(r.season)))].sort((x,y)=>x-y);const chart=$('compareTimelineChart');chart.innerHTML='';$('compareTimelineTitle').textContent=metricLabel(metric);$('compareLegendA').textContent=a.player;$('compareLegendB').textContent=b.player;const records=[a,b].map(r=>new Map((state.byPlayer.get(r.player)||[]).map(x=>[Number(x.season),metricVal(x,metric)])));const values=records.flatMap(m=>[...m.values()]);const max=Math.max(1,...values)*1.12,W=1000,H=330,L=62,R=25,T=25,B=48;const x=i=>L+(years.length===1?(W-L-R)/2:i*(W-L-R)/(years.length-1)),y=v=>T+(max-v)/max*(H-T-B);for(let i=0;i<=4;i++){const yy=T+i*(H-T-B)/4;chart.append(svg('line',{x1:L,y1:yy,x2:W-R,y2:yy,class:'chart-grid'}));const tx=svg('text',{x:L-10,y:yy+4,'text-anchor':'end',class:'chart-axis'});tx.textContent=fmt(max*(1-i/4),metric==='score'?1:0);chart.append(tx)}years.forEach((year,i)=>{const tx=svg('text',{x:x(i),y:H-18,'text-anchor':'middle',class:'chart-axis'});tx.textContent=year;chart.append(tx)});records.forEach((m,side)=>{let path='';years.forEach((year,i)=>{if(m.has(year)){path+=`${path&&m.has(years[i-1])?'L':'M'} ${x(i)} ${y(m.get(year))} `}});chart.append(svg('path',{d:path,class:side?'chart-compare-b':'chart-player'}));years.forEach((year,i)=>{if(!m.has(year))return;const dot=svg('circle',{cx:x(i),cy:y(m.get(year)),r:4,class:side?'chart-compare-dot-b':'chart-dot'});const title=svg('title');title.textContent=`${side?b.player:a.player} ${displaySeason(year)}: ${fmt(m.get(year),metric==='score'?2:0)}`;dot.append(title);chart.append(dot)})})}

function syncTeamList(){const s=$('teamSeason').value,teams=state.teamsBySeason.get(s)||[];setOptions($('teamSelect'),teams.map(t=>opt(t,teamName(t,s))).join(''),teams[0]);}
function teamContextRows(includeChanges=true){const s=$('teamSeason').value,t=$('teamSelect').value,minGP=num($('teamMinGP').value),pos=$('teamPosition').value;let rows=state.rows.filter(r=>r.season===s&&r.gp>=minGP&&(pos==='both'||r.position===pos)&&r.team.split(',').map(clean).includes(t));if(includeChanges){rows=rows.filter(r=>!state.teamRemoved.has(r.player));if(state.teamAddedKey){const add=state.byKey.get(state.teamAddedKey);if(add&&add.season===s&&add.gp>=minGP&&(pos==='both'||add.position===pos)&&!rows.some(r=>r.key===add.key))rows.push({...add,simAdded:true});}}return rows}
function renderTeamCard(){const rows=teamContextRows(true);const s=$('teamSeason').value,t=$('teamSelect').value;$('teamCardName').textContent=t?`${fullSeason(s)} ${teamName(t,s)}`:'Select a team';setTeamLogo($('teamCardLogo'),t);const notes=[];if(state.teamAddedKey)notes.push('1 simulated addition');if(state.teamRemoved.size)notes.push(`${state.teamRemoved.size} removed`);$('teamCardSub').textContent=`Minimum ${whole(num($('teamMinGP').value))} GP${notes.length?' • '+notes.join(' • '):''}`;$('teamAvgScore').textContent=rows.length?fmt(average(rows.map(r=>r.score))):'—';renderTeamHighlights();renderTeamTable();renderTeamAdjusters()}
function renderTeamHighlights(){const rows=teamContextRows(true).slice().sort((a,b)=>b.score-a.score);for(const id of ['teamHighlightA','teamHighlightB']){const prev=$(id).value;setOptions($(id),'<option value="">None</option>'+rows.map(r=>opt(r.key,r.player)).join(''),rows.some(r=>r.key===prev)?prev:'')}}
function renderTeamTable(){const rows=teamContextRows(true).slice().sort((a,b)=>b.score-a.score||b.gp-a.gp);const hi=new Set([$ ('teamHighlightA').value,$('teamHighlightB').value].filter(Boolean));$('teamTable').innerHTML=rows.map((r,i)=>`<div class="team-row ${hi.has(r.key)?'highlight':''} ${r.simAdded?'added':''}"><span class="rank">${i+1}</span><span class="player-name">${esc(r.player)}${r.simAdded?'<b class="tag">Added</b>':''}</span><span>${r.position}</span><span>${whole(r.gp)}</span><span>${whole(r.hits)}</span><span>${whole(r.blocked)}</span><span>${whole(r.takeaways)}</span><span class="score">${fmt(r.score)}</span></div>`).join('')||'<div class="team-row"><span></span><span>No players match the filters.</span></div>'}
function renderTeamAdjusters(){const s=$('teamSeason').value,t=$('teamSelect').value,pos=$('teamPosition').value,minGP=num($('teamMinGP').value);const addq=clean($('teamAddSearch').value).toLowerCase();const outside=state.rows.filter(r=>r.season===s&&r.gp>=minGP&&(pos==='both'||r.position===pos)&&!r.team.split(',').map(clean).includes(t)&&(!addq||r.player.toLowerCase().includes(addq))).sort((a,b)=>a.player.localeCompare(b.player)).slice(0,18);$('teamAddResults').innerHTML=outside.map(r=>`<button class="picker-btn" data-add="${esc(r.key)}"><strong>${esc(r.player)}</strong><small>${esc(r.team)} • ${r.position} • ${whole(r.gp)} GP</small></button>`).join('');$('teamAddResults').querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>{state.teamAddedKey=b.dataset.add;renderTeamCard()}));const chip=$('teamAddedChip');if(state.teamAddedKey&&state.byKey.has(state.teamAddedKey)){const r=state.byKey.get(state.teamAddedKey);chip.classList.remove('hidden');chip.innerHTML=`Added: <strong>${esc(r.player)}</strong> <small>(${esc(r.team)})</small>`;chip.onclick=()=>{state.teamAddedKey='';renderTeamCard()}}else chip.classList.add('hidden');const remq=clean($('teamRemoveSearch').value).toLowerCase();const current=state.rows.filter(r=>r.season===s&&r.gp>=minGP&&(pos==='both'||r.position===pos)&&r.team.split(',').map(clean).includes(t)&&(!remq||r.player.toLowerCase().includes(remq))).sort((a,b)=>a.player.localeCompare(b.player)).slice(0,24);$('teamRemoveResults').innerHTML=current.map(r=>`<button class="remove-btn ${state.teamRemoved.has(r.player)?'removed':''}" data-remove="${esc(r.player)}"><strong>${state.teamRemoved.has(r.player)?'Removed: ':''}${esc(r.player)}</strong><small>${state.teamRemoved.has(r.player)?'Click to add back':`${r.position} • ${whole(r.gp)} GP`}</small></button>`).join('');$('teamRemoveResults').querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{const p=b.dataset.remove;state.teamRemoved.has(p)?state.teamRemoved.delete(p):state.teamRemoved.add(p);renderTeamCard()}))}

const roles=[
  {key:'f1',label:'Line 1 Forwards',position:'F',count:3},{key:'f2',label:'Line 2 Forwards',position:'F',count:3},{key:'f3',label:'Line 3 Forwards',position:'F',count:3},{key:'f4',label:'Line 4 Forwards',position:'F',count:3},{key:'d1',label:'Defence Pair 1',position:'D',count:2},{key:'d2',label:'Defence Pair 2',position:'D',count:2},{key:'d3',label:'Defence Pair 3',position:'D',count:2}
];
function defaultRoleConfig(){return {f1:{min:16,max:Infinity,toi:21},f2:{min:12,max:22,toi:17},f3:{min:9,max:18,toi:13},f4:{min:0,max:15,toi:9},d1:{min:19,max:Infinity,toi:25},d2:{min:15,max:26,toi:20},d3:{min:0,max:21,toi:15}}}
function buildRoleSettings(){if(!state.roleConfig)state.roleConfig=defaultRoleConfig();$('roleSettingsGrid').innerHTML=roles.map(role=>{const c=state.roleConfig[role.key];return `<div class="role-setting" data-role="${role.key}"><strong>${role.label}</strong><div class="range-inputs"><input data-field="min" type="number" step="0.1" value="${c.min}"><span>to</span><input data-field="max" type="text" value="${Number.isFinite(c.max)?c.max:'∞'}"></div><label class="assigned">Assigned TOI<input data-field="toi" type="number" step="0.1" value="${c.toi}"></label></div>`}).join('');$('roleSettingsGrid').querySelectorAll('input').forEach(inp=>inp.addEventListener('input',()=>{const wrap=inp.closest('[data-role]'),k=wrap.dataset.role,f=inp.dataset.field;let v=clean(inp.value);state.roleConfig[k][f]=(f==='max'&&['∞','inf','infinity',''].includes(v.toLowerCase()))?Infinity:num(v);buildLineupEditor();renderRosterCard()}))}
function syncRosterTeamList(){const s=$('rosterSeason').value,teams=state.teamsBySeason.get(s)||[];const prev=$('rosterTeam').value;setOptions($('rosterTeam'),'<option value="">All teams</option>'+teams.map(t=>opt(t,teamName(t,s))).join(''),teams.includes(prev)?prev:'')}
function slotId(roleKey,i){return `${roleKey}-${i}`}
function rosterCandidates(role,season=$('rosterSeason').value){const t=$('rosterTeam').value,minGP=num($('rosterMinGP').value),c=state.roleConfig[role.key];return state.rows.filter(r=>r.season===season&&r.position===role.position&&r.gp>=minGP&&(!t||r.team.split(',').map(clean).includes(t))&&r.avgtoi>=c.min&&r.avgtoi<=c.max).sort((a,b)=>b.score-a.score||b.avgtoi-a.avgtoi)}
function slotSeason(id){return state.rosterSlotSeasons[id]||$('rosterSeason').value}
function buildLineupEditor(){if(!state.roleConfig)state.roleConfig=defaultRoleConfig();$('lineupEditor').innerHTML=roles.map(role=>{const slots=Array.from({length:role.count},(_,i)=>{const id=slotId(role.key,i),season=slotSeason(id),cand=rosterCandidates(role,season),cur=state.rosterSelected[id]||'';if(cur&&!cand.some(r=>r.key===cur))state.rosterSelected[id]='';return `<div class="slot"><div class="slot-fields"><label>${role.position==='F'?'Forward':'Defence'} ${i+1}<select data-slot="${id}" data-role="${role.key}"><option value="">Select player</option>${cand.map(r=>`<option value="${esc(r.key)}" ${r.key===cur?'selected':''}>${esc(r.player)} • ${fmt(r.avgtoi,1)} TOI • ${fmt(r.score)}</option>`).join('')}</select></label><label>Season<select data-slot-season="${id}">${state.seasons.map(s=>`<option value="${s}" ${s===season?'selected':''}>${displaySeason(s)}</option>`).join('')}</select></label></div><div class="slot-meta">${cand.length} eligible • ${fmt(state.roleConfig[role.key].toi,1)} assigned TOI</div></div>`}).join('');return `<div class="line-group"><div class="line-group-title"><strong>${role.label}</strong><span>${state.roleConfig[role.key].min}–${Number.isFinite(state.roleConfig[role.key].max)?state.roleConfig[role.key].max:'∞'} pool TOI</span></div><div class="slot-grid ${role.position==='D'?'defence':''}">${slots}</div></div>`}).join('');$('lineupEditor').querySelectorAll('select[data-slot]').forEach(s=>s.addEventListener('change',()=>{state.rosterSelected[s.dataset.slot]=s.value;enforceUnique(s.dataset.slot,s.value);buildLineupEditor();renderRosterCard()}));$('lineupEditor').querySelectorAll('select[data-slot-season]').forEach(s=>s.addEventListener('change',()=>{const id=s.dataset.slotSeason,old=state.byKey.get(state.rosterSelected[id]);state.rosterSlotSeasons[id]=s.value;const role=roles.find(r=>id.startsWith(r.key+'-'));const replacement=old&&rosterCandidates(role,s.value).find(r=>r.player===old.player);state.rosterSelected[id]=replacement?.key||'';enforceUnique(id,state.rosterSelected[id]);buildLineupEditor();renderRosterCard()}));updateSelectedCount()}
function enforceUnique(changed,key){const chosen=state.byKey.get(key);if(!chosen)return;for(const [slot,v] of Object.entries(state.rosterSelected))if(slot!==changed&&state.byKey.get(v)?.player===chosen.player)state.rosterSelected[slot]=''}
function updateSelectedCount(){const n=Object.values(state.rosterSelected).filter(Boolean).length;$('selectedCount').textContent=`${n} / 18`}
function getSelectedEntries(){const out=[];for(const role of roles)for(let i=0;i<role.count;i++){const id=slotId(role.key,i),key=state.rosterSelected[id],row=state.byKey.get(key);if(row)out.push({slot:id,role,row})}return out}
function projectedPlayer(e){const r=e.row,gp=r.gp||1,actual=r.avgtoi||1,assigned=state.roleConfig[e.role.key].toi,k=assigned/actual;return {assigned,hits:(r.hits/gp)*k,blocked:(r.blocked/gp)*k,takeaways:(r.takeaways/gp)*k,minors:(r.minors/gp)*k,ga:(r.goalsAgainst/gp)*k,sa:(r.shotsAgainst/gp)*k,gf:(r.goalsFor/gp)*k,sf:(r.shotsFor/gp)*k}}
function rosterTotals(){const entries=getSelectedEntries(),t={entries,hits:0,blocked:0,takeaways:0,minors:0,ga:0,sa:0,gf:0,sf:0,assigned:0,weightedScore:0};entries.forEach(e=>{const p=projectedPlayer(e);for(const k of ['hits','blocked','takeaways','minors','ga','sa','gf','sf','assigned'])t[k]+=p[k];t.weightedScore+=e.row.score*p.assigned});t.score=t.assigned?t.weightedScore/t.assigned:0;for(const k of ['gf','sf','ga','sa'])t[k]=t.assigned?t[k]*60/t.assigned:0;return t}
function renderRosterCard(){updateSelectedCount();const t=rosterTotals(),s=$('rosterSeason').value,mixed=t.entries.some(e=>e.row.season!==s);$('rosterCardSeason').textContent=`${displaySeason(s)}${mixed?' • MIXED SEASONS':''}`;$('rosterCardTitle').textContent=clean($('rosterCustomTitle').value)||'Projected Lineup';setTeamLogo($('rosterCardLogo'),$('rosterCardTeamLogo').value);$('rosterScore').textContent=fmt(t.score);$('rosterHits').textContent=fmt(t.hits,1);$('rosterBlocks').textContent=fmt(t.blocked,1);$('rosterTakeaways').textContent=fmt(t.takeaways,1);$('rosterGF').textContent=fmt(t.gf,1);$('rosterSF').textContent=fmt(t.sf,1);$('rosterGA').textContent=fmt(t.ga,1);$('rosterSA').textContent=fmt(t.sa,1);$('rosterCardLines').innerHTML=roles.map(role=>{const players=Array.from({length:role.count},(_,i)=>{const row=state.byKey.get(state.rosterSelected[slotId(role.key,i)]);return row?`<div class="roster-player"><strong>${esc(row.player)}</strong><small>${displaySeason(row.season)} • ${fmt(state.roleConfig[role.key].toi,1)} min • ${fmt(row.score)} Magpie</small></div>`:'<div class="roster-player"><strong>Open</strong><small>Select player</small></div>'}).join('');return `<div class="roster-line"><div class="roster-line-label">${esc(role.position==='F'?role.label.replace(' Forwards',''):role.label)}</div><div class="roster-players ${role.position==='D'?'defence':''}">${players}</div></div>`}).join('')}
function autoLoadTeam(){const team=$('rosterTeam').value;if(!team){alert('Choose a team first.');return}state.rosterSelected={};state.rosterSlotSeasons={};const used=new Set();for(const role of roles){const cand=rosterCandidates(role).filter(r=>!used.has(r.player)).sort((a,b)=>b.avgtoi-a.avgtoi||b.score-a.score);for(let i=0;i<role.count;i++){const r=cand[i];if(r){state.rosterSelected[slotId(role.key,i)]=r.key;used.add(r.player)}}}$('rosterCardTeamLogo').value=nhlLogoTeam(team);buildLineupEditor();renderRosterCard()}
function autoFillLineup(){const metric=$('autoFillMetric').value,direction=$('autoFillDirection').value,lowerIsBetter=metric==='ga'||metric==='sa',ascending=direction==='best'?lowerIsBetter:!lowerIsBetter;state.rosterSelected={};state.rosterSlotSeasons={};const used=new Set();for(const role of roles){const value=r=>metric==='score'?r.score:projectedPlayer({row:r,role})[metric];const cand=rosterCandidates(role).filter(r=>!used.has(r.player)).sort((a,b)=>(ascending?value(a)-value(b):value(b)-value(a))||b.gp-a.gp||a.player.localeCompare(b.player));for(let i=0;i<role.count;i++){const r=cand[i];if(r){state.rosterSelected[slotId(role.key,i)]=r.key;used.add(r.player)}}}buildLineupEditor();renderRosterCard()}

init();
