"""Join frozen player seasons to official individual scoring/discipline totals."""
import csv,json,pathlib,unicodedata,re,urllib.request,urllib.parse,concurrent.futures,time,io
ROOT=pathlib.Path(__file__).resolve().parents[1]
def key(s):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
core={}
for path in sorted((ROOT/'data/core').glob('*.csv')):
 for r in csv.DictReader(path.open()):
  k=(r['season'],key(r['player']),r['position']);a=core.setdefault(k,{'player':r['player'],'gp':0});a['gp']+=int(float(r['gp']))
current={}
for path in sorted((ROOT/'data/similarity').glob('current-*.csv')):
 for r in csv.DictReader(path.open()):current[(r['season'],key(r['player']),r['position'])]=r
seasons=sorted({y for y,n,pos in core if y!='2026'})
def fetch(season):
 records=[];start=0
 while True:
  query=urllib.parse.urlencode({'isAggregate':'false','isGame':'false','start':start,'limit':1000,'cayenneExp':f'seasonId={season}{int(season)+1} and gameTypeId=2'})
  url='https://api.nhle.com/stats/rest/en/skater/summary?'+query
  for attempt in range(4):
   try:
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'MagpieHockey/1.0'}),timeout=40) as response:data=json.load(response)
    break
   except Exception:
    if attempt==3:raise
    time.sleep(attempt+1)
  page=data.get('data',[]);records.extend(page)
  if not page or len(records)>=data.get('total',len(records)):break
  start+=len(page)
 return season,records
out=[];coverage={};failed=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 futures={pool.submit(fetch,y):y for y in seasons}
 for future in concurrent.futures.as_completed(futures):
  y=futures[future]
  try:
   _,rs=future.result();byname={}
   for r in rs:byname.setdefault(key(r.get('skaterFullName','')),[]).append(r);matches=0
   for (season,name,position),a in core.items():
    if season!=y:continue
    matches_for_name=[r for r in byname.get(name,[]) if int(r.get('gamesPlayed',-1))==a['gp'] and ('D' if r.get('positionCode')=='D' else 'F')==position]
    if len(matches_for_name)!=1:continue
    r=matches_for_name[0]
    if not all(r.get(k) is not None for k in ['playerId','goals','assists','penaltyMinutes']):continue
    out.append({'player':a['player'],'season':season,'position':position,'player_id':r['playerId'],'gp':a['gp'],'goals':r['goals'],'assists':r['assists'],'pim':r['penaltyMinutes']});matches+=1
   coverage[y]={'matched':matches,'total':sum(1 for s,n,pos in core if s==y)}
   print(y,coverage[y],flush=True)
  except Exception as e:failed.append(y);print('Lookup failed',y,str(e),flush=True)
for k,r in current.items():
 if k in core and int(r['gp'])==core[k]['gp']:out.append(r)
coverage['2026']={'matched':sum(r['season']=='2026' for r in out),'total':sum(1 for y,n,pos in core if y=='2026')}
if failed:raise SystemExit('NHL lookups failed: '+','.join(failed))
if sum(v['matched'] for y,v in coverage.items() if y!='2026')<1000:raise SystemExit('Historical join coverage too low; inspect NHL response')
with (ROOT/'data/similarity/supplement.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=['player','season','position','player_id','gp','goals','assists','pim']);w.writeheader();w.writerows(sorted(out,key=lambda r:(r['season'],r['player'])))
(ROOT/'data/similarity/coverage.json').write_text(json.dumps(coverage,separators=(',',':'))+'\n')
print('Supplement player-seasons:',len(out),'/',len(core))
