"""Snapshot public PokéAPI CSV data without making a request per species."""
import csv,io,json,urllib.request,datetime
from pathlib import Path
base='https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
def rows(file):
 return list(csv.DictReader(io.StringIO(urllib.request.urlopen(base+file,timeout=30).read().decode())))
names={int(r['pokemon_species_id']):r['name'] for r in rows('pokemon_species_names.csv') if r['local_language_id']=='9'}
types={int(r['id']):r['identifier'] for r in rows('types.csv')}
bytype={}
for r in rows('pokemon_types.csv'):
 bytype.setdefault(int(r['pokemon_id']),[]).append((int(r['slot']),types[int(r['type_id'])]))
data=[]
for r in rows('pokemon.csv'):
 if r['is_default']=='1' and int(r['id'])==int(r['species_id']):
  i=int(r['id']);data.append({'id':i,'name':names[i],'types':[t for _,t in sorted(bytype[i])],'height':int(r['height'])/10,'weight':int(r['weight'])/10})
Path('content/species.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
Path('content/species-source.json').write_text(json.dumps({'source':'https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'speciesCount':len(data),'scope':'default national-dex species, without alternate forms'},indent=2)+'\n')
print(len(data),'species imported')
