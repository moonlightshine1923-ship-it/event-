(function(root){
 const months={jan:'01',feb:'02',fev:'02',mar:'03',apr:'04',avr:'04',may:'05',mai:'05',jun:'06',juin:'06',jul:'07',juil:'07',aug:'08',aou:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
 function date(value){
  const m=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/(\d{1,2})\s*([a-z]{3,4})\s*(20\d{2})/i);
  if(!m)return '';const month=months[m[2].toLowerCase()];if(!month)return '';
  const day=m[1].padStart(2,'0'),d=new Date(`${m[3]}-${month}-${day}T12:00:00Z`);
  return Number.isFinite(+d)&&d.getUTCDate()===Number(day)?`${m[3]}-${month}-${day}`:'';
 }
 function parseTicket(text){
  text=String(text||'').replace(/0ct/gi,'Oct').replace(/\bO(?=\d{1,2}Oct)/g,'');
  const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean),out={};
  const passenger=lines.find(l=>/(?:passager|passenger)\s*[:/]/i.test(l));
  if(passenger){
   let name=passenger.replace(/^.*?Passenger\s*:\s*/i,'');
   if(name===passenger)name=passenger.replace(/^.*?(?:Passager)\s*:\s*/i,'');
   name=name.split(/\b(?:MR|MRS|MS|MISS|MSTR|ADT|CHD|INF)\b|\(/i)[0].trim();
   if(name.includes('/')){const parts=name.split('/');out.passager_nom=parts[0].trim();out.passager_prenom=parts.slice(1).join(' ').trim();}
   else{const words=name.split(/\s+/);if(words.length>=2){out.passager_nom=words.shift();out.passager_prenom=words.join(' ');}}
  }
  const top=lines.slice(0,16).join('\n');
  const airline=top.match(/\b(AIR\s+ALG[ÉE]RIE|TASSILI\s+AIRLINES|TURKISH\s+AIRLINES|AIR\s+FRANCE|EMIRATES|QATAR\s+AIRWAYS|ROYAL\s+AIR\s+MAROC)\b/i);
  const operated=lines.join(' ').match(/Operated\s+by\s*:\s*([A-Z][A-Z ]+?)(?:\s{2,}|\b(?:Si[eè]ge|Seat|Commercial|NVB|NVAV)\b|$)/i);
  if(airline)out.compagnie=airline[1].replace(/\s+/g,' ').toUpperCase();else if(operated)out.compagnie=operated[1].trim();
  const flights=[];
  for(let i=0;i<lines.length;i++){
   const m=lines[i].match(/\b([A-Z]{2})\s?(\d{3,4})\b/i);
   if(!m)continue;
   const after=lines[i].slice(m.index+m[0].length),times=after.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g)||[];
   if(times.length<2)continue;
   const tail=lines.slice(i,Math.min(i+4,lines.length)).join(' ');
   const dates=(tail.match(/\b\d{1,2}\s*[A-Za-z]{3,4}\s*20\d{2}\b/g)||[]).map(date).filter(Boolean);
   const route=lines[i].slice(0,m.index).trim();
   let departure='',arrival='';
   const repeated=route.match(/\b([A-Z]+)\s+\1\b/);
   if(repeated){
    if(repeated.index>0){departure=route.slice(0,repeated.index).trim();arrival=route.slice(repeated.index).trim();if(/^AIRPORT\b/i.test(lines[i+1]||''))arrival+=' AIRPORT';}
    else{departure=repeated[0];arrival=route.slice(repeated[0].length).trim();if(/^AIRPORT\b/i.test(lines[i+1]||''))departure+=' AIRPORT';}
   }else if(/\s(?:→|->|\bTO\b)\s/i.test(route)){[departure,arrival]=route.split(/\s(?:→|->|\bTO\b)\s/i);}
   flights.push({flight:(m[1]+m[2]).toUpperCase(),departure,arrival,depart:dates[0]?dates[0]+'T'+times[0]:'',arrive:dates[1]?dates[1]+'T'+times[1]:''});
  }
  if(flights[0])Object.assign(out,{num_vol_aller:flights[0].flight,aeroport_depart:flights[0].departure,aeroport_arrivee:flights[0].arrival,date_depart:flights[0].depart,date_arrivee:flights[0].arrive});
  if(flights[1])Object.assign(out,{num_vol_retour:flights[1].flight,aeroport_depart_retour:flights[1].departure,aeroport_arrivee_retour:flights[1].arrival,date_retour:flights[1].depart,date_arrivee_retour:flights[1].arrive});
  return out;
 }
 root.TravelParser={parseTicket};
})(typeof window!=='undefined'?window:globalThis);
