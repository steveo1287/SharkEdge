export default async function Page() {
  const res = await fetch("https://shark-odds-1.onrender.com/api/signals/demo", {
    cache: "no-store",
  });

  const data = await res.json();

  return (
    <div style={{ padding: 40, fontFamily: "Arial" }}>
      <h1>🦈 Shark Odds</h1>

      <div style={{ marginTop: 20 }}>
        <h2>{data.selection}</h2>
        <p>Edge: {data.edge_pct}%</p>
        <p>EV: {data.ev}</p>
      </div>
    </div>
  );
}
