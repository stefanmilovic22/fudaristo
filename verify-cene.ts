// Provera pravila predloga cena (lib/price-rules.ts). Pokretanje: npx tsx verify-cene.ts
import { suggestPrice, countTransfers } from "./lib/price-rules";
const eq=(n:string,a:unknown,b:unknown)=>console.log(JSON.stringify(a)===JSON.stringify(b)?"OK  ":"FAIL",n,JSON.stringify(a));
eq("net 5 → +0.1",suggestPrice(7,5,5,0.1),{delta:0.1,newPrice:7.1});
eq("net 4 → ništa",suggestPrice(7,4,5,0.1),null);
eq("net -5 → -0.1",suggestPrice(7.5,-5,5,0.1),{delta:-0.1,newPrice:7.4});
eq("dno 4.0 ne pada",suggestPrice(4.0,-9,5,0.1),null);
eq("vrh 15.0 ne raste",suggestPrice(15.0,9,5,0.1),null);
eq("zaokruživanje 6.7+0.1",suggestPrice(6.7,6,5,0.1)?.newPrice,6.8);
const c=countTransfers([{player_in_id:"a",player_out_id:"b"},{player_in_id:"a",player_out_id:"c"}]);
eq("brojanje",[c.ins.get("a"),c.outs.get("b"),c.outs.get("c")],[2,1,1]);
