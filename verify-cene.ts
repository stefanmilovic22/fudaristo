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

// --- po oceni ---
import { suggestPriceByRating } from "./lib/price-rules";
const r = (o: Partial<Parameters<typeof suggestPriceByRating>[0]>) =>
  suggestPriceByRating({ price: 7, recent: [8.2], prior: [6.9, 7.0, 6.8, 7.1], leagueMean: 6.6, t1: 0.8, t2: 1.5, ...o });
eq("ocena +1.3 → +0.1", r({})?.delta, 0.1);
eq("ocena +2.0 → +0.2", r({ recent: [9.0] })?.delta, 0.2);
eq("ocena +0.5 → ništa", r({ recent: [7.4] }), null);
eq("ocena -1.0 → -0.1", r({ recent: [5.9] })?.delta, -0.1);
eq("ocena -2.0 → -0.2", r({ recent: [4.9] })?.delta, -0.2);
eq("bez mečeva → ništa", r({ recent: [] }), null);
eq("min mečeva 2, ima 1 → ništa", r({ recent: [9.0], minMatches: 2 }), null);
eq("premalo istorije → prosek lige", r({ prior: [7.5], recent: [7.5] })?.baseline, 6.6);
eq("dno 4.0 ne pada", r({ price: 4.0, recent: [4.9] }), null);
eq("vrh 15.0 ne raste", r({ price: 15.0, recent: [9.0] }), null);
eq("prosek više mečeva", r({ recent: [8.0, 8.6] })?.recentAvg, 8.3);
