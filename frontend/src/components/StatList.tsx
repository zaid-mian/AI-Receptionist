/** Simple key/value list used for settings summaries and meta panels. */
export default function StatList({ items }: { items: { k: string; v: React.ReactNode }[] }) {
  return (
    <div className="kv-list">
      {items.map((item) => (
        <div className="kv-row" key={item.k}>
          <span className="k">{item.k}</span>
          <span className="v">{item.v}</span>
        </div>
      ))}
    </div>
  );
}
