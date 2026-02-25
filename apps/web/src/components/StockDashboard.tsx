export default function StockDashboard({
  stock,
}: {
  stock: Record<string, number>;
}) {
  return (
    <div>
      <h2>Stock (DEBUG)</h2>
      <pre>{JSON.stringify(stock, null, 2)}</pre>
    </div>
  );
}


