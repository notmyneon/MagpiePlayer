'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n = value => Number(value) || 0;
const fmt = (value, digits = 1) => Number(value || 0).toLocaleString(undefined, {minimumFractionDigits:digits,maximumFractionDigits:digits});
const whole = value => fmt(value, 0);
const years = [];
let source = [], aggregate = [], byKey = new Map(), playerGroups = new Map(), fullSource = null;
let added = new Set(), spotlight = '', roster = {};
const STATS = ['hits','blocked','takeaways','goalsFor','shotsFor','goalsAgainst','shotsAgainst','individualGoals','individualShotsAttempts','giveaways','faceoffsWon','faceoffsLost','xGoalsFor','xGoalsAgainst','attemptsFor','attemptsAgainst','minors'];
const labels = {hits:'Hits',blocked:'Blocked shots',takeaways:'Takeaways',goalsFor:'On-ice goals for',shotsFor:'On-ice shots for',goalsAgainst:'On-ice goals against',shotsAgainst:'On-ice shots against',individualGoals:'Individual goals',individualShotsAttempts:'Individual unblocked attempts',giveaways:'Giveaways',faceoffsWon:'Faceoffs won',faceoffsLost:'Faceoffs lost',xGoalsFor:'On-ice expected goals for',xGoalsAgainst:'On-ice expected goals against',attemptsFor:'On-ice attempts for',attemptsAgainst:'On-ice attempts against',minors:'Minor penalties'};
const NUMERIC = new Set(['xGoalsFor','xGoalsAgainst']);
const SLOTS = [
  ...['f1','f2','f3','f4'].flatMap((band, i) => [1,2,3].map(j => ({id:`${band}${j}`,label:`L${i+1} F${j}`,group:`Line ${i+1}`,position:'F',band,minutes:[21,16.5,13.5,6.5][i]}))),
  ...['d1','d2','d3'].flatMap((band, i) => [1,2].map(j => ({id:`${band}${j}`,label:`P${i+1} D${j}`,group:`Pair ${i+1}`,position:'D',band,minutes:[25,19.5,8.5][i]})))
];
const BANDS = {f1:[18,Infinity],f2:[15,18],f3:[12,15],f4:[1,12],d1:[22,Infinity],d2:[17,22],d3:[0,17]};

function parseCSV(text) {
  const out=[]; let cells=[], field='', quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"' && quoted && text[i+1]==='"'){field+='"';i++}
    else if(c==='"') quoted=!quoted;
    else if(c===','&&!quoted){cells.push(field);field=''}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;cells.push(field);if(cells.some(Boolean))out.push(cells);cells=[];field=''}
    else field+=c;
  }
  cells.push(field);if(cells.some(Boolean))out.push(cells);
  const header=out.shift()||[];
  return out.map(row=>Object.fromEntries(header.map((h,i)=>[h,row[i]??''])));
}
function normalize(raw){
  const position=raw.position==='D'?'D':'F', name=raw.player.trim(), season=String(raw.season), team=raw.team.trim();
  const row={name,position,season,team,gp:n(raw.gp),avgtoi:n(raw.avgtoi)};
  for(const field of STATS) row[field]=n(raw[field.toLowerCase()]);
  row.identity=`${name.toLowerCase()}|${position}`;
  row.key=`${row.identity}|${season}|${team}`;
  row.score=score(row);
  return row;
}
// Retain the original score: shots against divided by average TOI is a
// season-level term; the other denominator terms are also season totals.
function score(row){const denominator=(row.avgtoi?row.shotsAgainst/row.avgtoi:0)+row.goalsAgainst+row.minors;return denominator>0?(row.hits+row.blocked+row.takeaways)/denominator*10:0}
function combine(rows){
  if(!rows.length)return null;
  const combined={...rows[0],team:[...new Set(rows.map(r=>r.team))].join(', '),gp:0,avgtoi:0};
  for(const f of STATS)combined[f]=0;
  for(const row of rows){combined.gp+=row.gp;combined.avgtoi+=row.avgtoi*row.gp;for(const f of STATS)combined[f]+=row[f]}
  combined.avgtoi=combined.gp?combined.avgtoi/combined.gp:0;
  combined.score=score(combined);
  return combined;
}
function seasonLabel(y){return `${y}–${String(n(y)+1).slice(-2)}`}
function options(select,items,chosen){select.innerHTML=items.map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join('');if(chosen!=null&&items.some(item=>item[0]===chosen))select.value=chosen}
function playerLabel(key){const row=playerGroups.get(key)?.[0];return row?`${row.name} · ${row.position}`:''}
function playerOptions(){return [...playerGroups.keys()].sort((a,b)=>playerLabel(a).localeCompare(playerLabel(b))).map(key=>[key,playerLabel(key)])}
function seasonRows(key){return [...new Set((playerGroups.get(key)||[]).map(r=>r.season))].sort((a,b)=>n(b)-n(a)).map(season=>combine(playerGroups.get(key).filter(r=>r.season===season)))}
function seasonOptions(key,select,preferred){const rows=seasonRows(key);options(select,rows.map(r=>[r.season,seasonLabel(r.season)]),preferred);return rows}
function statRows(row){return [['Games played',whole(row.gp)],['Avg ice time',`${fmt(row.avgtoi,1)} min`],['Hits',whole(row.hits)],['Blocked shots',whole(row.blocked)],['Takeaways',whole(row.takeaways)],['On-ice goals for',whole(row.goalsFor)],['On-ice shots for',whole(row.shotsFor)],['On-ice goals against',whole(row.goalsAgainst)],['On-ice shots against',whole(row.shotsAgainst)],['Individual goals',whole(row.individualGoals)],['Expected goals for',fmt(row.xGoalsFor)],['Expected goals against',fmt(row.xGoalsAgainst)]]}
function renderPlayer(){
  const key=$('playerSelect').value, rows=seasonRows(key), row=rows.find(r=>r.season===$('playerSeason').value)||rows[0];
  if(!row)return;
  const peers=aggregate.filter(r=>r.season===row.season&&r.position===row.position&&r.gp>=20).sort((a,b)=>b.score-a.score);
  const rank=peers.findIndex(r=>r.identity===row.identity)+1;
  $('playerCard').innerHTML=`<div class="card-top"><span>MAGPIE / PLAYER CARD</span><span class="badge">${esc(seasonLabel(row.season))}</span></div><h3 class="card-name">${esc(row.name)}</h3><div class="card-sub">${esc(row.team)} · ${row.position==='D'?'Defence':'Forward'} · ${whole(row.gp)} GP · ${fmt(row.avgtoi,1)} TOI</div><div class="score-hero"><strong>${fmt(row.score,2)}</strong><span>MAGPIE SCORE${rank?`<br>#${rank} OF ${peers.length} ${row.position==='D'?'DEFENDERS':'FORWARDS'} (20+ GP)`:''}</span></div><div class="stat-triplet">${['hits','blocked','takeaways'].map(f=>`<div class="stat-box"><strong>${whole(row[f])}</strong><span>${esc(labels[f])}</span><br><small>${fmt(row[f]/row.gp,2)} / GAME</small></div>`).join('')}</div><div class="secondary-stats"><div><span>ON-ICE GOALS FOR</span><b>${whole(row.goalsFor)}</b></div><div><span>ON-ICE GOALS AGAINST</span><b>${whole(row.goalsAgainst)}</b></div><div><span>ON-ICE SHOTS FOR</span><b>${whole(row.shotsFor)}</b></div><div><span>ON-ICE SHOTS AGAINST</span><b>${whole(row.shotsAgainst)}</b></div></div>`;
  $('seasonBreakdown').innerHTML=statRows(row).map(([label,value])=>`<div class="breakdown-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('');
  renderTimeline(rows,row.season);renderAdvanced();
}
function renderTimeline(rows,selected){
  const metric=$('timelineMetric').value, ordered=[...rows].reverse();
  const values=ordered.map(r=>metric==='score'?r.score:r[metric]/r.gp);
  const max=Math.max(1,...values)*1.16, left=35,right=500,top=20,bottom=151;
  const points=values.map((value,i)=>({x:left+(right-left)*(ordered.length===1?.5:i/(ordered.length-1)),y:bottom-(value/max)*(bottom-top),value,season:ordered[i].season}));
  const line=points.map(p=>`${p.x},${p.y}`).join(' '), area=`${left},${bottom} ${line} ${right},${bottom}`;
  $('timelineCaption').textContent=metric==='score'?'MAGPIE SCORE':`${labels[metric].toUpperCase()} / GAME`;
  $('timelineChart').innerHTML=`<div class="chart-wrap"><svg viewBox="0 0 535 180" role="img" aria-label="${esc($('timelineCaption').textContent)} across ${ordered.length} seasons"><line class="chart-grid" x1="35" y1="151" x2="500" y2="151"/><line class="chart-grid" x1="35" y1="85" x2="500" y2="85"/><line class="chart-grid" x1="35" y1="20" x2="500" y2="20"/><text class="chart-label" x="4" y="23">${fmt(max,1)}</text><text class="chart-label" x="7" y="153">0</text><polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${line}"/>${points.map((p,i)=>`<circle class="chart-dot ${p.season===selected?'selected':''}" cx="${p.x}" cy="${p.y}" r="5"><title>${esc(seasonLabel(p.season))}: ${fmt(p.value,2)}</title></circle>${(i===0||i===points.length-1||p.season===selected)?`<text class="chart-label" x="${p.x}" y="174" text-anchor="middle">${esc(p.season)}</text>`:''}`).join('')}</svg></div>`;
}
function renderCompare(){
  const sides=['A','B'].map(s=>seasonRows($(`compare${s}`).value).find(r=>r.season===$(`compare${s}Year`).value));
  $('comparisonCard').innerHTML=`<div class="card-top"><span>MAGPIE / HEAD TO HEAD</span><span class="badge">PLAYER COMPARISON</span></div><div class="comparison-grid">${sides.map((r,i)=>`${i?'<div class="comparison-vs">VS</div>':''}<div class="compare-side"><h3>${esc(r?.name||'Select player')}</h3><div class="card-sub">${esc(r?.team||'')} · ${r?esc(seasonLabel(r.season)):''} · ${r?.position==='D'?'Defence':'Forward'}</div><div class="compare-score">${r?fmt(r.score,2):'—'}</div>${r?statRows(r).map(([label,value])=>`<div class="compare-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join(''):''}</div>`).join('')}</div>`;
}
function teamContext(){return source.filter(r=>r.season===$('teamSeason').value&&r.team===$('teamSelect').value)}
function teamSelected(){
  const base=teamContext().map(r=>({row:r,isAdded:false})), seen=new Set(base.map(o=>o.row.identity));
  for(const key of added){if(!seen.has(key)){const row=seasonRows(key).find(r=>r.season===$('teamSeason').value);if(row)base.push({row,isAdded:true})}}
  return base.sort((a,b)=>b.row.score-a.row.score);
}
function renderTeam(){
  const year=$('teamSeason').value, team=$('teamSelect').value, rows=teamSelected(), all=aggregate.filter(r=>r.season===year);
  const current=new Set(rows.map(o=>o.row.identity));
  options($('teamAdd'),[['','Select player'],...all.filter(r=>!current.has(r.identity)).sort((a,b)=>a.name.localeCompare(b.name)).map(r=>[r.identity,`${r.name} · ${r.position} · ${r.team}`])]);
  options($('spotlight'),[['','None'],...rows.map(o=>[o.row.identity,o.row.name])],spotlight);
  $('addedChips').innerHTML=[...added].map(key=>`<button class="chip" data-remove="${esc(key)}" title="Remove player">${esc(playerLabel(key))} ×</button>`).join('');
  const avg=rows.length?rows.reduce((a,o)=>a+o.row.score,0)/rows.length:0;
  $('teamCard').innerHTML=`<div class="team-header"><div><div class="card-top">MAGPIE / TEAM CARD</div><h3>${esc(team)}</h3><div class="card-sub">${esc(seasonLabel(year))} · ${rows.length} PLAYERS${added.size?` · ${added.size} ADDED`:''}</div></div><span class="badge">${esc(seasonLabel(year))}</span></div><div class="team-summary"><div><b>${fmt(avg,2)}</b><span>AVG PLAYER SCORE</span></div><div><b>${whole(rows.reduce((a,o)=>a+o.row.hits,0))}</b><span>HITS</span></div><div><b>${whole(rows.reduce((a,o)=>a+o.row.blocked,0))}</b><span>BLOCKS</span></div><div><b>${whole(rows.reduce((a,o)=>a+o.row.takeaways,0))}</b><span>TAKEAWAYS</span></div></div><div class="roster-list">${rows.map(({row,isAdded},i)=>`<div class="roster-person ${row.identity===spotlight?'spotlit':''} ${isAdded?'added':''}"><strong>${String(i+1).padStart(2,'0')} ${esc(row.name)}</strong><small>${esc(row.position)} · ${fmt(row.score,2)}</small></div>`).join('')}</div>`;
}
function activeRosterRows(){const year=$('rosterSeason').value,team=$('rosterTeam').value,min=Math.max(0,n($('rosterMinGP').value));return aggregate.filter(r=>r.season===year&&r.gp>=min&&(!team||r.team.split(', ').includes(team)))}
function eligible(r,s){const [min,max]=BANDS[s.band];return r.position===s.position&&r.avgtoi>=min&&r.avgtoi<max}
function sortCandidates(rows,mode){return rows.sort((a,b)=>mode==='score'?b.score-a.score||b.avgtoi-a.avgtoi:mode==='lowest'?a.score-b.score||b.avgtoi-a.avgtoi:mode==='name'?a.name.localeCompare(b.name):b.avgtoi-a.avgtoi||b.score-a.score)}
function validateRoster(){const rows=activeRosterRows(),lookup=new Map(rows.map(r=>[r.identity,r]));const used=new Set();for(const slot of SLOTS){const id=roster[slot.id],r=lookup.get(id);if(!r||!eligible(r,slot)||used.has(id))delete roster[slot.id];else used.add(id)}}
function renderRoster(){
  validateRoster();const rows=activeRosterRows(),chosen=new Set(Object.values(roster));let group='';
  $('rosterSlots').innerHTML=SLOTS.map(slot=>{
    const heading=slot.group!==group?`<div class="slot-group">${esc(group=slot.group)} <small style="font:600 11px var(--font);color:var(--muted)">${slot.minutes} ROLE MIN</small></div>`:'';
    const candidates=sortCandidates(rows.filter(r=>eligible(r,slot)&&(!chosen.has(r.identity)||roster[slot.id]===r.identity)), $('rosterSort').value);
    return `${heading}<label class="slot-row"><span>${esc(slot.label)}</span><select data-slot="${slot.id}"><option value="">Choose player · ${candidates.length} eligible</option>${candidates.map(r=>`<option value="${esc(r.identity)}" ${roster[slot.id]===r.identity?'selected':''}>${esc(r.name)} · ${whole(r.gp)} GP · ${fmt(r.avgtoi,1)} TOI · ${fmt(r.score,2)}</option>`).join('')}</select></label>`
  }).join('');
  const lookup=new Map(rows.map(r=>[r.identity,r])), selected=SLOTS.map(slot=>({slot,row:lookup.get(roster[slot.id])})).filter(o=>o.row);
  const roleSum=selected.reduce((a,o)=>a+o.slot.minutes,0), scale=roleSum?300*(selected.length/18)/roleSum:0;
  const totals={hits:0,blocked:0,takeaways:0,shotsFor:0,goalsFor:0,shotsAgainst:0,goalsAgainst:0,minors:0};
  for(const {slot,row} of selected){const weight=slot.minutes*scale/row.avgtoi/row.gp;for(const field of Object.keys(totals))totals[field]+=row[field]*weight}
  // Each on-ice event involves five skaters, so divide by five for a team estimate.
  const denominator=totals.shotsAgainst/5+totals.goalsAgainst/5+totals.minors;
  const projected=denominator?(totals.hits+totals.blocked+totals.takeaways)/denominator*10:0;
  const team=$('rosterTeam').value||'Custom roster';
  $('rosterCard').innerHTML=`<div class="card-top"><span>MAGPIE / ROSTER BUILDER</span><span class="badge">${esc(seasonLabel($('rosterSeason').value))}</span></div><h3>${esc(team)}</h3><div class="card-sub">${selected.length} OF 18 SKATERS · PROJECTED PER GAME</div><div class="roster-score">${fmt(projected,2)}</div><div class="card-sub">PROJECTED MAGPIE SCORE</div><div class="roster-stats">${[['hits','HITS'],['blocked','BLOCKS'],['takeaways','TAKEAWAYS'],['goalsFor','GOALS FOR'],['shotsFor','SHOTS FOR'],['goalsAgainst','GOALS AGAINST'],['shotsAgainst','SHOTS AGAINST'],['minors','MINORS'],['count','PLAYERS']].map(([f,label])=>`<div><b>${f==='count'?selected.length:fmt(['shotsFor','shotsAgainst','goalsFor','goalsAgainst'].includes(f)?totals[f]/5:totals[f],1)}</b><span>${label}</span></div>`).join('')}</div>${[...new Set(SLOTS.map(s=>s.group))].map(group=>`<div class="lineup-group"><h4>${esc(group.toUpperCase())}</h4><div class="lineup-grid">${SLOTS.filter(s=>s.group===group).map(slot=>`<div class="lineup-cell"><small>${slot.label}</small><strong>${esc(lookup.get(roster[slot.id])?.name||'Open slot')}</strong></div>`).join('')}</div></div>`).join('')}<p class="projection-note">On-ice goals and shots are divided by five to estimate team events. All totals are role-adjusted per game; partial rosters are scaled to their share of 300 skater minutes.</p>`;
}
function changeView(){const view=['players','compare','teams','roster'].includes(location.hash.slice(1))?location.hash.slice(1):'players';for(const id of ['players','compare','teams','roster'])$(id).hidden=id!==view;document.querySelectorAll('[data-nav]').forEach(a=>{a.classList.toggle('active',a.dataset.nav===view);if(a.dataset.nav===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')})}
async function loadAdvanced(){
  if(fullSource)return;
  $('advancedResults').textContent='Loading source statistics…';
  try{const response=await fetch('data/player-stats.csv');if(!response.ok)throw new Error('Source file unavailable');fullSource=parseCSV(await response.text());const fields=Object.keys(fullSource[0]||{}).slice(4);options($('advancedMetric'),[['','Choose a statistic'],...fields.map(f=>[f,f.replaceAll('_',' · ')])]);renderAdvanced()}
  catch(e){$('advancedResults').textContent=`Could not load source statistics: ${e.message}`}
}
function renderAdvanced(){
  if(!fullSource)return;
  const metric=$('advancedMetric').value,key=$('playerSelect').value;
  if(!metric){$('advancedResults').textContent='';return}
  const rows=fullSource.filter(r=>`${r.name.toLowerCase()}|${r.position==='D'?'D':'F'}`===key),seasons=[...new Set(rows.map(r=>r.season))].sort((a,b)=>n(b)-n(a));
  $('advancedResults').innerHTML=seasons.map(season=>{const subset=rows.filter(r=>r.season===season),value=subset.reduce((a,r)=>a+n(r[metric]),0);return `<div class="source-row"><span>${esc(seasonLabel(season))}</span><strong>${fmt(value,Number.isInteger(value)?0:2)}</strong></div>`}).join('');
}
async function exportCard(id){
  const card=$(id),width=Math.max(900,Math.ceil(card.getBoundingClientRect().width)),height=Math.ceil(card.getBoundingClientRect().height),clone=card.cloneNode(true);
  try{const css=await (await fetch('style.css')).text();const content=`<div xmlns="http://www.w3.org/1999/xhtml"><style>${css.replace(/@import[^;]*;/g,'')} .feature-card{width:${width}px;min-height:${height}px;box-shadow:none}</style>${clone.outerHTML}</div>`;const svg=new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${content}</foreignObject></svg>`],{type:'image/svg+xml'}),url=URL.createObjectURL(svg),img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);const a=document.createElement('a');a.download=`magpie-${id}.png`;a.href=canvas.toDataURL('image/png');a.click()};img.onerror=()=>{URL.revokeObjectURL(url);alert('Card export failed. You can use a screenshot of the card instead.')};img.src=url}catch{alert('Card export failed. You can use a screenshot of the card instead.')}
}
function bind(){
  window.addEventListener('hashchange',changeView);changeView();
  $('playerSelect').addEventListener('change',()=>{seasonOptions($('playerSelect').value,$('playerSeason'));renderPlayer()});
  $('playerSeason').addEventListener('change',renderPlayer);$('timelineMetric').addEventListener('change',renderPlayer);
  for(const side of ['A','B']){$(`compare${side}`).addEventListener('change',()=>{seasonOptions($(`compare${side}`).value,$(`compare${side}Year`));renderCompare()});$(`compare${side}Year`).addEventListener('change',renderCompare)}
  $('teamSeason').addEventListener('change',()=>{added.clear();spotlight='';rebuildTeamSelect();renderTeam()});$('teamSelect').addEventListener('change',()=>{added.clear();spotlight='';renderTeam()});
  $('teamAddButton').addEventListener('click',()=>{if($('teamAdd').value){added.add($('teamAdd').value);renderTeam()}});
  $('spotlight').addEventListener('change',()=>{spotlight=$('spotlight').value;renderTeam()});$('resetTeam').addEventListener('click',()=>{added.clear();spotlight='';renderTeam()});
  $('addedChips').addEventListener('click',e=>{const key=e.target.closest('[data-remove]')?.dataset.remove;if(key){added.delete(key);if(spotlight===key)spotlight='';renderTeam()}});
  $('rosterSeason').addEventListener('change',()=>{roster={};rebuildRosterTeams();renderRoster()});$('rosterTeam').addEventListener('change',()=>{roster={};renderRoster()});
  for(const id of ['rosterMinGP','rosterSort'])$(id).addEventListener(id==='rosterMinGP'?'input':'change',renderRoster);
  $('rosterSlots').addEventListener('change',e=>{const id=e.target.dataset.slot;if(!id)return;if(e.target.value){for(const slot of SLOTS)if(roster[slot.id]===e.target.value)delete roster[slot.id];roster[id]=e.target.value}else delete roster[id];renderRoster()});
  for(const [id,mode] of [['autoTeam','toi'],['autoBest','score'],['autoLowest','lowest']])$(id).addEventListener('click',()=>{roster={};const rows=activeRosterRows(),used=new Set();for(const slot of SLOTS){const row=sortCandidates(rows.filter(r=>eligible(r,slot)&&!used.has(r.identity)),mode)[0];if(row){roster[slot.id]=row.identity;used.add(row.identity)}}renderRoster()});
  $('clearRoster').addEventListener('click',()=>{roster={};renderRoster()});
  $('explorer').addEventListener('toggle',()=>{if($('explorer').open)loadAdvanced()});$('advancedMetric').addEventListener('change',renderAdvanced);
  document.querySelectorAll('[data-export]').forEach(button=>button.addEventListener('click',()=>exportCard(button.dataset.export)));
}
function rebuildTeamSelect(){const y=$('teamSeason').value,teams=[...new Set(source.filter(r=>r.season===y).map(r=>r.team))].sort();options($('teamSelect'),teams.map(t=>[t,t]),teams.includes($('teamSelect').value)?$('teamSelect').value:teams[0])}
function rebuildRosterTeams(){const y=$('rosterSeason').value,teams=[...new Set(source.filter(r=>r.season===y).map(r=>r.team))].sort();options($('rosterTeam'),[['','All NHL teams'],...teams.map(t=>[t,t])])}
async function init(){
  bind();
  try{const response=await fetch('data/player-data.csv',{cache:'no-store'});if(!response.ok)throw new Error('Player data unavailable');source=parseCSV(await response.text()).map(normalize).filter(r=>r.name&&r.gp);const grouped=new Map();for(const row of source){if(!grouped.has(row.identity))grouped.set(row.identity,[]);grouped.get(row.identity).push(row)}playerGroups=grouped;
    const seasonGroups=new Map();for(const row of source){const key=`${row.identity}|${row.season}`;if(!seasonGroups.has(key))seasonGroups.set(key,[]);seasonGroups.get(key).push(row)}aggregate=[...seasonGroups.values()].map(combine);byKey=new Map(aggregate.map(r=>[`${r.identity}|${r.season}`,r]));years.push(...new Set(source.map(r=>r.season)));years.sort((a,b)=>n(b)-n(a));
    const players=playerOptions(),defaultPlayer=aggregate.filter(r=>r.season===years[0]&&r.gp>=40).sort((a,b)=>b.score-a.score)[0]?.identity||players[0]?.[0];
    options($('playerSelect'),players,defaultPlayer);seasonOptions($('playerSelect').value,$('playerSeason'));
    options($('compareA'),players,defaultPlayer);seasonOptions($('compareA').value,$('compareAYear'));
    const second=aggregate.filter(r=>r.season===years[0]&&r.identity!==defaultPlayer&&r.gp>=40).sort((a,b)=>b.score-a.score)[0]?.identity||players[1]?.[0];options($('compareB'),players,second);seasonOptions($('compareB').value,$('compareBYear'));
    options($('teamSeason'),years.map(y=>[y,seasonLabel(y)]));options($('rosterSeason'),years.map(y=>[y,seasonLabel(y)]));rebuildTeamSelect();rebuildRosterTeams();renderPlayer();renderCompare();renderTeam();renderRoster();
    $('headerSeason').textContent=`${years.at(-1)}–${n(years[0])+1}`;$('dataStatus').textContent=`${whole(source.length)} ROWS · ${whole(playerGroups.size)} PLAYERS`;
  }catch(error){$('dataStatus').textContent=`DATA ERROR: ${error.message}`;console.error(error)}
}
init();
