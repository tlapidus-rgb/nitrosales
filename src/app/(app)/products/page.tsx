{wowRevenuePct.toFixed(1)}%</span>
      </div>
    );
  } else if (wowRevenuePct < -5) {
    return (
      <div className="flex items-center gap-1 text-red-600 font-medium">
        <TrendingDown className="w-4 h-4" />
        <span>{wowRevenuePct.toFixed(1)}%</span>
      </div>
    );
  } else {
    return (
      <div className="flex items-center gap-1 text-gray-500 font-medium">
        <span className="text-lg">−</span>
        <span>{wowRevenuePct.toFixed(1)}%</span>
      </div>
    );
  }
}

function StockBadge({ daysOfStock, stockHealth }: { daysOfStock: number | null; stockHealth: string | null }) {
  let bgColor = "bg-gray-100 text-gray-700";
  if (stockHealth === "critical") bgColor = "bg-red-100 text-red-700 font-semibold";
  else if (stockHealth === "low") bgColor = "bg-amber-100 text-amber-700 font-semibold";
  else if (stockHealth === "optimal") bgColor = "bg-green-100 text-green-700";
  else if (stockHealth === "excessive") bgColor = "bg-blue-100 text-blue-700";

  const days = daysOfStock ?? 0;
  return <span className={`px-2 py-1 text-xs rounded-md ${bgColor}`}>{days}d</span>;
}

function ABCBadge({ abcClass }: { abcClass: string }) {
  let bgColor = "bg-green-100 text-green-700";
  if (abcClass === "B") bgColor = "bg-amber-100 text-amber-700";
  else if (abcClass === "C") bgColor = "bg-gray-100 text-gray-700";

  return <span className={`px-2 py-1 text-xs font-bold rounded-md ${bgColor}`}>{abcClass}</span>;
}

export default function ProductsPageV4() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [stockSummary, setStockSummary] = useState<StockSummary | null>(null);
  const [trendSummary, setTrendSummary] = useState<TrendSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "trends" | "stock">("overview");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/metrics/products");
        const data: ApiResponse = await response.json();
        setProducts(data.products);
        setStockSummary(data.stockSummary);
        setTrendSummary(data.trendSummary);
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Apply filters
  const filtered = useMemo(() => {
    reth>
                      <th className="px-6 py-3 text-right font-semibold text-gray-700">
                        Velocidad
                      </th>
                      <th className="px-6 py-3 text-center font-semibold text-gray-700">
                        Días Restantes
                      </th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-700">
                        Fecha Quiebre
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {stockAlerts.map((product) => {
                      const bgClass =
                        product.stockData.stockHealth === "critical"
                          ? "bg-red-50"
                          : "bg-amber-50";
                      return (
                        <tr key={product.id} className={bgClass}>
                          <td className="px-6 py-4 flex items-center gap-3">
                            {product.imageUrl && (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="w-8 h-8 rounded object-cover"
                              />
                            )}
                            <div>
                              <div className="font-medium text-gray-900">
                                {product.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {product.sku || "—"}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-gray-900">
                            {product.stock ?? 0}
                          </td>
                          <td className="px-6 py-4 text-right text-gray-700">
                            {product.stockData.dailySalesRate.toFixed(1)}{" "}
                            uds/día
                          </td>
                          <td className="px-6 py-4 text-center">
                            <StockBadge
                              daysOfStock={product.stockData.daysOfStock}
                              stockHealth={product.stockData.stockHealth}
                            />
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                                               <tr key={product.id} className="hover:bg-red-100/50">
                          <td className="px-6 py-4 flex items-center gap-3">
                            {product.imageUrl && (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="w-8 h-8 rounded object-cover"
                              />
                            )}
                            <div>
                              <div className="font-medium text-red-900">
                                {product.name}
                              </div>
                              <div className="text-xs text-red-700">
                                {product.sku || "—"}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-red-900">
                            {product.stock ?? 0}
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-red-600">
                            {formatARS(
                              (product.stock ?? 0) * product.avgPrice
                            )}
                          </td>
                          <td className="px-6 py-4 text-red-700">
                            {lastSaleDate
                              ? lastSaleDate.toLocaleDateString("es-AR")
                              : "—"}
                          </td>
                          <td className="px-6 py-4 text-right text-red-900 font-semibold">
                            {daysNoSale ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Inventory Health */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">
              Salud General del Inventario
            </h3>
            <div className="grid grid-cols-3 gap-6">
              <div className="flex justify-center">
                <ResponsiveContainer width={250} height={250}>
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {distributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="col-span-2 space-y-3">
                {distributionData.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm font-medium text-gray-900">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900">
                        {item.value}
                      </span>
                      <span className="text-xs text-gray-600">
                        (
                        {(
                          (item.value /
                            distributionData.reduce((sum, d) => sum + d.value, 0)) *
                          100
                        ).toFixed(1)}
                        %)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
}
th>
                      <th className="px-6 py-3 text-right font-semibold text-gray-700">
                        Velocidad
                      </th>
                      <th className="px-6 py-3 text-center font-semibold text-gray-700">
                        Días Restantes
                      </th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-700">
                        Fecha Quiebre
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {stockAlerts.map((product) => {
                      const bgClass =
                        product.stockData.stockHealth === "critical"
                          ? "bg-red-50"
                          : "bg-amber-50";
                      return (
                        <tr key={product.id} className={bgClass}>
                          <td className="px-6 py-4 flex items-center gap-3">
                            {product.imageUrl && (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="w-8 h-8 rounded object-cover"
                              />
                            )}
                            <div>
                              <div className="font-medium text-gray-900">
                                {product.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {product.sku || "—"}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-gray-900">
                            {product.stock ?? 0}
                          </td>
                          <td className="px-6 py-4 text-right text-gray-700">
                            {product.stockData.dailySalesRate.toFixed(1)}{" "}
                            uds/día
                          </td>
                          <td className="px-6 py-4 text-center">
                            <StockBadge
                              daysOfStock={product.stockData.daysOfStock}
                              stockHealth={product.stockData.stockHealth}
                            />
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                        