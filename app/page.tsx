import Link from "next/link";

export default function HomePage() {
  return (
    <section className="flex flex-col items-start gap-6 py-16">
      <h1 className="font-display text-4xl font-semibold max-w-lg leading-tight">
        Vodi svoj klub kroz grčku Super League.
      </h1>
      <p className="text-slate-300 max-w-md leading-relaxed">
        Sastavi tim, biraj kapitena, prati svakog igrača kroz sezonu — kao
        pravi trener, ne samo posmatrač.
      </p>
      <Link
        href="/register"
        className="bg-gold-400 text-navy-950 font-bold text-sm px-6 py-3 rounded-lg"
      >
        Napravi svoj klub
      </Link>
    </section>
  );
}
