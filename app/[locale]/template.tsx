/**
 * Za razliku od layout-a, template se ponovo montira pri SVAKOJ promeni
 * stranice (i promeni kola u ?kolo=N), pa sadržaj blago „uplovi" umesto da
 * naglo promeni. Animacija je kratka i gasi se za korisnike koji su isključili
 * animacije u sistemu (videti globals.css).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
