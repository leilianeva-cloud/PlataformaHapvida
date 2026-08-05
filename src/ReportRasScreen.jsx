import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import {
  ChevronLeft, LogOut,
  BarChart2, Info, Download, Eye,
  Check, AlertCircle, Users, Clock,
  Paperclip, Table2, Presentation, FolderOpen,
  RefreshCw, Building2, Wrench, AlertTriangle,
  TrendingUp, Loader2
} from "lucide-react";
import { useAuth } from './AuthContext';
import { logAudit, loadRasTemplate, getRasTemplateInfo } from './supabaseClient';

/* ── CONSTANTS ─────────────────────────────────────────────────────────────── */
const ENTREGUES = ["Monitoramento e Controle","Encerrado"];
const FASES_P_COL = {
  "Solicitado":"7F7F7F","Planejamento":"9751CB","Execução":"0070C0",
  "Piloto":"F4801E","Expansão":"FFD966","Monitoramento e Controle":"00B050","Encerrado":"00B050"
};
const FASES_M_COL = {
  "01.Não Iniciado":"9E9E9E","02.Planejamento/Especificação":"9751CB","03.Desenvolvimento":"0070C0",
  "04.Homologação":"F4801E","05.Ag. Publicação":"FFD966","06.Finalizado":"00B050"
};

/* ── UTILS ─────────────────────────────────────────────────────────────────── */
function norm(s){
  if(!s) return "";
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
}
function fmtDate(v){
  if(!v) return "—";
  if(v instanceof Date && !isNaN(v)){
    const d=v.getDate().toString().padStart(2,"0"), m=(v.getMonth()+1).toString().padStart(2,"0");
    const y=v.getFullYear().toString().slice(-2);
    return `${d}/${m}/${y}`;
  }
  return "—";
}
/* Versão dia/mês (sem ano) — usada SÓ nas boxes Atrasados/Próximas do slide 2.
   fmtDate completa continua no backlog e na coluna Novo Plano. */
function fmtDM(v){
  const f=fmtDate(v);
  return f==="—"?f:f.slice(0,5);   // "29/05/26" -> "29/05"
}
/* Converte número serial do Excel (sistema 1900) em Date local à meia-noite,
   sem drift de fuso. Defesa caso alguma leitura venha sem cellDates. */
function excelSerialToDate(n){
  const u=new Date(Math.round((n-25569)*86400000));
  return new Date(u.getUTCFullYear(),u.getUTCMonth(),u.getUTCDate());
}

/* ── AUTOFIT DA COLUNA "PROJETO" ───────────────────────────────────────────
   A constante fixa antiga (52.388 EMU/char) era uma ESTIMATIVA — vinha de um
   comentário no código, não de medição. Ela super-alocava de 8% a 34% e roubava
   espaço da coluna "Projeto". Aqui usamos a largura REAL de cada caractere em
   Calibri 8pt (a fonte das células), medida com métrica Carlito e embutida.
   Nomes que ainda não couberem numa linha simplesmente quebram — como o Squad
   já faz hoje. Não truncamos mais no slide 2: o título sai completo, igual ao
   backlog. A box tem folga vertical de sobra (medido: CAP=6 aguenta até todas
   as linhas quebrando em duas), então a paginação não muda.
   ────────────────────────────────────────────────────────────────────────── */
const CELL_PAD = 182880;   // lIns + rIns padrão da célula (0,1" cada)
const HDR_K    = 1.15;     // cabeçalho é negrito → pequena folga de segurança
const NOME_COL = 2;        // "Projeto" é a 3ª coluna em TODAS as tabelas

/* Largura em EMU de cada caractere a 8pt (Calibri, medido via Carlito).
   Fallback = largura do "n" para qualquer caractere fora da tabela. */
const CHAR_W = {32:22969, 33:33089, 34:40729, 35:50602, 36:51495, 37:72628, 38:69304, 39:22423, 40:30807, 41:30807, 42:50602, 43:50602, 44:25350, 45:31105, 46:25648, 47:39241, 48:51495, 49:51495, 50:51495, 51:51495, 52:51495, 53:51495, 54:51495, 55:51495, 56:51495, 57:51495, 58:27186, 59:27186, 60:50602, 61:50602, 62:50602, 63:47079, 64:90835, 65:58787, 66:55265, 67:54173, 68:62508, 69:49609, 70:46682, 71:64095, 72:63302, 73:25598, 74:32395, 75:52784, 76:42714, 77:86866, 78:65584, 79:67270, 80:52487, 81:68362, 82:55166, 83:46682, 84:49510, 85:65187, 86:57646, 87:90388, 88:52735, 89:49510, 90:47575, 91:31155, 92:39241, 93:31155, 94:50602, 95:50602, 96:29567, 97:48667, 98:53380, 99:42962, 100:53380, 101:50552, 102:31006, 103:47823, 104:53380, 105:23316, 106:24309, 107:46186, 108:23316, 109:81161, 110:53380, 111:53578, 112:53380, 113:53380, 114:35421, 115:39737, 116:34032, 117:53380, 118:45889, 119:72628, 120:44004, 121:45988, 122:40134, 123:31948, 124:46782, 125:31948, 126:50602, 170:40878, 186:42912, 192:58787, 193:58787, 194:58787, 195:58787, 199:54173, 201:49609, 202:49609, 205:25598, 211:67270, 212:67270, 213:67270, 218:65187, 220:65187, 224:48667, 225:48667, 226:48667, 227:48667, 231:42962, 233:50552, 234:50552, 237:23316, 243:53578, 244:53578, 245:53578, 250:53380, 252:53380, 8211:50602, 8212:91976, 8226:50602, 8230:70148};
const CHAR_FB = 53380;

const wOf   = ch => CHAR_W[ch.charCodeAt(0)] ?? CHAR_FB;
const wStr  = (t,k=1)=>{let s=0;for(const c of String(t??"")) s+=wOf(c); return Math.ceil(s*k)+CELL_PAD;};
const charsIn = (t,wMax)=>{ // quantos chars de t cabem numa coluna de wMax EMU
  const cap=wMax-CELL_PAD; let s=0,i=0;
  for(const c of String(t??"")){ s+=wOf(c); if(s>cap) break; i++; }
  return i;
};

/* Trunca respeitando a largura REAL da coluna (não um nº fixo de chars).
   wMax=Infinity → nunca trunca (usado no slide 2, título completo). */
function trunc(s, wMax = Infinity){
  const t = String(s ?? "");
  if(!isFinite(wMax)) return t;
  const cap = wMax - CELL_PAD;
  let sum=0;
  for(let i=0;i<t.length;i++){
    sum += wOf(t[i]);
    if(sum > cap) return t.slice(0, Math.max(1,i)).trimEnd() + "…";
  }
  return t;
}function parseNP(val){
  if(val===null||val===undefined||String(val).trim()===""||String(val)==="NaN") return "—";
  if(val instanceof Date&&!isNaN(val)) return fmtDate(val);
  const d=new Date(val);
  if(!isNaN(d.getTime())&&String(val).length>6) return fmtDate(d);
  return String(val).trim()||"—";
}
/* Replan. das boxes Atrasados/Próximas — o campo pode trazer VÁRIAS datas
   concatenadas (ex.: "21/05/2026 30/06/2026"), pois cada repactuação acumula
   uma data. Regras: mostrar só a MAIS RECENTE (cronológica; empate → a última
   escrita) e sem ano. Texto livre (ex.: "A definir") passa intacto; vazio → —.
   Aceita ano de 2 ou 4 dígitos e separador de espaço simples ou duplo. */
// Col BY vem como Date nativo quando lida com cellDates:true (caso do gerador).
  // Sem isto, String(Date) = "Fri Jun 12 2026 00:00:28 GMT-0300..." e a regex de
  // dd/mm não casa, devolvendo a string crua no slide.
function parseNPdm(val){
  if(val instanceof Date && !isNaN(val)) return fmtDM(val);
  if(typeof val==="number" && isFinite(val)) return fmtDM(excelSerialToDate(val));
  const s=(val===null||val===undefined)?"":String(val).trim();
  if(!s||s==="NaN") return "—";
  
  const found=[...s.matchAll(/(\d{2})\/(\d{2})\/(\d{2,4})/g)];
  if(found.length===0) return s;                       // texto livre → intacto
  const parsed=found.map((m,i)=>{
    const d=+m[1], mo=+m[2], y=m[3].length===2?2000+(+m[3]):(+m[3]);
    return { key:new Date(y,mo-1,d).getTime(), dm:`${m[1]}/${m[2]}`, ord:i };
  });
  const valid=parsed.filter(p=>!isNaN(p.key));
  if(valid.length===0){ const last=found[found.length-1]; return `${last[1]}/${last[2]}`; }
  valid.sort((a,b)=> a.key-b.key || a.ord-b.ord);      // mais recente por último
  return valid[valid.length-1].dm;
}
function stripPref(s){
  const str=String(s||"");
  return str.startsWith("Digital - ")?str.slice(10):str;
}
/* Reduz STATUS DO PROJETO (col U) para palavra-chave curta */
function shortStatusP(s){
  const nr=norm(s);
  if(nr.startsWith("no prazo")) return "No prazo";
  if(nr.startsWith("em risco")) return "Em risco";
  if(nr.startsWith("atrasado")) return "Atrasado";
  if(nr.startsWith("suspenso")) return "Suspenso";
  if(nr.startsWith("cancelado")) return "Cancelado";
  return String(s||"").trim();
}
/* Remove prefixo numérico "NN." do STATUS de melhorias */
function shortStatusM(s){
  return String(s||"").replace(/^\s*\d{1,2}\.\s*/,"").trim();
}
function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function rowBg(i){ return i%2===0?"FFFFFF":"F4F7FD"; }
function pctFmt(n,t){ return t>0?(n/t*100).toFixed(1).replace(".",","):"0,0"; }

/* ── XLSX PARSING ──────────────────────────────────────────────────────────── */
function readSheet(buf,sheetName,headerRowIdx){
  const wb=XLSX.read(new Uint8Array(buf),{type:"array",cellDates:true});
  const ws=wb.Sheets[sheetName];
  if(!ws) throw new Error(`Aba "${sheetName}" não encontrada`);
  const all=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
  return all.slice(headerRowIdx+1);
}

/* ── DATA PROCESSING ───────────────────────────────────────────────────────── */
function processData(portBuf,melBuf,melSheetName,lider,trimestre,compromisso){
  const today=new Date(); today.setHours(0,0,0,0);
  const today5=new Date(today); today5.setDate(today5.getDate()+5);

  const pfRows=readSheet(portBuf,"Portfólio",1);
  const matchL=r=>r[8]&&norm(String(r[8])).includes(norm(lider));
  const matchT=r=>r[57]&&norm(String(r[57]))===norm(trimestre);
  const okSt=r=>!["Cancelado","Suspenso"].includes(String(r[20]||""));
  const okDp=r=>!r[59];

  const fin=pfRows.filter(r=>matchL(r)&&matchT(r)&&okSt(r)&&okDp(r)&&norm(String(r[58]||""))===norm(compromisso));
  const ea=pfRows.filter(r=>matchL(r)&&matchT(r)&&okSt(r)&&okDp(r)&&["especificacao","andamento"].includes(norm(String(r[58]||""))));

  const enc_p=fin.filter(r=>ENTREGUES.includes(String(r[19]||"")));
  const act_p=fin.filter(r=>!ENTREGUES.includes(String(r[19]||"")));
  const at_p=[],er_p=[],np_p=[];
  for(const r of act_p){
    const st=String(r[20]||""),d=r[23] instanceof Date?r[23]:null;
    if(norm(st).startsWith("atrasado")) at_p.push(r);
    else if(d&&d<today) at_p.push(r);
    else if(d&&d>=today&&d<=today5) er_p.push(r);
    else if(d&&d>today5) np_p.push(r);
  }
  const prx_p=act_p.filter(r=>{const d=r[23];return d instanceof Date&&d>=today&&d<=today5;});

  // Canonical phase matching: normalize Excel value, map back to canonical label
  const FASE_P_CANON=["Solicitado","Planejamento","Execução","Piloto","Expansão","Monitoramento e Controle","Encerrado"];
  const canonFaseP=raw=>{
    const nr=norm(raw);
    const hit=FASE_P_CANON.find(c=>norm(c)===nr);
    return hit||String(raw||"").trim()||"(sem fase)";
  };
  const sqP={};
  for(const r of fin){
    const sq=stripPref(String(r[62]||""))||"Sem Squad";
    if(!sqP[sq]) sqP[sq]={total:0,enc:0};
    sqP[sq].total++; if(ENTREGUES.includes(String(r[19]||""))) sqP[sq].enc++;
  }
  const fasP={};
  for(const r of fin){const f=canonFaseP(r[19]);fasP[f]=(fasP[f]||0)+1;}

  const atraso_proj=at_p.sort((a,b)=>{
    const da=a[23] instanceof Date?a[23]:new Date("2099");
    const db=b[23] instanceof Date?b[23]:new Date("2099");
    return da-db;
  }).map(r=>({lecom:String(r[0]||""),squad:stripPref(String(r[62]||"")),nome:String(r[2]||""),fase:String(r[19]||""),target:fmtDM(r[23]),np:parseNPdm(r[76])}));

  const prx_proj=prx_p.map(r=>({lecom:String(r[0]||""),squad:stripPref(String(r[62]||"")),nome:String(r[2]||""),fase:String(r[19]||""),status:shortStatusP(r[20]),target:fmtDM(r[23]),np:parseNPdm(r[76])}));

  const bl_fin=fin.map(r=>({lecom:String(r[0]||""),squad:stripPref(String(r[62]||"")),nome:String(r[2]||""),fase:String(r[19]||""),status:shortStatusP(r[20]),target:fmtDate(r[23]),np:parseNP(r[76]),enc:ENTREGUES.includes(String(r[19]||""))}));
  const bl_ea=ea.map(r=>({lecom:String(r[0]||""),squad:stripPref(String(r[62]||"")),nome:String(r[2]||""),fase:String(r[19]||""),status:shortStatusP(r[20]),target:fmtDate(r[23]),np:parseNP(r[76]),enc:ENTREGUES.includes(String(r[19]||""))}));

  const melRows=readSheet(melBuf,melSheetName,0);
  const allM=melRows.filter(r=>r[25]&&norm(String(r[25])).includes(norm(lider))&&!r[9]);
  const fin_m=allM.filter(r=>String(r[15]||"")==="06.Finalizado");
  const act_m=allM.filter(r=>String(r[15]||"")!=="06.Finalizado");
  const at_m=[],er_m=[],np_m=[];
  for(const r of act_m){
    const d=r[13] instanceof Date?r[13]:null;
    if(d&&d<today) at_m.push(r);
    else if(d&&d>=today&&d<=today5) er_m.push(r);
    else if(d&&d>today5) np_m.push(r);
  }

  const sqM={};
  for(const r of allM){
    const sq=stripPref(String(r[35]||""))||"Sem Squad";
    if(!sqM[sq]) sqM[sq]={total:0,fin:0};
    sqM[sq].total++; if(String(r[15]||"")==="06.Finalizado") sqM[sq].fin++;
  }
  // Canonical status matching for melhorias
  const FASE_M_CANON=["01.Não Iniciado","02.Planejamento/Especificação","03.Desenvolvimento","04.Homologação","05.Ag. Publicação","06.Finalizado"];
  const canonFaseM=raw=>{
    const nr=norm(raw);
    const hit=FASE_M_CANON.find(c=>norm(c)===nr);
    return hit||String(raw||"").trim()||"(sem status)";
  };
  const fasM={};
  for(const r of allM){const s=canonFaseM(r[15]);fasM[s]=(fasM[s]||0)+1;}

  const atraso_mel=at_m.sort((a,b)=>(a[13]||0)-(b[13]||0)).map(r=>({lecom:String(r[1]||""),squad:stripPref(String(r[35]||"")),nome:String(r[7]||""),status:shortStatusM(r[15]),target:fmtDM(r[13]),np:"—"}));
  const prx_mel=er_m.map(r=>({lecom:String(r[1]||""),squad:stripPref(String(r[35]||"")),nome:String(r[7]||""),fase:"—",status:shortStatusM(r[15]),target:fmtDM(r[13]),np:"—"}));
  const bl_mel=allM.map(r=>({lecom:String(r[1]||""),squad:stripPref(String(r[35]||"")),nome:String(r[7]||""),status:shortStatusM(r[15]),target:fmtDate(r[13]),np:"—",fin:String(r[15]||"")==="06.Finalizado"}));

  const total_p=fin.length,total_m=allM.length,total_c=total_p+total_m;
  const at_c=at_p.length+at_m.length,er_c=er_p.length+er_m.length,np_c=np_p.length+np_m.length;
  const pct_p=total_p>0?Math.round(enc_p.length/total_p*1000)/10:0;
  const pct_m=total_m>0?Math.round(fin_m.length/total_m*1000)/10:0;
  // Arredondamento para inteiro: decimal >=5 sobe, <5 desce (Math.round padrão)
  const pct_p_int=Math.round(pct_p);
  const pct_m_int=Math.round(pct_m);
  const area=fin.length>0?String(fin[0][7]||"TI - Growth"):"TI - Growth";
  const diretor=fin.length>0?String(fin[0][9]||"Digital"):"Digital";

  const FASE_P_ORDER=["Solicitado","Planejamento","Execução","Piloto","Expansão","Monitoramento e Controle","Encerrado"];
  const FASE_M_ORDER=["01.Não Iniciado","02.Planejamento/Especificação","03.Desenvolvimento","04.Homologação","05.Ag. Publicação","06.Finalizado"];
  // Ordered canonical phases that exist + any leftover (unmapped) phases appended at end
  const orderedFasesP=[
    ...FASE_P_ORDER.filter(f=>fasP[f]).map(f=>[f,fasP[f]]),
    ...Object.keys(fasP).filter(f=>!FASE_P_ORDER.includes(f)).map(f=>[f,fasP[f]])
  ];
  const orderedFasesM=[
    ...FASE_M_ORDER.filter(f=>fasM[f]).map(f=>[f,fasM[f]]),
    ...Object.keys(fasM).filter(f=>!FASE_M_ORDER.includes(f)).map(f=>[f,fasM[f]])
  ];

  return {
    total_p,at_p:at_p.length,er_p:er_p.length,np_p:np_p.length,enc_p:enc_p.length,pct_p,
    total_m,at_m:at_m.length,er_m:er_m.length,np_m:np_m.length,fin_m:fin_m.length,pct_m,
    total_c,at_c,er_c,np_c,
    np_pct:pctFmt(np_c,total_c),er_pct:pctFmt(er_c,total_c),at_pct:pctFmt(at_c,total_c),
    pct_p_str:String(pct_p_int),pct_m_str:String(pct_m_int),
    fases_p:orderedFasesP,
    fases_m:orderedFasesM,
    squad_p:Object.entries(sqP).map(([n,v])=>[n,v.enc/v.total]),
    squad_m:Object.entries(sqM).map(([n,v])=>[n,v.fin/v.total]),
    atraso_proj,atraso_mel,prx_proj,prx_mel,bl_fin,bl_ea,bl_mel,
    area,diretor,lider
  };
}

/* ── XML CELL / ROW HELPERS ────────────────────────────────────────────────── */
function tc(text,{sz="900",bold=false,color=null,align="ctr",bg=null}={}){
  const fill=color?`<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`:`<a:solidFill><a:schemeClr val="tx1"><a:lumMod val="75000"/><a:lumOff val="25000"/></a:schemeClr></a:solidFill>`;
  const b=bold?" b=\"1\"":"",cf=bg?`<a:solidFill><a:srgbClr val="${bg}"/></a:solidFill>`:"<a:noFill/>";
  return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="${align}"/><a:r><a:rPr lang="pt-BR" sz="${sz}"${b} dirty="0">${fill}</a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></a:txBody><a:tcPr anchor="ctr"><a:lnL w="6350" cap="flat" cmpd="sng" algn="ctr"><a:noFill/><a:prstDash val="solid"/></a:lnL><a:lnR w="6350" cap="flat" cmpd="sng" algn="ctr"><a:noFill/><a:prstDash val="solid"/></a:lnR><a:lnT w="3175" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="bg1"><a:lumMod val="65000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/></a:lnT><a:lnB w="6350" cap="flat" cmpd="sng" algn="ctr"><a:noFill/><a:prstDash val="solid"/></a:lnB>${cf}</a:tcPr></a:tc>`;
}
function tr(cells,h="135560"){return `<a:tr h="${h}">${cells.join("")}</a:tr>`;}

const emptyRow6=(bg="FFFFFF")=>tr([tc("—",{bg}),tc("—",{bg}),tc("Sem dados",{align:"l",bg}),tc("—",{bg}),tc("—",{bg}),tc("—",{bg})]);
const emptyRow7=(bg="FFFFFF")=>tr([tc("—",{bg}),tc("—",{bg}),tc("Sem dados",{align:"l",bg}),tc("—",{bg}),tc("—",{bg}),tc("—",{bg}),tc("—",{bg})]);

function rowAtP(r,i,lim){const bg=rowBg(i),cc=r.target!=="—"?"C00000":null;
  return tr([tc(r.lecom,{sz:"800",bg}),tc(r.squad,{sz:"800",bg}),tc(trunc(r.nome,lim),{sz:"800",align:"l",bg}),tc(r.fase,{sz:"800",bg}),tc(r.target,{sz:"800",color:cc,bg}),tc(r.np,{sz:"800",bg})]);}
function rowAtM(r,i,lim){const bg=rowBg(i);
  return tr([tc(r.lecom,{sz:"800",bg}),tc(r.squad,{sz:"800",bg}),tc(trunc(r.nome,lim),{sz:"800",align:"l",bg}),tc(r.status,{sz:"800",bg}),tc(r.target,{sz:"800",color:"C00000",bg}),tc(r.np,{sz:"800",bg})]);}
function rowPrxP(r,i,lim){const bg=rowBg(i);
  return tr([tc(r.lecom,{sz:"800",bg}),tc(r.squad,{sz:"800",bg}),tc(trunc(r.nome,lim),{sz:"800",align:"l",bg}),tc(r.fase,{sz:"800",bg}),tc(r.target,{sz:"800",color:"ED7D31",bg}),tc(r.np,{sz:"800",bg})]);}
function rowPrxM(r,i,lim){const bg=rowBg(i);
  return tr([tc(r.lecom,{sz:"800",bg}),tc(r.squad,{sz:"800",bg}),tc(trunc(r.nome,lim),{sz:"800",align:"l",bg}),tc(r.status,{sz:"800",bg}),tc(r.target,{sz:"800",color:"ED7D31",bg}),tc(r.np,{sz:"800",bg})]);}
function rowProjBL(r,i,lim){
  const bg=rowBg(i),fc=r.enc?"00B050":null;
  const sc=r.status.toLowerCase().startsWith("atras")?"C00000":r.status.toLowerCase().startsWith("em risco")?"ED7D31":null;
  return tr([tc(r.lecom,{sz:"800",bg}),tc(r.squad,{sz:"800",bg}),tc(trunc(r.nome,lim),{sz:"800",align:"l",bg}),tc(r.fase,{sz:"800",color:fc,bold:r.enc,bg}),tc(r.status.slice(0,55),{sz:"800",color:sc,bold:!!sc,bg}),tc(r.target,{sz:"800",bg}),tc(r.np,{sz:"800",bg})]);}
function rowMelBL(r,i,lim){
  const bg=rowBg(i);
  return tr([tc(r.lecom,{sz:"800",bg}),tc(r.squad,{sz:"800",bg}),tc(trunc(r.nome,lim),{sz:"800",align:"l",bg}),tc(r.status,{sz:"800",color:r.fin?"00B050":null,bold:r.fin,bg}),tc(r.target,{sz:"800",bg}),tc(r.np,{sz:"800",bg})]);}

/* ── XML TABLE OPS ─────────────────────────────────────────────────────────── */
/* ── GEOMETRIA DO SLIDE 2 (medida diretamente no template, em EMU) ──────────
   Box "ENTREGAS EM ATRASO"  : Shape 91  y=2015316  cy=2206306
   Box "ENTREGAS PRÓXIMAS"   : Shape 201 y=4319656  cy=2202999
   Capacidade medida: 6 linhas de dados na box normal, 12 na esticada.
   ────────────────────────────────────────────────────────────────────────── */
const BOX_AT_Y      = 2015316;
const BOX_PX_Y      = 4319656;
const BOX_PX_CY     = 2202999;
const BOX_STRETCH_CY= (BOX_PX_Y + BOX_PX_CY) - BOX_AT_Y;  // 4507339
const BOX_DELTA_UP  = BOX_PX_Y - BOX_AT_Y;                // 2304340

const CAP_NORMAL  = 6;   // linhas de dados na box de tamanho original
const CAP_STRETCH = 12;  // linhas de dados na box esticada

const SH_AT_BOX="Shape 91",  SH_AT_BAR="Shape 93",  SH_AT_TXT="Text 94",  TB_AT="Tabela 44";
const SH_PX_BOX="Shape 201", SH_PX_BAR="Shape 203", SH_PX_TXT="Text 204", TB_PX="Tabela 45";

function findBlock(xml,tag,name){
  const re=new RegExp(`<p:${tag}>(?:(?!</p:${tag}>)[\\s\\S])*?name="${name}"(?:(?!</p:${tag}>)[\\s\\S])*?</p:${tag}>`);
  const m=xml.match(re);
  return m?{start:m.index,end:m.index+m[0].length,text:m[0]}:null;
}
function removeShape(xml,tag,name){
  const b=findBlock(xml,tag,name);
  return b?xml.slice(0,b.start)+xml.slice(b.end):xml;
}
function setShapeCy(xml,tag,name,cy){
  const b=findBlock(xml,tag,name); if(!b) return xml;
  const t=b.text.replace(/(<a:ext cx="\d+" cy=")\d+(")/,`$1${cy}$2`);
  return xml.slice(0,b.start)+t+xml.slice(b.end);
}
function shiftShapeY(xml,tag,name,dy){
  const b=findBlock(xml,tag,name); if(!b) return xml;
  const t=b.text.replace(/(<a:off x="-?\d+" y=")(-?\d+)(")/,(_,a,y,c)=>`${a}${parseInt(y,10)+dy}${c}`);
  return xml.slice(0,b.start)+t+xml.slice(b.end);
}
/* Estica a box de Atraso até a base da box de Próximas e remove Próximas. */
function stretchAtraso(xml){
  xml=setShapeCy(xml,"sp",SH_AT_BOX,BOX_STRETCH_CY);
  xml=removeShape(xml,"sp",SH_PX_BOX);
  xml=removeShape(xml,"sp",SH_PX_BAR);
  xml=removeShape(xml,"sp",SH_PX_TXT);
  xml=removeShape(xml,"graphicFrame",TB_PX);
  return xml;
}
/* Remove a box de Atraso e sobe Próximas para o slot de cima, esticada. */
function prxToTop(xml){
  xml=removeShape(xml,"sp",SH_AT_BOX);
  xml=removeShape(xml,"sp",SH_AT_BAR);
  xml=removeShape(xml,"sp",SH_AT_TXT);
  xml=removeShape(xml,"graphicFrame",TB_AT);
  for(const [tag,nm] of [["sp",SH_PX_BOX],["sp",SH_PX_BAR],["sp",SH_PX_TXT],["graphicFrame",TB_PX]])
    xml=shiftShapeY(xml,tag,nm,-BOX_DELTA_UP);
  xml=setShapeCy(xml,"sp",SH_PX_BOX,BOX_STRETCH_CY);
  return xml;
}
const setTitleAt =(xml,t)=>xml.replace("<a:t>ENTREGAS EM ATRASO</a:t>",`<a:t>${esc(t)}</a:t>`);
const setTitlePx =(xml,t)=>xml.replace("<a:t>ENTREGAS PRÓXIMAS</a:t>",`<a:t>${esc(t)}</a:t>`);

/* Matriz de textos das células — cada <a:tc> renderizada tem um <a:t>. */
function cellMatrix(rowsXml){
  return String(rowsXml||"").split("</a:tr>")
    .filter(s=>s.indexOf("<a:tc>")!==-1)
    .map(r=>[...r.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m=>m[1]));
}

/* Lê o cabeçalho por CÉLULA, concatenando runs — o template pode fragmentar
   "Target de entrega" em dois runs; varredura genérica de <a:t> desalinha. */
function headerCells(trXml,nCols){
  const out=new Array(nCols).fill("");
  const tcs=[...String(trXml||"").matchAll(/<a:tc(?:\s[^>]*?)?>[\s\S]*?<\/a:tc>/g)].map(m=>m[0]);
  let c=0;
  for(const tc of tcs){
    if(c>=nCols) break;
    const gs=parseInt((tc.match(/gridSpan="(\d+)"/)||[,"1"])[1],10);
    if(!/hMerge="1"/.test(tc))
      out[c]=[...tc.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(x=>x[1]).join("");
    c+=gs;
  }
  return out;
}

/* Redistribui os <a:gridCol>: cada coluna que não é "Projeto" encolhe até o
   que REALMENTE precisa (medido em Calibri: maior entre cabeçalho e maior dado),
   e toda a sobra vai para "Projeto". Nunca alarga uma coluna além do que tem.
   Retorna { xml, nomeW } — nomeW = largura final da coluna "Projeto" em EMU.
   A soma das larguras é preservada → o graphicFrame não muda. */
function fitNomeCol(xml, tblIdx, probeRowsXml){
  const pos=[]; let p=0;
  while(true){const f=xml.indexOf("<a:tbl>",p);if(f===-1)break;pos.push(f);p=f+1;}
  const tp=pos[tblIdx];
  if(tp===undefined) return {xml,nomeW:0};
  const te=xml.indexOf("</a:tbl>",tp)+8;
  const tbl=xml.slice(tp,te);

  const gm=tbl.match(/<a:tblGrid>[\s\S]*?<\/a:tblGrid>/);
  if(!gm) return {xml,nomeW:0};
  const cols=[...gm[0].matchAll(/<a:gridCol[^>]*\sw="(\d+)"/g)].map(m=>parseInt(m[1],10));
  if(cols.length<=NOME_COL) return {xml,nomeW:cols[NOME_COL]||0};

  const hs=tbl.indexOf("<a:tr"), he=tbl.indexOf("</a:tr>",hs)+7;
  const hdr=hs===-1?[]:headerCells(tbl.slice(hs,he),cols.length);
  const matrix=cellMatrix(probeRowsXml);

  const total=cols.reduce((a,b)=>a+b,0);
  const out=cols.slice();
  for(let c=0;c<cols.length;c++){
    if(c===NOME_COL) continue;
    let w=wStr(hdr[c]||"",HDR_K);
    for(const row of matrix) w=Math.max(w,wStr(row[c]||""));
    out[c]=Math.min(cols[c],Math.max(1,w));   // só encolhe
  }
  const nomeW=total-out.reduce((a,b,i)=>i===NOME_COL?a:a+b,0);
  if(nomeW<=cols[NOME_COL])                    // sem folga → não mexe
    return {xml,nomeW:cols[NOME_COL]};
  out[NOME_COL]=nomeW;

  let i=0;
  const newGrid=gm[0].replace(/(<a:gridCol[^>]*\sw=")(\d+)(")/g,(_,a,__,c)=>`${a}${out[i++]}${c}`);
  const newTbl=tbl.replace(gm[0],newGrid);
  return {xml:xml.slice(0,tp)+newTbl+xml.slice(te), nomeW};
}

function rebuildTable(xml,idx,rowsXml){
  const pos=[]; let p=0;
  while(true){const f=xml.indexOf("<a:tbl>",p);if(f===-1)break;pos.push(f);p=f+1;}
  const tp=pos[idx],te=xml.indexOf("</a:tbl>",tp)+8;
  const tbl=xml.slice(tp,te),hs=tbl.indexOf("<a:tr"),he=tbl.indexOf("</a:tr>",hs)+7;
  return xml.slice(0,tp)+tbl.slice(0,hs)+tbl.slice(hs,he)+"\n"+rowsXml+"\n</a:tbl>"+xml.slice(te);
}
function rebuildBL(xml,rowsXml){
  const tp=xml.indexOf("<a:tbl>"),te=xml.indexOf("</a:tbl>",tp)+8;
  const tbl=xml.slice(tp,te),hs=tbl.indexOf("<a:tr"),he=tbl.indexOf("</a:tr>",hs)+7;
  return xml.slice(0,tp)+tbl.slice(0,hs)+tbl.slice(hs,he)+"\n"+rowsXml+"\n</a:tbl>"+xml.slice(te);
}

/* ── CHART UPDATES ─────────────────────────────────────────────────────────── */
/* Insere blocos <c:dPt> na posição válida do schema OOXML:
   ordem em <c:ser>: idx, order, tx, spPr, invertIfNegative, dPt*, dLbls, cat, val
   → dPt deve vir DEPOIS de invertIfNegative e ANTES de dLbls/cat. */
function insertDPt(xml,dp){
  // 1) Remove todos os dPt existentes
  xml=xml.replace(/<c:dPt>[\s\S]*?<\/c:dPt>/g,"");
  if(!dp) return xml;
  // 2) Tenta inserir logo após <c:invertIfNegative .../> (auto-fechado ou com fechamento)
  if(/<c:invertIfNegative[^>]*\/>/.test(xml)){
    return xml.replace(/(<c:invertIfNegative[^>]*\/>)/,`$1${dp}`);
  }
  if(/<c:invertIfNegative[^>]*>[\s\S]*?<\/c:invertIfNegative>/.test(xml)){
    return xml.replace(/(<c:invertIfNegative[^>]*>[\s\S]*?<\/c:invertIfNegative>)/,`$1${dp}`);
  }
  // 3) Fallback: antes de <c:dLbls> se existir
  if(/<c:dLbls>/.test(xml)){
    return xml.replace(/<c:dLbls>/,`${dp}<c:dLbls>`);
  }
  // 4) Último fallback: antes de <c:cat>
  return xml.replace(/<c:cat>/,`${dp}<c:cat>`);
}
function updBar(xml,catVals,colors){
  const n=catVals.length,L=catVals.map(x=>x[0]),V=catVals.map(x=>x[1]);
  const cp=L.map((l,i)=>`<c:pt idx="${i}"><c:v>${esc(l)}</c:v></c:pt>`).join("");
  const vp=V.map((v,i)=>`<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("");
  const dp=colors.map((c,i)=>`<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:ln><a:noFill/></a:ln><a:effectLst/></c:spPr></c:dPt>`).join("");
  xml=xml.replace(/(<c:cat>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>([\s\S]*?<\/c:cat>)/,
    `$1<c:strCache><c:ptCount val="${n}"/>${cp}</c:strCache>$2`);
  xml=xml.replace(/(<c:val>[\s\S]*?)<c:numCache>[\s\S]*?<\/c:numCache>([\s\S]*?<\/c:val>)/,
    `$1<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${vp}</c:numCache>$2`);
  xml=insertDPt(xml,dp);
  return xml;
}
function updSquad(xml,sqPcts){
  const n=sqPcts.length,L=sqPcts.map(x=>x[0]),V=sqPcts.map(x=>x[1]);
  const cols=V.map(v=>v>=1?"00B050":"1F4E79");
  const cp=L.map((l,i)=>`<c:pt idx="${i}"><c:v>${esc(l)}</c:v></c:pt>`).join("");
  const vp=V.map((v,i)=>`<c:pt idx="${i}"><c:v>${v.toFixed(4)}</c:v></c:pt>`).join("");
  const dp=cols.map((c,i)=>`<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:ln><a:noFill/></a:ln><a:effectLst/></c:spPr></c:dPt>`).join("");
  xml=xml.replace(/(<c:cat>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>([\s\S]*?<\/c:cat>)/,
    `$1<c:strCache><c:ptCount val="${n}"/>${cp}</c:strCache>$2`);
  xml=xml.replace(/(<c:val>[\s\S]*?)<c:numCache>[\s\S]*?<\/c:numCache>([\s\S]*?<\/c:val>)/,
    `$1<c:numCache><c:formatCode>0%</c:formatCode><c:ptCount val="${n}"/>${vp}</c:numCache>$2`);
  xml=insertDPt(xml,dp);
  return xml;
}

/* ── PPTX GENERATION ───────────────────────────────────────────────────────── */
async function generatePptx(templateBuf,data){
  const zip=await JSZip.loadAsync(templateBuf);
  const rd=path=>zip.file(path)?.async("string")||Promise.resolve("");

  let presXml=await rd("ppt/presentation.xml");
  const sldIds=[...presXml.matchAll(/<p:sldId id="(\d+)" r:id="(rId\d+)"\/>/g)];
  const rids=sldIds.map(m=>m[2]);
  const ids=sldIds.map(m=>parseInt(m[1]));
  const [ridCapa,ridDash,ridFin,ridEA,ridMel,ridClose]=rids;

  let presRels=await rd("ppt/_rels/presentation.xml.rels");
  const existRidNums=[...presRels.matchAll(/Id="rId(\d+)"/g)].map(m=>parseInt(m[1]));
  let nextRidN=Math.max(...existRidNums)+1;
  let nextId=Math.max(...ids)+1;
  const existSlides=Object.keys(zip.files).filter(f=>/^ppt\/slides\/slide\d+\.xml$/.test(f)).map(f=>parseInt(f.match(/\d+/)[0]));
  let nextSlideN=Math.max(...existSlides)+1;

  function newIds(){
    const rid=`rId${nextRidN++}`,id=nextId++,num=nextSlideN++;
    return {rid,id,num};
  }
  function insertAfterRid(pXml,afterRid,newId,newRid){
    const i=pXml.indexOf(`r:id="${afterRid}"`);
    if(i===-1) return pXml;
    const end=pXml.indexOf("/>",i)+2;
    return pXml.slice(0,end)+`\n    <p:sldId id="${newId}" r:id="${newRid}"/>`+pXml.slice(end);
  }
  /* Índices livres para novas partes de gráfico */
  const existCharts=Object.keys(zip.files).filter(f=>/^ppt\/charts\/chart\d+\.xml$/.test(f)).map(f=>parseInt(f.match(/\d+/)[0]));
  let nextChartN=(existCharts.length?Math.max(...existCharts):0)+1;
  let nextEmbedN=0;

  /* Duplica chartN.xml + style + colors + planilha embutida.
     Necessário porque uma parte de gráfico não pode ser referenciada
     por dois slides (o PowerPoint acusa "conteúdo com problema"). */
  async function cloneChart(srcChartPath){
    const srcN=parseInt(srcChartPath.match(/chart(\d+)\.xml$/)[1]);
    const dstN=nextChartN++;
    zip.file(`ppt/charts/chart${dstN}.xml`, await rd(`ppt/charts/chart${srcN}.xml`));

    let cRels=await rd(`ppt/charts/_rels/chart${srcN}.xml.rels`);
    // style + colors
    for(const kind of ["style","colors"]){
      if(zip.files[`ppt/charts/${kind}${srcN}.xml`]){
        zip.file(`ppt/charts/${kind}${dstN}.xml`, await rd(`ppt/charts/${kind}${srcN}.xml`));
        cRels=cRels.replace(new RegExp(`Target="${kind}${srcN}\\.xml"`),`Target="${kind}${dstN}.xml"`);
      }
    }
    // planilha embutida
    const emb=cRels.match(/Target="\.\.\/embeddings\/([^"]+)"/);
    if(emb){
      const srcEmb=`ppt/embeddings/${emb[1]}`;
      if(zip.files[srcEmb]){
        const dstEmb=`_ras_clone_${nextEmbedN++}_${emb[1]}`;
        zip.file(`ppt/embeddings/${dstEmb}`, await zip.file(srcEmb).async("arraybuffer"));
        cRels=cRels.replace(emb[0],`Target="../embeddings/${dstEmb}"`);
      }
    }
    zip.file(`ppt/charts/_rels/chart${dstN}.xml.rels`,cRels);
    return dstN;
  }

  async function addSlide(srcNum,{num,rid,id},afterRid){
    const srcXml=await rd(`ppt/slides/slide${srcNum}.xml`);
    zip.file(`ppt/slides/slide${num}.xml`,srcXml);

    let rels=await rd(`ppt/slides/_rels/slide${srcNum}.xml.rels`);
    // notesSlide aponta de volta para o slide original → descartar no clone
    rels=rels.replace(/<Relationship[^>]*Type="[^"]*\/notesSlide"[^>]*\/>/g,"");

    // deep clone de cada gráfico referenciado
    const chartRels=[...rels.matchAll(/<Relationship Id="([^"]+)" Type="[^"]*\/chart" Target="([^"]+)"\/>/g)];
    const newParts=[];
    for(const m of chartRels){
      const dstN=await cloneChart(m[2]);
      rels=rels.replace(m[0],`<Relationship Id="${m[1]}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${dstN}.xml"/>`);
      newParts.push(dstN);
    }
    zip.file(`ppt/slides/_rels/slide${num}.xml.rels`,rels);

    let ct=await rd("[Content_Types].xml");
    let ov=`<Override PartName="/ppt/slides/slide${num}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    for(const n of newParts){
      ov+=`<Override PartName="/ppt/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`;
      if(zip.files[`ppt/charts/style${n}.xml`])  ov+=`<Override PartName="/ppt/charts/style${n}.xml" ContentType="application/vnd.ms-office.chartstyle+xml"/>`;
      if(zip.files[`ppt/charts/colors${n}.xml`]) ov+=`<Override PartName="/ppt/charts/colors${n}.xml" ContentType="application/vnd.ms-office.chartcolorstyle+xml"/>`;
    }
    ct=ct.replace("</Types>",ov+"</Types>");
    zip.file("[Content_Types].xml",ct);

    presRels=presRels.replace("</Relationships>",`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${num}.xml"/></Relationships>`);
    presXml=insertAfterRid(presXml,afterRid,id,rid);
    return num;
  }

  let s1=await rd("ppt/slides/slide1.xml");
  s1=s1.replace("<a:t>Marketing \u2013 Projetos Corporativos</a:t>","<a:t>TI - Growth \u2013 Projetos e Melhorias</a:t>");
  zip.file("ppt/slides/slide1.xml",s1);

  /* Os gráficos precisam ser atualizados ANTES do slide 2, porque os slides
     de continuação clonam as partes de gráfico já com os dados preenchidos. */
  let c1=await rd("ppt/charts/chart1.xml");
  c1=updBar(c1,data.fases_p,data.fases_p.map(([l])=>FASES_P_COL[l]||"7F7F7F"));
  zip.file("ppt/charts/chart1.xml",c1);
  let c2=await rd("ppt/charts/chart2.xml");
  c2=updSquad(c2,data.squad_p);
  zip.file("ppt/charts/chart2.xml",c2);
  let c3=await rd("ppt/charts/chart3.xml");
  const fasesMDisplay=data.fases_m.map(([l,v])=>[String(l).replace(/^\s*\d{1,2}\.\s*/,"").trim(),v]);
  const fasesMColors=data.fases_m.map(([l])=>FASES_M_COL[l]||"9E9E9E");
  c3=updBar(c3,fasesMDisplay,fasesMColors);
  zip.file("ppt/charts/chart3.xml",c3);
  let c4=await rd("ppt/charts/chart4.xml");
  c4=updSquad(c4,data.squad_m);
  zip.file("ppt/charts/chart4.xml",c4);

  let s2=await rd("ppt/slides/slide2.xml");
  const repls=[
    ["<a:t>47</a:t>",`<a:t>${data.total_c}</a:t>`],
    ["<a:t>28</a:t>",`<a:t>${data.np_c}</a:t>`],
    ["<a:t>60% do total</a:t>",`<a:t>${data.np_pct}% do total</a:t>`],
    ["<a:t>15</a:t>",`<a:t>${data.er_c}</a:t>`],
    ["<a:t>32% do total</a:t>",`<a:t>${data.er_pct}% do total</a:t>`],
    ["<a:t>4</a:t>",`<a:t>${data.at_c}</a:t>`],
    ["<a:t>8% do total</a:t>",`<a:t>${data.at_pct}% do total</a:t>`],
    ["<a:t>FASES - PROJETOS FINALIZA\u00c7\u00c3O [ TOTAL 30 ]</a:t>",`<a:t>FASES - PROJETOS FINALIZA\u00c7\u00c3O [ TOTAL ${data.total_p} ]</a:t>`],
    ["<a:t>FASES - MELHORIAS [TOTAL 30 ]</a:t>",`<a:t>FASES - MELHORIAS [ TOTAL ${data.total_m} ]</a:t>`],
    ["<a:t>\u00c1rea Executora:</a:t>",`<a:t>\u00c1rea Executora: ${data.area}</a:t>`],
    ["<a:t>Diretor Executor:</a:t>",`<a:t>Diretor Executor: ${data.diretor}</a:t>`],
    ["<a:t>L\u00edder Executor:</a:t>",`<a:t>L\u00edder Executor: ${data.lider}</a:t>`],
  ];
  for(const [o,n] of repls) s2=s2.replace(o,n);
  s2=s2.replace("<a:t>14%</a:t>",`<a:t>${data.pct_p_str}%</a:t>`);
  s2=s2.replace("<a:t>14%</a:t>",`<a:t>${data.pct_m_str}%</a:t>`);

  /* ── PAGINAÇÃO DO SLIDE 2 (greedy) ───────────────────────────────────────
     Atraso ≤ 6  → box normal, Próximas logo abaixo.
     Atraso > 6  → box de Atraso esticada (12 linhas), Próximas removida e
                   empurrada para o próximo slide. Repete até sobrar ≤ 6.
     Próximas > 6 → mesma lógica, em slides próprios (box sobe para o topo).
     ─────────────────────────────────────────────────────────────────────── */
  const atItems=[
    ...data.atraso_proj.map(r=>({r,f:rowAtP})),
    ...data.atraso_mel.map(r=>({r,f:rowAtM})),
  ];
  const pxItems=[
    ...data.prx_proj.map(r=>({r,f:rowPrxP})),
    ...data.prx_mel.map(r=>({r,f:rowPrxM})),
  ];
  const renderRows=(items,lim)=>items.length?items.map((it,i)=>it.f(it.r,i,lim)).join("\n"):emptyRow6();
  /* Duas passadas: a 1ª sem truncar serve só para MEDIR as outras colunas;
     a 2ª renderiza de verdade com o limite da coluna "Projeto" já alargada. */
  const fillTable=(xml,idx,items)=>{
    if(!items.length) return rebuildTable(xml,idx,emptyRow6());
    const fit=fitNomeCol(xml,idx,renderRows(items,Infinity));   // 1ª passada: mede
    return rebuildTable(fit.xml,idx,renderRows(items,Infinity)); // 2ª: nome COMPLETO, sem cortar
  };

  function greedyChunks(items){
    const out=[];
    if(items.length<=CAP_NORMAL){ out.push({items,stretched:false}); return out; }
    let i=0;
    while(items.length-i>CAP_NORMAL){ out.push({items:items.slice(i,i+CAP_STRETCH),stretched:true}); i+=CAP_STRETCH; }
    if(items.length-i>0) out.push({items:items.slice(i),stretched:false});
    return out;
  }

  const atChunks=greedyChunks(atItems);
  const lastAtNormal=!atChunks[atChunks.length-1].stretched;

  // Próximas: cabe no último slide de Atraso? o resto vira slide próprio.
  let pxInLastAt=[], pxAlone=[];
  if(lastAtNormal){
    pxInLastAt=pxItems.slice(0,CAP_NORMAL);
    const rest=pxItems.slice(CAP_NORMAL);
    for(let i=0;i<rest.length;i+=CAP_STRETCH) pxAlone.push(rest.slice(i,i+CAP_STRETCH));
  }else{
    if(pxItems.length===0) pxAlone.push([]);
    for(let i=0;i<pxItems.length;i+=CAP_STRETCH) pxAlone.push(pxItems.slice(i,i+CAP_STRETCH));
  }

  const s2base=s2;
  zip.file("ppt/slides/slide2.xml",s2base);   // base para os clones

  let lastDashRid=ridDash;
  const targets=[{num:2}];
  const totalExtra=(atChunks.length-1)+pxAlone.length;
  for(let i=0;i<totalExtra;i++){
    const nid=newIds();
    const num=await addSlide(2,nid,lastDashRid);
    lastDashRid=nid.rid;
    targets.push({num});
  }

  let t=0;
  // slides de Atraso
  for(let k=0;k<atChunks.length;k++){
    const ch=atChunks[k];
    let xml=s2base;
    if(k>0) xml=setTitleAt(xml,"ENTREGAS EM ATRASO (cont.)");
    xml=fillTable(xml,0,ch.items);
    if(ch.stretched){
      xml=stretchAtraso(xml);
    }else{
      xml=fillTable(xml,1,pxInLastAt);
    }
    zip.file(`ppt/slides/slide${targets[t++].num}.xml`,xml);
  }
  // slides só de Próximas
  for(let k=0;k<pxAlone.length;k++){
    let xml=s2base;
    const first=lastAtNormal?false:(k===0);
    if(!first) xml=setTitlePx(xml,"ENTREGAS PRÓXIMAS (cont.)");
    xml=prxToTop(xml);                       // remove Atraso, sobe Próximas
    xml=fillTable(xml,0,pxAlone[k]);
    zip.file(`ppt/slides/slide${targets[t++].num}.xml`,xml);
  }

  /* ── BACKLOGS (slides 3, 4 e 5) ──────────────────────────────────────────
     Paginação sem teto: antes o slide 4 cortava em 20 sem continuação e os
     slides 3/5 paravam em 60 — em ambos os casos o excedente sumia calado. */
  const BL_PER_SLIDE=20;
  async function paginateBL(srcNum,startRid,items,rowFn,emptyXml){
    const pages=items.length?Math.ceil(items.length/BL_PER_SLIDE):1;
    let lastRid=startRid;
    for(let p=0;p<pages;p++){
      let num=srcNum;
      if(p>0){ const nid=newIds(); num=await addSlide(srcNum,nid,lastRid); lastRid=nid.rid; }
      let xml=await rd(`ppt/slides/slide${num}.xml`);
      const slice=items.slice(p*BL_PER_SLIDE,(p+1)*BL_PER_SLIDE);
      let rowsXml=emptyXml;
      if(slice.length){
        // mede com os nomes inteiros; renderiza COMPLETO (igual slide 2)
        const fit=fitNomeCol(xml,0,slice.map((r,i)=>rowFn(r,i,Infinity)).join("\n"));
        xml=fit.xml;
        rowsXml=slice.map((r,i)=>rowFn(r,i,Infinity)).join("\n");
      }
      xml=rebuildBL(xml,rowsXml);
      zip.file(`ppt/slides/slide${num}.xml`,xml);
    }
  }

  const emptyEA=tr([tc("—",{sz:"800",bg:"FFFFFF"}),tc("—",{sz:"800",bg:"FFFFFF"}),tc("Nenhum projeto de Especificação/Andamento",{sz:"800",align:"l",bg:"FFFFFF"}),tc("—",{sz:"800",bg:"FFFFFF"}),tc("—",{sz:"800",bg:"FFFFFF"}),tc("—",{sz:"800",bg:"FFFFFF"}),tc("—",{sz:"800",bg:"FFFFFF"})]);

  await paginateBL(3,ridFin,data.bl_fin,rowProjBL,emptyRow7());
  await paginateBL(4,ridEA, data.bl_ea, rowProjBL,emptyEA);
  await paginateBL(5,ridMel,data.bl_mel,rowMelBL, emptyRow6());

  zip.file("ppt/presentation.xml",presXml);
  zip.file("ppt/_rels/presentation.xml.rels",presRels);

  return zip.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.presentationml.presentation",compression:"DEFLATE"});
}

/* ── STORAGE: o template fica no Supabase Storage ──────────────────────────
   Funções de carregamento estão em ./supabaseClient.js:
   - loadRasTemplate() → ArrayBuffer do .pptx atual
   - getRasTemplateInfo() → { name, updatedAt, size }
   ────────────────────────────────────────────────────────────────────────── */

/* ── STYLES ─────────────────────────────────────────────────────────────────── */
const S = {
  // Layout
  page: {
    fontFamily:"'Inter',system-ui,sans-serif",
    fontSize:14,
    color:"#071735",
    background:"#f5f7fb",
    minHeight:"100vh",
    margin:0,
  },
  container: {
    maxWidth:900,
    margin:"0 auto",
    padding:"0 28px 48px",
  },
  // Header
  header: {
    height:80,
    background:"linear-gradient(90deg,#001b4d,#003d8f)",
    display:"flex",
    justifyContent:"space-between",
    alignItems:"center",
    padding:"0 40px",
    marginBottom:0,
  },
  headerLeft: { display:"flex",alignItems:"center",gap:20 },
  headerRight: { display:"flex",alignItems:"center",gap:12 },
  headerDivider: { width:1,height:40,background:"rgba(255,255,255,0.35)" },
  headerBrand: { fontSize:18,fontWeight:700,color:"#fff" },
  headerBrandAccent: { color:"#ff7900" },
  // Hero
  hero: {
    marginTop:28,
    height:150,
    background:"linear-gradient(90deg,#001b4d,#003d8f)",
    borderRadius:18,
    padding:"0 44px",
    display:"flex",
    alignItems:"center",
    justifyContent:"space-between",
    color:"#fff",
    boxShadow:"0 15px 35px rgba(0,0,0,0.15)",
  },
  heroLeft: { display:"flex",gap:28,alignItems:"center" },
  heroIcon: {
    width:68,height:68,
    borderRadius:14,
    background:"rgba(255,255,255,0.15)",
    display:"flex",alignItems:"center",justifyContent:"center",
    fontSize:30,flexShrink:0,
  },
  heroTitle: { fontSize:26,fontWeight:700,margin:0 },
  heroSub: { fontSize:14,opacity:0.88,marginTop:8 },
  // Info banner
  infoBanner: {
    marginTop:20,
    padding:"14px 22px",
    borderRadius:12,
    border:"1px solid #c9daf5",
    background:"#eef5ff",
    color:"#003d8f",
    fontSize:13,
    lineHeight:1.65,
    display:"flex",gap:10,alignItems:"flex-start",
  },
  // Cards
  card: {
    marginTop:20,
    background:"#fff",
    borderRadius:18,
    padding:"28px 32px",
    boxShadow:"0 6px 24px rgba(0,0,0,0.07)",
  },
  cardTitle: {
    display:"flex",alignItems:"center",gap:16,
    marginBottom:24,
  },
  cardNum: {
    width:34,height:34,borderRadius:"50%",
    background:"#001b4d",color:"#fff",
    display:"flex",alignItems:"center",justifyContent:"center",
    fontWeight:700,fontSize:15,flexShrink:0,
  },
  cardH2: { fontSize:17,fontWeight:700,margin:0 },
  cardSub: { fontSize:13,fontWeight:400,color:"#526070",marginLeft:8 },
  // Upload box
  uploadBox: {
    display:"inline-flex",
    alignItems:"center",
    gap:14,
    height:68,
    padding:"0 22px",
    border:"1px solid #ccd6e4",
    borderRadius:12,
    cursor:"pointer",
    background:"#fff",
    userSelect:"none",
    fontSize:14,
    fontWeight:500,
    color:"#003d8f",
    transition:"border-color 0.15s",
  },
  fileIcon: {
    width:40,height:40,
    background:"#008c35",
    color:"#fff",
    borderRadius:8,
    display:"flex",alignItems:"center",justifyContent:"center",
    fontWeight:800,fontSize:16,flexShrink:0,
  },
  // Form
  formGrid: { display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:24 },
  label: { display:"block",fontSize:13,color:"#526070",fontWeight:600,marginBottom:8 },
  input: {
    width:"100%",height:44,
    border:"1px solid #ccd6e4",borderRadius:10,
    padding:"0 14px",fontSize:15,
    outline:"none",boxSizing:"border-box",
  },
  select: {
    width:"100%",height:44,
    border:"1px solid #ccd6e4",borderRadius:10,
    padding:"0 14px",fontSize:15,
    outline:"none",background:"#fff",
  },
  // Actions
  actions: {
    display:"flex",gap:16,
    marginTop:28,paddingTop:24,
    borderTop:"1px solid #e5eaf1",
  },
  btnPreview: {
    flex:1,height:52,borderRadius:10,
    border:"1px solid #ccd6e4",
    background:"#fff",color:"#003d8f",
    fontWeight:700,fontSize:16,cursor:"pointer",
  },
  btnGenerate: {
    flex:2,height:52,borderRadius:10,
    border:"none",
    background:"#003d8f",color:"#fff",
    fontWeight:700,fontSize:16,cursor:"pointer",
  },
  btnGenerateDisabled: {
    flex:2,height:52,borderRadius:10,
    border:"1px solid #ccd6e4",
    background:"#f0f2f5",color:"#99a3b0",
    fontWeight:700,fontSize:16,cursor:"not-allowed",
  },
  btnPreviewDisabled: {
    flex:1,height:52,borderRadius:10,
    border:"1px solid #ccd6e4",
    background:"#f0f2f5",color:"#99a3b0",
    fontWeight:700,fontSize:16,cursor:"not-allowed",
  },
  // Status badge
  badge: (ok)=>({
    padding:"6px 14px",borderRadius:8,
    border:`1px solid ${ok?"#22c55e":"#f59e0b"}`,
    color:ok?"#22c55e":"#f59e0b",
    fontWeight:700,fontSize:13,
  }),
  // Message
  msg: (type)=>({
    marginTop:16,padding:"12px 18px",borderRadius:10,fontSize:13,
    background:type==="err"?"#fce8e8":type==="ok"?"#e1f5ee":type==="warn"?"#fff7e6":"#eef5ff",
    color:type==="err"?"#a32d2d":type==="ok"?"#0f6e56":type==="warn"?"#854f0b":"#003d8f",
    border:`1px solid ${type==="err"?"#f5c2c2":type==="ok"?"#b7e4cc":type==="warn"?"#fcd98a":"#c9daf5"}`,
  }),
  // Preview
  preview: {
    marginTop:20,
    background:"#fff",
    borderRadius:18,
    padding:"24px 28px",
    boxShadow:"0 6px 24px rgba(0,0,0,0.07)",
  },
  previewTitle: {
    fontSize:14,fontWeight:700,color:"#526070",
    marginBottom:20,display:"flex",alignItems:"center",gap:8,
  },
  kpiGrid: { display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20 },
  kpiBox: (color)=>({
    background:"#f8faff",borderRadius:12,
    padding:"16px 12px",textAlign:"center",
    border:`1px solid #e5eaf1`,
  }),
  kpiLabel: { fontSize:11,color:"#526070",fontWeight:600,letterSpacing:"0.04em",marginBottom:6 },
  kpiValue: (color)=>({ fontSize:28,fontWeight:800,color,lineHeight:1 }),
  kpiPct: { fontSize:11,color:"#526070",marginTop:4 },
  infoGrid: { display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16 },
  infoBox: {
    background:"#f8faff",borderRadius:12,padding:"14px 16px",
    border:"1px solid #e5eaf1",
  },
  infoBoxTitle: { fontWeight:700,fontSize:13,marginBottom:8,color:"#071735" },
  infoRow: { fontSize:12,color:"#526070",marginBottom:4 },
  // Chips
  chipRed: { fontSize:11,background:"#fce8e8",color:"#a32d2d",padding:"3px 9px",borderRadius:6 },
  chipOrange: { fontSize:11,background:"#fff3e0",color:"#854f0b",padding:"3px 9px",borderRadius:6 },
  sectionLabel: (color)=>({ fontSize:13,fontWeight:700,color,marginBottom:8,display:"flex",alignItems:"center",gap:6 }),
};


/* ── SVG ICONS ───────────────────────────────────────────────────────────────── */
/* ── REACT COMPONENT ───────────────────────────────────────────────────────── */
export default function ReportRasScreen({ onVoltar }){
  const { profile, signOut } = useAuth();

  const [tpl,setTpl]=useState(null);              // { buf } — template carregado
  const [tplInfo,setTplInfo]=useState(null);      // { name, updatedAt, size }
  const [tplLoading,setTplLoading]=useState(true);
  const [tplError,setTplError]=useState(null);

  const [portBuf,setPortBuf]=useState(null);
  const [melBuf,setMelBuf]=useState(null);
  const [melSheetName,setMelSheetName]=useState(null); // aba auto-detectada
  const [portName,setPortName]=useState(null);
  const [melName,setMelName]=useState(null);
  const [portStatus,setPortStatus]=useState({state:"idle",msg:""});
  const [melStatus,setMelStatus]=useState({state:"idle",msg:""});
  const [liders,setLiders]=useState([]);
  const [params,setParams]=useState({lider:"",trimestre:"2T26",compromisso:"Finalização"});
  const [preview,setPreview]=useState(null);
  const [busy,setBusy]=useState(false);
  const [genStatus,setGenStatus]=useState({state:"idle",msg:"",file:""});
  const [previewing,setPreviewing]=useState(false);
  const [msg,setMsg]=useState({text:"",type:"info"});

  // ── Carregar template do Supabase Storage ao montar ──
  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        const [bufResult,infoResult]=await Promise.all([
          loadRasTemplate(),
          getRasTemplateInfo(),
        ]);
        if(!alive) return;
        if(bufResult){
          setTpl({buf:bufResult});
          setTplInfo(infoResult);
          setTplError(null);
        }else{
          setTplError("Template não encontrado no Supabase Storage. Avise a equipe de Governança para fazer upload em templates/ras/report_ras_template.pptx.");
        }
      }catch(e){
        if(!alive) return;
        setTplError(`Erro ao carregar template: ${e.message||"verifique conexão."}`);
      }finally{
        if(alive) setTplLoading(false);
      }
    })();

    // Inject Inter font + spinner keyframe (uma vez, no mount do componente)
    const l=document.createElement("link");
    l.rel="stylesheet";
    l.href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
    if(!document.getElementById("ras-spin-css")){
      const st=document.createElement("style");
      st.id="ras-spin-css";
      st.textContent="@keyframes ras-spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(st);
    }

    return ()=>{ alive=false; };
  },[]);

  const onXlsx=(setter,nameSetter,statusSetter,expectedSheet,extractLiders,sheetNameSetter)=>async e=>{
    const f=e.target.files[0]; if(!f) return;
    nameSetter(f.name);
    setPreview(null);
    setGenStatus({state:"idle",msg:"",file:""});
    statusSetter({state:"loading",msg:"Lendo arquivo…"});
    try{
      const buf=await f.arrayBuffer();
      const wb=XLSX.read(new Uint8Array(buf),{type:"array"});

      // Detecta a aba esperada — suporta auto-detecção quando expectedSheet vier null
      let foundSheet=null;
      if(expectedSheet){
        if(wb.Sheets[expectedSheet]) foundSheet=expectedSheet;
      }else{
        // Auto-detecção: procura aba que começa com "Melhorias "
        foundSheet=wb.SheetNames.find(n=>/^melhorias\s/i.test(n));
      }

      if(!foundSheet){
        const abas=wb.SheetNames.join(", ");
        const expectedDesc=expectedSheet||'que comece com "Melhorias "';
        statusSetter({state:"error",msg:`Aba ${expectedDesc} não encontrada. Abas no arquivo: ${abas||"nenhuma"}.`});
        setter(null);
        if(sheetNameSetter) sheetNameSetter(null);
        return;
      }

      setter(buf);
      if(sheetNameSetter) sheetNameSetter(foundSheet);

      if(extractLiders){
        const ws=wb.Sheets[foundSheet];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null}).slice(2);
        const seen=new Set();
        rows.forEach(r=>{
          if(!r[8]) return;
          String(r[8]).split("/").forEach(n=>{const t=n.trim();if(t) seen.add(t);});
        });
        setLiders([...seen].sort());

        // Auditoria — import do Portfólio
        try{
          await logAudit({
            action:'IMPORT_RAS_PORTFOLIO',
            entity:'xlsx',
            detail:{ file_name:f.name, total_rows:rows.length, liders_count:seen.size }
          });
        }catch(_){}
        statusSetter({state:"ok",msg:`Portfólio carregado · ${rows.length} linhas · ${seen.size} líderes.`});
      }else{
        // Auditoria — import de Melhorias
        try{
          const ws=wb.Sheets[foundSheet];
          const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
          await logAudit({
            action:'IMPORT_RAS_MELHORIAS',
            entity:'xlsx',
            detail:{ file_name:f.name, sheet_name:foundSheet, total_rows:rows.length }
          });
        }catch(_){}
        statusSetter({state:"ok",msg:`Melhorias carregadas · aba detectada: "${foundSheet}".`});
      }
    }catch(err){
      statusSetter({state:"error",msg:`Erro ao ler o arquivo: ${err.message||"arquivo inválido ou corrompido."}`});
      setter(null);
      if(sheetNameSetter) sheetNameSetter(null);
    }
  };
  const onParam=k=>e=>setParams(p=>({...p,[k]:e.target.value}));

  const doPreview=()=>{
    if(!portBuf||!melBuf){setMsg({text:"Envie os dois arquivos xlsx.",type:"err"});return;}
    if(!melSheetName){setMsg({text:"Aba de Melhorias não detectada.",type:"err"});return;}
    setPreviewing(true);
    setMsg({text:"",type:"info"});
    setTimeout(()=>{
      try{
        const d=processData(portBuf,melBuf,melSheetName,params.lider,params.trimestre,params.compromisso);
        setPreview(d);
      }catch(e){setMsg({text:`Erro nos dados: ${e.message}`,type:"err"});}
      setPreviewing(false);
    },30);
  };

  const doGenerate=async()=>{
    if(!tpl){setGenStatus({state:"error",msg:"Template não disponível. Avise a equipe de Governança.",file:""});return;}
    if(!portBuf||!melBuf){setGenStatus({state:"error",msg:"Envie os dois arquivos xlsx antes de gerar.",file:""});return;}
    if(!melSheetName){setGenStatus({state:"error",msg:"Aba de Melhorias não foi detectada — reenvie o arquivo.",file:""});return;}
    if(!params.lider){setGenStatus({state:"error",msg:"Selecione o Líder Executor.",file:""});return;}
    setBusy(true);
    setGenStatus({state:"loading",msg:"Processando dados dos arquivos xlsx…",file:""});
    try{
      // Stage 1 — process Excel data
      let d;
      try{
        d=preview||processData(portBuf,melBuf,melSheetName,params.lider,params.trimestre,params.compromisso);
        setPreview(d);
      }catch(err){
        throw new Error(`ao processar os dados: ${err.message}`);
      }

      // Stage 2 — build the PPTX
      setGenStatus({state:"loading",msg:"Montando o PowerPoint a partir do template…",file:""});
      let blob;
      try{
        blob=await generatePptx(tpl.buf,d);
      }catch(err){
        throw new Error(`ao montar o PPTX (verifique se o template no Supabase é o V7_2 correto): ${err.message}`);
      }

      // Stage 3 — prepare and trigger the download
      setGenStatus({state:"loading",msg:"Preparando o arquivo para download…",file:""});
      const t=new Date();
      const dd=t.getDate().toString().padStart(2,"0"),mm=(t.getMonth()+1).toString().padStart(2,"0"),yyyy=t.getFullYear();
      const fn=`StatusReport_${params.lider.replace(/\s+/g,"")}_${dd}-${mm}-${yyyy}.pptx`;
      try{
        const arrayBuf=await blob.arrayBuffer();
        const bytes=new Uint8Array(arrayBuf);
        let binary="";
        const chunkSize=8192;
        for(let i=0;i<bytes.length;i+=chunkSize){
          binary+=String.fromCharCode.apply(null,bytes.subarray(i,i+chunkSize));
        }
        const b64=btoa(binary);
        const dataUrl="data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,"+b64;
        const a=document.createElement("a");
        a.href=dataUrl;
        a.download=fn;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }catch(err){
        throw new Error(`ao preparar o download: ${err.message}`);
      }

      // Auditoria — geração de PPTX
      try{
        await logAudit({
          action:'GENERATE_PPTX_RAS',
          entity:'pptx',
          entityId:fn,
          detail:{
            lider:params.lider,
            trimestre:params.trimestre,
            compromisso:params.compromisso,
            total_projetos:d.total_p,
            total_melhorias:d.total_m,
            atrasados:d.at_c,
          }
        });
      }catch(_){}

      setGenStatus({state:"ok",msg:"Download concluído com sucesso.",file:fn});
    }catch(e){
      setGenStatus({state:"error",msg:`Erro ${e.message}`,file:""});
    }
    setBusy(false);
  };

  const canGen=!!(tpl&&portBuf&&melBuf&&!busy&&!previewing);
  const canPrev=!!(portBuf&&melBuf&&!busy&&!previewing);

  // Iniciais para o avatar do header
  const iniciais=(profile?.name||profile?.email||'US')
    .split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase().slice(0,2);

  return (
    <div style={S.page}>
      {/* ── HEADER PADRÃO PLATAFORMA HAPVIDA ── */}
      <header style={{
        height:80,
        background:'linear-gradient(90deg,#001b4d,#003d8f)',
        display:'flex',
        justifyContent:'space-between',
        alignItems:'center',
        padding:'0 40px',
      }}>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <img src="/logo-hapvida.png" alt="Hapvida" style={{height:36}}/>
          <div style={{width:1,height:40,background:'rgba(255,255,255,0.35)'}}/>
          <span style={{fontSize:16,fontWeight:700,color:'#fff'}}>
            Plataforma | <span style={{color:'#ff7900'}}>Governança TI</span>
          </span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{display:'flex',alignItems:'center',gap:10,color:'#fff'}}>
            <div style={{
              width:38,height:38,borderRadius:'50%',
              border:'2px solid rgba(255,255,255,0.6)',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontWeight:700,fontSize:13,
              background:'rgba(255,255,255,0.12)',
            }}>{iniciais}</div>
            <div style={{fontSize:13}}>
              <div style={{fontWeight:600}}>{profile?.name||'Usuário'}</div>
              <div style={{opacity:0.75,fontSize:11}}>{profile?.email}</div>
            </div>
          </div>
          <button onClick={signOut} style={{
            background:'rgba(255,255,255,0.1)',
            border:'1px solid rgba(255,255,255,0.2)',
            color:'#fff',
            borderRadius:8,
            padding:'7px 14px',
            fontSize:12,
            fontWeight:600,
            cursor:'pointer',
            display:'flex',alignItems:'center',gap:5,
          }}>
            <LogOut size={13}/> Sair
          </button>
        </div>
      </header>

      <div style={S.container}>
        {/* ── BREADCRUMB / VOLTAR ── */}
        <div style={{padding:'18px 0 0'}}>
          <button onClick={onVoltar} style={{
            background:'transparent',border:'none',color:'#003d8f',
            fontWeight:600,fontSize:14,cursor:'pointer',
            display:'inline-flex',alignItems:'center',gap:6,padding:'6px 0',
          }}>
            <ChevronLeft size={18}/> Voltar ao início
          </button>
        </div>

        {/* ── HERO ── */}
        <div style={S.hero}>
          <div style={S.heroLeft}>
            <div style={S.heroIcon}>{<BarChart2 size={30} color='#fff' />}</div>
            <div>
              <h1 style={S.heroTitle}>Atualizar RAS</h1>
              <p style={S.heroSub}>Reunião de Acompanhamento Semanal · Status Report Executivo</p>
            </div>
          </div>
          {preview&&(
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:13,opacity:0.8,marginBottom:4}}>Última pré-visualização</div>
              <div style={{fontSize:16,fontWeight:700}}>{preview.lider}</div>
              <div style={{fontSize:13,opacity:0.8}}>{new Date().toLocaleDateString("pt-BR")}</div>
            </div>
          )}
        </div>

        {/* ── INFO BANNER ── */}
        <div style={S.infoBanner}>
          <span style={{display:"flex",flexShrink:0,marginTop:1}}>{<Info size={17} color="#185fa5" />}</span>
          <span>O template fica salvo na <strong>memória compartilhada da equipe</strong> — qualquer pessoa com o link vê o mesmo template. Os arquivos xlsx ficam só no seu navegador e não são compartilhados.</span>
        </div>

        {/* ── MESSAGE ── */}
        {msg.text&&<div style={S.msg(msg.type)}>{msg.text}</div>}

        {/* ── CARD 1: TEMPLATE (readonly, gerenciado pelo Supabase) ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>
            <div style={S.cardNum}>1</div>
            <div>
              <span style={S.cardH2}>Template PowerPoint</span>
              <span style={S.cardSub}>Gerenciado pela equipe de Governança · somente leitura</span>
            </div>
          </div>
          {tplLoading?(
            <div style={{display:"flex",alignItems:"center",gap:14,padding:"14px 20px",background:"#f7f9fc",borderRadius:12,border:"1px solid #cfd9ea"}}>
              <Spinner color="#5a6a82" size={20}/>
              <div style={{fontSize:13,color:"#526070"}}>Carregando template do servidor…</div>
            </div>
          ):tplError?(
            <div style={{display:"flex",alignItems:"flex-start",gap:14,padding:"14px 20px",background:"#fdf2f2",borderRadius:12,border:"1px solid #f5c2c2"}}>
              <span style={{flexShrink:0,marginTop:1}}>{<AlertCircle size={22} color="#c0392b" />}</span>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:"#a32d2d"}}>Template indisponível</div>
                <div style={{fontSize:12,color:"#a32d2d",marginTop:3,lineHeight:1.45}}>{tplError}</div>
              </div>
            </div>
          ):(
            <div style={{display:"flex",alignItems:"center",gap:16,padding:"14px 20px",background:"#f0faf5",borderRadius:12,border:"1px solid #b7e4cc"}}>
              <span style={{display:"flex"}}>{<Users size={22} color="#0f6e56" />}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:"#071735"}}>
                  {tplInfo?.name||'report_ras_template.pptx'}
                </div>
                <div style={{fontSize:12,color:"#526070",marginTop:3}}>
                  Salvo na memória da equipe
                  {tplInfo?.updatedAt?` · atualizado em ${new Date(tplInfo.updatedAt).toLocaleDateString("pt-BR")}`:""}
                </div>
              </div>
              <span style={{fontSize:13,color:"#0f6e56",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                {<Check size={13} color="#0f6e56" />} Pronto
              </span>
            </div>
          )}
        </div>

        {/* ── CARD 2: XLSX ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>
            <div style={S.cardNum}>2</div>
            <div>
              <span style={S.cardH2}>Arquivos semanais</span>
              <span style={S.cardSub}>Novos xlsx toda semana</span>
            </div>
          </div>
          <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
            <XlsxCard
              label="Importar Portfólio em .xlsx"
              loaded={!!portBuf}
              fileName={portName}
              status={portStatus}
              onChange={onXlsx(setPortBuf,setPortName,setPortStatus,"Portfólio",true,null)}/>
            <XlsxCard
              label="Importar Melhorias em .xlsx"
              loaded={!!melBuf}
              fileName={melName}
              status={melStatus}
              onChange={onXlsx(setMelBuf,setMelName,setMelStatus,null,false,setMelSheetName)}/>
          </div>
        </div>

        {/* ── CARD 3: PARAMS ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>
            <div style={S.cardNum}>3</div>
            <div>
              <span style={S.cardH2}>Parâmetros</span>
              <span style={S.cardSub}>Líder · Trimestre · Compromisso</span>
            </div>
          </div>
          <div style={S.formGrid}>
            <div>
              <label style={S.label}>Líder Executor / Gerente TI</label>
              {liders.length>0?(
                <select value={params.lider} onChange={onParam("lider")} style={S.select}>
                  <option value="">— Selecione o líder —</option>
                  {liders.map(l=><option key={l} value={l}>{l}</option>)}
                </select>
              ):(
                <select style={{...S.select,color:"#99a3b0"}} disabled>
                  <option>Importe o Portfólio para carregar</option>
                </select>
              )}
            </div>
            <div>
              <label style={S.label}>Trimestre</label>
              <input value={params.trimestre} onChange={onParam("trimestre")} style={S.input} placeholder="2T26"/>
            </div>
            <div>
              <label style={S.label}>Compromisso</label>
              <div style={{...S.select,display:"flex",alignItems:"center",background:"#f0f2f5",color:"#526070",cursor:"default",userSelect:"none"}}>
                Finalização
              </div>
            </div>
          </div>

          {/* ── ACTIONS ── */}
          <div style={S.actions}>
            <button onClick={doPreview} disabled={!canPrev}
              style={canPrev?S.btnPreview:S.btnPreviewDisabled}>
              {previewing
                ? <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner color="#003d8f"/> Processando…</span>
                : <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>{<Eye size={15} color="#003d8f" />} Pré-visualizar</span>
              }
            </button>
            <button onClick={doGenerate} disabled={!canGen}
              style={canGen?S.btnGenerate:S.btnGenerateDisabled}>
              {busy
                ? <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner color="#fff"/> Gerando PPTX…</span>
                : <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>{<Download size={15} color="#fff" />} Gerar e baixar PPTX</span>
              }
            </button>
          </div>

          {/* ── GENERATION STATUS PANEL ── */}
          {genStatus.state!=="idle"&&(
            <div style={{
              marginTop:14,padding:"14px 18px",borderRadius:12,display:"flex",gap:12,alignItems:"flex-start",
              border:genStatus.state==="error"?"1px solid #f5c2c2":genStatus.state==="ok"?"1px solid #b7e4cc":"1px solid #cfd9ea",
              background:genStatus.state==="error"?"#fdf2f2":genStatus.state==="ok"?"#f0faf5":"#f7f9fc",
            }}>
              <div style={{
                width:38,height:38,borderRadius:9,flexShrink:0,
                display:"flex",alignItems:"center",justifyContent:"center",
                background:genStatus.state==="error"?"#c0392b":genStatus.state==="ok"?"#008c35":"#5a6a82",
              }}>
                {genStatus.state==="loading"?<Spinner color="#fff" size={18}/>
                  :genStatus.state==="ok"?<Check size={20} color="#fff" />
                  :<AlertCircle size={20} color="#fff" />}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13,
                  color:genStatus.state==="error"?"#a32d2d":genStatus.state==="ok"?"#0f6e56":"#3a4a63"}}>
                  {genStatus.state==="loading"?"Gerando o PPTX…":genStatus.state==="ok"?"Pronto!":"Não foi possível gerar"}
                </div>
                <div style={{fontSize:12,marginTop:3,lineHeight:1.45,
                  color:genStatus.state==="error"?"#a32d2d":"#526070"}}>
                  {genStatus.msg}
                </div>
                {genStatus.state==="ok"&&genStatus.file?(
                  <div style={{fontSize:11,marginTop:4,color:"#526070",fontStyle:"italic",
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    <span style={{display:"inline-flex",alignItems:"center",gap:3}}>{<Download size={11} color="#526070" />} {genStatus.file}</span>
                  </div>
                ):null}
              </div>
            </div>
          )}
        </div>

        {/* ── PREVIEW ── */}
        {preview&&<PreviewPanel d={preview}/>}
      </div>
    </div>
  );
}

/* ── SUB-COMPONENTS ─────────────────────────────────────────────────────────── */
/* ── SPINNER ─────────────────────────────────────────────────────────────────── */
function Spinner({color="#003d8f",size=16}){
  return <Loader2 size={size} color={color} style={{
    animation:"ras-spin 0.7s linear infinite",
    flexShrink:0,
  }}/>;
}

function XlsxCard({label,loaded,fileName,status,onChange}){
  const st=status||{state:"idle",msg:""};
  const isLoading=st.state==="loading";
  const isError=st.state==="error";
  // Border/background reflect the current state
  const border=isError?"1px solid #f5c2c2":isLoading?"1px solid #cfd9ea":loaded?"1px solid #b7e4cc":"1px solid #ccd6e4";
  const bg=isError?"#fdf2f2":isLoading?"#f7f9fc":loaded?"#f0faf5":"#fff";
  const iconBg=isError?"#c0392b":isLoading?"#5a6a82":"#008c35";
  return(
    <label style={{
      display:"flex",alignItems:"flex-start",gap:14,
      minHeight:loaded||isError||isLoading?76:68,padding:"14px 22px",
      border,borderRadius:12,cursor:isLoading?"wait":"pointer",
      background:bg,userSelect:"none",minWidth:240,maxWidth:330,
      transition:"all 0.2s",
    }}>
      <div style={{
        width:40,height:40,background:iconBg,color:"#fff",
        borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",
        flexShrink:0,
      }}>
        {isLoading?<Spinner color="#fff" size={18}/>:isError?<AlertCircle size={20} color="#fff" />:<Table2 size={18} color="#fff" />}
      </div>
      <div style={{overflow:"hidden",flex:1}}>
        <div style={{fontWeight:600,fontSize:13,color:"#071735"}}>{label}</div>

        {/* file name (when known and not errored) */}
        {fileName&&!isError?(
          <div style={{fontSize:11,marginTop:3,color:"#526070",fontStyle:"italic",
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:230}}>
            <span style={{display:"inline-flex",alignItems:"center",gap:3}}>{<Paperclip size={11} color="#526070" />} {fileName}</span>
          </div>
        ):null}

        {/* status line */}
        {isLoading?(
          <div style={{fontSize:12,marginTop:3,color:"#5a6a82",display:"flex",alignItems:"center",gap:5}}>
            <Spinner color="#5a6a82" size={11}/> Carregando…
          </div>
        ):isError?(
          <div style={{fontSize:12,marginTop:4,color:"#a32d2d",lineHeight:1.4,display:"flex",alignItems:"flex-start",gap:4}}>
            <span style={{flexShrink:0,marginTop:1}}>{<AlertCircle size={12} color="#a32d2d" />}</span>
            <span>{st.msg}</span>
          </div>
        ):loaded?(
          <div style={{fontSize:12,marginTop:3,color:"#0f6e56",display:"inline-flex",alignItems:"center",gap:4}}>
            {<Check size={12} color="#0f6e56" />} Carregado — clique para trocar
          </div>
        ):(
          <div style={{fontSize:12,marginTop:2,color:"#526070"}}>Clique para selecionar</div>
        )}
      </div>
      <input type="file" accept=".xlsx" onChange={onChange} style={{display:"none"}} disabled={isLoading}/>
    </label>
  );
}

function KPIBox({label,value,pct,color}){
  return(
    <div style={{background:"#f8faff",borderRadius:12,padding:"16px 12px",textAlign:"center",border:"1px solid #e5eaf1"}}>
      <div style={{fontSize:11,color:"#526070",fontWeight:600,letterSpacing:"0.05em",marginBottom:6,textTransform:"uppercase"}}>{label}</div>
      <div style={{fontSize:30,fontWeight:800,color,lineHeight:1}}>{value}</div>
      {pct!=null&&<div style={{fontSize:11,color:"#526070",marginTop:5}}>{pct}% do total</div>}
    </div>
  );
}

function PreviewPanel({d}){
  return(
    <div style={S.preview}>
      <div style={S.previewTitle}>
        <span style={{display:"inline-flex",alignItems:"center",gap:7}}>{<TrendingUp size={13} color="#526070" />} Pré-visualização · {d.lider} · {new Date().toLocaleDateString("pt-BR")}</span>
      </div>

      <div style={S.kpiGrid}>
        <KPIBox label="Total" value={d.total_c} pct={null} color="#001b4d"/>
        <KPIBox label="No Prazo" value={d.np_c} pct={d.np_pct} color="#00B050"/>
        <KPIBox label="Alerta" value={d.er_c} pct={d.er_pct} color="#ED7D31"/>
        <KPIBox label="Atrasados" value={d.at_c} pct={d.at_pct} color="#C00000"/>
      </div>

      <div style={S.infoGrid}>
        <div style={S.infoBox}>
          <div style={{...S.infoBoxTitle,display:"flex",alignItems:"center",gap:6}}>{<FolderOpen size={13} color="#071735" />} Projetos Finalização ({d.total_p})</div>
          <div style={S.infoRow}>Entregues: {d.enc_p} ({d.pct_p_str}%)</div>
          <div style={S.infoRow}>Atrasados: {d.at_p} · Alerta: {d.er_p} · OK: {d.np_p}</div>
          <div style={S.infoRow}>Backlog Fin: {d.bl_fin.length} linhas{d.bl_fin.length>20?` · ${Math.ceil(d.bl_fin.length/20)} slides`:""}</div>
          <div style={S.infoRow}>Backlog EA: {d.bl_ea.length} linhas</div>
        </div>
        <div style={S.infoBox}>
          <div style={{...S.infoBoxTitle,display:"flex",alignItems:"center",gap:6}}>{<Wrench size={13} color="#071735" />} Melhorias ({d.total_m})</div>
          <div style={S.infoRow}>Finalizadas: {d.fin_m} ({d.pct_m_str}%)</div>
          <div style={S.infoRow}>Atrasadas: {d.at_m} · Alerta: {d.er_m} · OK: {d.np_m}</div>
          <div style={S.infoRow}>Backlog Mel: {d.bl_mel.length} linhas{d.bl_mel.length>20?` · ${Math.ceil(d.bl_mel.length/20)} slides`:""}</div>
        </div>
      </div>

      {(d.atraso_proj.length>0||d.atraso_mel.length>0)&&(
        <div style={{marginBottom:14}}>
          <div style={S.sectionLabel("#C00000")}>
            <span style={{display:"inline-flex",alignItems:"center",gap:6}}>{<AlertCircle size={13} color="#C00000" />} Entregas em Atraso ({d.atraso_proj.length+d.atraso_mel.length})</span>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {[...d.atraso_proj.map(r=>`${r.lecom} · ${r.target} (proj)`),...d.atraso_mel.map(r=>`${r.lecom} · ${r.target} (mel)`)].map((s,i)=>(
              <span key={i} style={S.chipRed}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {(d.prx_proj.length>0||d.prx_mel.length>0)&&(
        <div>
          <div style={S.sectionLabel("#ED7D31")}>
            <span style={{display:"inline-flex",alignItems:"center",gap:6}}>{<AlertTriangle size={13} color="#ED7D31" />} Entregas Próximas — 5 dias ({d.prx_proj.length+d.prx_mel.length})</span>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {[...d.prx_proj.map(r=>`${r.lecom} · ${r.target}`),...d.prx_mel.map(r=>`${r.lecom} · ${r.target}`)].map((s,i)=>(
              <span key={i} style={S.chipOrange}>{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
